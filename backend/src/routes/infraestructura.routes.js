'use strict';
const express=require('express');
const {timingSafeEqual}=require('node:crypto');
const {autenticarToken}=require('../middlewares/auth.middleware');
const {autorizarRoles}=require('../middlewares/roles.middleware');
const state=require('../services/infraestructura-state.service');
const router=express.Router();
const admin=autorizarRoles('ADMINISTRADOR','SUPER_ADMIN');
router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
router.get('/estado',autenticarToken,admin,async(_req,res)=>{
  try {
  const sync=require('../services/zkteco-autosync.service').getZktecoAutoSyncStatus();
  res.json({ok:true,...await state.status(),autoSync:{ultimoIntento:sync.lastRun,ultimoExito:sync.lastSuccessAt,fallos:sync.consecutiveFailures,ejecutando:sync.running}});
  }catch(_){res.status(503).json({ok:false,message:'Estado de infraestructura no disponible en MySQL'});}
});
router.post('/zkteco/reintentar',autenticarToken,admin,async(_req,res)=>{
  try{res.json({ok:true,diagnostico:await state.retryZkteco(),...await state.status()});}
  catch(_){res.status(503).json({ok:false,message:'No se completó el diagnóstico desde Hostinger'});}
});
router.get('/zkteco/logs',autenticarToken,admin,async(_req,res)=>{
  try{
    const rows=await require('../services/zkteco-error-log.service').listZkErrors({limit:30});
    const category=error=>{
      const value=String(error||'').toLowerCase();
      if(/contrase|password|credencial/.test(value))return 'Error de autenticación del controlador';
      if(/timeout|tiempo de espera|no respondió/.test(value))return 'Tiempo de espera agotado';
      if(/conexión|socket|econn|enet|tcp/.test(value))return 'Error de conexión TCP';
      if(/inventario|lectura/.test(value))return 'Error de lectura de inventario';
      return 'Error registrado; consultar diagnóstico del ZKTeco';
    };
    res.json({ok:true,data:rows.map(row=>({fecha:row.createdAt,accion:row.accion,error:category(row.error)}))});
  }catch(_){res.status(503).json({ok:false,message:'No se pudieron consultar los logs históricos del ZKTeco'});}
});
router.post('/orden',autenticarToken,admin,async(req,res)=>{
  if(!['DIAGNOSTICO','CONMUTADOR','ZKTECO','TODOS'].includes(req.body?.accion))return res.sendStatus(400);
  try{
    const result=await state.queue(req.body.accion,req.usuario.usuarioId);
    return res.status(result.error?409:202).json({ok:!result.error,...result});
  }catch(_){return res.status(503).json({ok:false,message:'No se pudo guardar la orden en MySQL'});}
});
router.post('/agente',async(req,res)=>{
  const key=process.env.INFRA_AGENT_TOKEN||'';
  const expected=Buffer.from('Bearer '+key), actual=Buffer.from(req.get('Authorization')||'');
  if(!state.configured()||expected.length!==actual.length||!timingSafeEqual(expected,actual))return res.sendStatus(401);
  const ip=state.normalizeIP(req.ip);
  // No aceptar destinos arbitrarios ni IP privada; debe coincidir con el origen
  // observado por el proxy de Hostinger (trust proxy 1, ingress único).
  if(!state.publicIP(ip)||ip!==req.body?.ip){
    // Solo después de autenticar al agente. Registrar únicamente valores IP,
    // nunca cabeceras completas, credenciales ni el cuerpo de la solicitud.
    const {isIP}=require('node:net');
    const safeIP=value=>{
      const normalized=state.normalizeIP(String(value||'').trim());
      return isIP(normalized)?normalized:null;
    };
    const reported=safeIP(req.body?.ip);
    const observed=safeIP(ip);
    const reason=!state.publicIP(reported)?'IP_REPORTADA_INVALIDA':!state.publicIP(ip)?'ORIGEN_NO_IPV4_PUBLICA':'IP_NO_COINCIDE';
    const forwarded=String(req.get('X-Forwarded-For')||'').split(',').slice(-8).map(safeIP).filter(Boolean);
    console.warn('infraestructura_agente_422',JSON.stringify({
      motivo:reason,ipReportada:reported,ipObservada:observed,
      ipSocket:safeIP(req.socket?.remoteAddress),cadenaProxyNoVerificada:forwarded
    }));
    return res.status(422).json({ok:false,message:'La IP reportada no coincide con el origen público observado',motivo:reason,ipReportada:reported,ipObservada:observed});
  }
  const equipos={};
  for(const name of ['vm','asterisk','agente','grandstream','zkteco']){
    const value=req.body?.equipos?.[name];
    equipos[name]=typeof value==='boolean'?value:null;
  }
  const incoming=req.body?.detalles||{};
  const detalles={};
  for(const key of ['asteriskEnabled','agenteEnabled','asteriskCli','sip6001','sip6002']){
    detalles[key]=typeof incoming[key]==='boolean'?incoming[key]:null;
  }
  for(const key of ['erroresAsterisk','erroresAgente']){
    detalles[key]=Number.isInteger(incoming[key])&&incoming[key]>=0&&incoming[key]<=30?incoming[key]:null;
  }
  for(const key of ['ubuntu','zkLocal','grandstream']){
    detalles[key]=typeof incoming[key]==='string'&&require('node:net').isIPv4(incoming[key])?incoming[key]:null;
  }
  try { return res.json({ok:true,...await state.report(ip,equipos,req.body?.resultado,undefined,detalles)}); }
  catch(_){return res.status(503).json({ok:false,message:'Diagnóstico temporalmente no disponible'});}
});
module.exports=router;
