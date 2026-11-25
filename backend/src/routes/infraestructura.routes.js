'use strict';
const express=require('express');
const {timingSafeEqual}=require('node:crypto');
const {autenticarToken}=require('../middlewares/auth.middleware');
const {autorizarRoles}=require('../middlewares/roles.middleware');
const state=require('../services/infraestructura-state.service');
const router=express.Router();
const admin=autorizarRoles('ADMINISTRADOR','SUPER_ADMIN');
router.use((_req,res,next)=>{res.set('Cache-Control','private, no-store');next();});
router.get('/estado',autenticarToken,admin,(_req,res)=>res.json({ok:true,...state.status()}));
router.post('/orden',autenticarToken,admin,(req,res)=>{
  if(!['DIAGNOSTICO','CONMUTADOR','ZKTECO','TODOS'].includes(req.body?.accion))return res.sendStatus(400);
  const result=state.queue(req.body.accion,req.usuario.usuarioId);
  return res.status(result.error?409:202).json({ok:!result.error,...result});
});
router.post('/agente',async(req,res)=>{
  const key=process.env.INFRA_AGENT_TOKEN||'';
  const expected=Buffer.from('Bearer '+key), actual=Buffer.from(req.get('Authorization')||'');
  if(!state.configured()||expected.length!==actual.length||!timingSafeEqual(expected,actual))return res.sendStatus(401);
  const ip=state.normalizeIP(req.ip);
  // No aceptar destinos arbitrarios ni IP privada; debe coincidir con el origen
  // observado por el proxy de Hostinger (trust proxy 1, ingress único).
  if(!state.publicIP(ip)||ip!==req.body?.ip)return res.status(422).json({ok:false,message:'La IP reportada no coincide con el origen público observado'});
  const equipos={};
  for(const name of ['vm','asterisk','agente','grandstream','zkteco']){
    const value=req.body?.equipos?.[name];
    equipos[name]=typeof value==='boolean'?value:null;
  }
  try { return res.json({ok:true,...await state.report(ip,equipos,req.body?.resultado)}); }
  catch(_){return res.status(503).json({ok:false,message:'Diagnóstico temporalmente no disponible'});}
});
module.exports=router;
