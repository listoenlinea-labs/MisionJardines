const crypto=require('crypto');
const {Op}=require('sequelize');
const ZkTarjeta=require('../models/ZkTarjeta');
const ZkGateCommand=require('../models/ZkGateCommand');
const ZkAccessCommand=require('../models/ZkAccessCommand');
const ZkGatewayState=require('../models/ZkGatewayState');
const {guardarInventario,simularCorte}=require('../services/zkteco-read.service');

function parseOutputs(accion){
  const envName=accion==='CERRAR'?'ZKTECO_GATE_CLOSE_OUTPUTS':'ZKTECO_GATE_OPEN_OUTPUTS';
  return String(process.env[envName]||'')
    .split(',').map(v=>Number(v.trim())).filter(v=>Number.isInteger(v)&&v>=1&&v<=4);
}
function gatewayAuthorized(req){
  const expected=String(process.env.ZK_GATEWAY_TOKEN||'');
  const provided=String(req.get('x-zk-gateway-token')||'');
  if(!expected||!provided||expected.length!==provided.length)return false;
  return crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(provided));
}
function requireGateway(req,res,next){
  if(!gatewayAuthorized(req))return res.status(401).json({ok:false,message:'Gateway no autorizado'});
  next();
}
function parseJson(value,fallback={}){
  try{return value?JSON.parse(value):fallback}catch{return fallback}
}
function gatewayOnline(gateway){
  const ultima=gateway?.ultimaSenal?new Date(gateway.ultimaSenal):null;
  return Boolean(ultima&&(Date.now()-ultima.getTime())<45000);
}
async function estado(req,res){
  const gateway=await ZkGatewayState.findByPk('principal');
  res.json({ok:true,data:{
    modelo:'C3-200',
    host:process.env.ZKTECO_HOST||'192.168.1.201',
    puerto:Number(process.env.ZKTECO_PORT||4370),
    modo:'GATEWAY_REMOTO',
    salidasAbrir:parseOutputs('ABRIR'),
    salidasCerrar:parseOutputs('CERRAR'),
    gatewayOnline:gatewayOnline(gateway),
    dispositivoConectado:Boolean(gateway?.dispositivoConectado),
    ultimaSenal:gateway?.ultimaSenal||null,
    serial:gateway?.serial||null,
    firmware:gateway?.firmware||null,
    lockCount:gateway?.lockCount??null,
    ultimoError:gateway?.ultimoError||null,
    tarjetas:await ZkTarjeta.count()
  }});
}
async function inventario(req,res){
  const q=String(req.query.buscar||'').trim();
  const where=q?{[Op.or]:[
    {numeroTarjeta:{[Op.like]:`%${q}%`}},
    {zkPin:{[Op.like]:`%${q}%`}},
    {departamento:{[Op.like]:`%${q}%`}}
  ]}:{};
  const rows=await ZkTarjeta.findAll({where,order:[['departamento','ASC'],['numeroTarjeta','ASC']],limit:2000});
  res.json({ok:true,total:rows.length,data:rows});
}
async function importarLectura(req,res){
  const usuarios=Array.isArray(req.body.usuarios)?req.body.usuarios:[];
  if(usuarios.length>2000)return res.status(400).json({ok:false,message:'Máximo 2000 registros por lote'});
  const n=await guardarInventario(usuarios);
  res.json({ok:true,procesados:n});
}
async function simular(req,res){res.json({ok:true,data:await simularCorte(new Date())});}

async function solicitarSincronizacion(req,res){
  const gateway=await ZkGatewayState.findByPk('principal');
  if(!gatewayOnline(gateway))return res.status(503).json({ok:false,message:'Gateway local ZKTeco sin conexión'});
  const command=await ZkAccessCommand.create({
    tipo:'SINCRONIZAR_USUARIOS',
    payloadJson:'{}',
    solicitadoPorUsuarioId:req.usuario?.usuarioId||null
  });
  res.status(202).json({ok:true,message:'Sincronización solicitada',data:{id:command.id,estatus:command.estatus}});
}
async function actualizarVigencia(req,res){
  const tarjeta=await ZkTarjeta.findByPk(req.params.id);
  if(!tarjeta)return res.status(404).json({ok:false,message:'Tarjeta no encontrada'});
  const fechaInicio=String(req.body.fechaInicio||'').trim()||null;
  const fechaFin=String(req.body.fechaFin||'').trim()||null;
  const dateOk=v=>!v||/^\d{4}-\d{2}-\d{2}$/.test(v);
  if(!dateOk(fechaInicio)||!dateOk(fechaFin))return res.status(400).json({ok:false,message:'Usa fechas YYYY-MM-DD'});
  const gateway=await ZkGatewayState.findByPk('principal');
  if(!gatewayOnline(gateway))return res.status(503).json({ok:false,message:'Gateway local ZKTeco sin conexión'});
  const command=await ZkAccessCommand.create({
    tipo:'ACTUALIZAR_VIGENCIA',
    tarjetaId:tarjeta.id,
    payloadJson:JSON.stringify({numeroTarjeta:tarjeta.numeroTarjeta,fechaInicio,fechaFin}),
    solicitadoPorUsuarioId:req.usuario?.usuarioId||null
  });
  res.status(202).json({ok:true,message:'Cambio enviado al ZKTeco',data:{id:command.id,estatus:command.estatus}});
}
async function vincularCasa(req,res){
  const tarjeta=await ZkTarjeta.findByPk(req.params.id);
  if(!tarjeta)return res.status(404).json({ok:false,message:'Tarjeta no encontrada'});
  const casaId=req.body.casaId==null||req.body.casaId===''?null:Number(req.body.casaId);
  if(casaId!==null&&(!Number.isInteger(casaId)||casaId<=0))return res.status(400).json({ok:false,message:'Vivienda no válida'});
  await tarjeta.update({casaId});
  res.json({ok:true,message:'Tarjeta vinculada correctamente',data:tarjeta});
}
async function estadoAccesoComando(req,res){
  const c=await ZkAccessCommand.findByPk(req.params.id);
  if(!c)return res.status(404).json({ok:false,message:'Comando no encontrado'});
  res.json({ok:true,data:{id:c.id,tipo:c.tipo,estatus:c.estatus,resultado:parseJson(c.resultadoJson,null),creadoEn:c.creadoEn,finalizadoEn:c.finalizadoEn}});
}

async function solicitarPluma(req,res){
  const accion=String(req.body.accion||'').toUpperCase();
  if(!['ABRIR','CERRAR'].includes(accion))return res.status(400).json({ok:false,message:'Acción no válida'});
  const salidas=parseOutputs(accion);
  if(!salidas.length){
    const variable=accion==='CERRAR'?'ZKTECO_GATE_CLOSE_OUTPUTS':'ZKTECO_GATE_OPEN_OUTPUTS';
    return res.status(503).json({ok:false,message:`Configura ${variable} para operar la pluma`});
  }
  const gateway=await ZkGatewayState.findByPk('principal');
  if(!gatewayOnline(gateway))return res.status(503).json({ok:false,message:'Gateway local ZKTeco sin conexión'});
  const pulso=Math.max(1,Math.min(30,Number(process.env.ZKTECO_GATE_PULSE_SECONDS||3)));
  const comando=await ZkGateCommand.create({
    accion,salidasJson:JSON.stringify(salidas),pulsoSegundos:pulso,
    solicitadoPorUsuarioId:req.usuario?.usuarioId||null
  });
  res.status(202).json({ok:true,message:accion==='ABRIR'?'Solicitud de apertura enviada':'Solicitud de cierre enviada',data:{id:comando.id,accion,estatus:comando.estatus}});
}
async function estadoComando(req,res){
  const c=await ZkGateCommand.findByPk(req.params.id);
  if(!c)return res.status(404).json({ok:false,message:'Comando no encontrado'});
  res.json({ok:true,data:{id:c.id,accion:c.accion,estatus:c.estatus,resultado:parseJson(c.resultadoJson,null),creadoEn:c.creadoEn,finalizadoEn:c.finalizadoEn}});
}
async function heartbeat(req,res){
  await ZkGatewayState.upsert({
    clave:'principal',
    ultimaSenal:new Date(),
    dispositivoConectado:Boolean(req.body.dispositivoConectado),
    serial:req.body.serial?String(req.body.serial).slice(0,120):null,
    firmware:req.body.firmware?String(req.body.firmware).slice(0,120):null,
    lockCount:Number.isInteger(Number(req.body.lockCount))?Number(req.body.lockCount):null,
    ultimoError:req.body.ultimoError?String(req.body.ultimoError).slice(0,2000):null
  });
  res.json({ok:true});
}
async function siguienteComando(req,res){
  const stale=new Date(Date.now()-60000);
  await ZkGateCommand.update({estatus:'PENDIENTE',tomadoEn:null},{where:{estatus:'PROCESANDO',tomadoEn:{[Op.lt]:stale}}});
  const c=await ZkGateCommand.findOne({where:{estatus:'PENDIENTE'},order:[['id','ASC']]});
  if(!c)return res.status(204).end();
  await c.update({estatus:'PROCESANDO',tomadoEn:new Date()});
  res.json({ok:true,data:{id:c.id,accion:c.accion,salidas:parseJson(c.salidasJson,[]),pulsoSegundos:c.pulsoSegundos}});
}
async function finalizarComando(req,res){
  const c=await ZkGateCommand.findByPk(req.params.id);
  if(!c)return res.status(404).json({ok:false,message:'Comando no encontrado'});
  const ok=Boolean(req.body.ok);
  await c.update({estatus:ok?'COMPLETADO':'ERROR',resultadoJson:JSON.stringify(req.body.resultado||{}),finalizadoEn:new Date()});
  res.json({ok:true});
}
async function siguienteAcceso(req,res){
  const stale=new Date(Date.now()-120000);
  await ZkAccessCommand.update({estatus:'PENDIENTE',tomadoEn:null},{where:{estatus:'PROCESANDO',tomadoEn:{[Op.lt]:stale}}});
  const c=await ZkAccessCommand.findOne({where:{estatus:'PENDIENTE'},order:[['id','ASC']]});
  if(!c)return res.status(204).end();
  await c.update({estatus:'PROCESANDO',tomadoEn:new Date()});
  res.json({ok:true,data:{id:c.id,tipo:c.tipo,payload:parseJson(c.payloadJson,{})}});
}
async function finalizarAcceso(req,res){
  const c=await ZkAccessCommand.findByPk(req.params.id);
  if(!c)return res.status(404).json({ok:false,message:'Comando no encontrado'});
  const ok=Boolean(req.body.ok);
  const resultado=req.body.resultado||{};
  if(ok&&c.tipo==='SINCRONIZAR_USUARIOS'&&Array.isArray(resultado.usuarios)){
    await guardarInventario(resultado.usuarios);
  }
  if(ok&&c.tipo==='ACTUALIZAR_VIGENCIA'&&c.tarjetaId){
    const payload=parseJson(c.payloadJson,{});
    const tarjeta=await ZkTarjeta.findByPk(c.tarjetaId);
    if(tarjeta)await tarjeta.update({fechaInicio:payload.fechaInicio||null,fechaFin:payload.fechaFin||null,ultimaLectura:new Date()});
  }
  await c.update({estatus:ok?'COMPLETADO':'ERROR',resultadoJson:JSON.stringify(resultado),finalizadoEn:new Date()});
  res.json({ok:true});
}

module.exports={
  requireGateway,estado,inventario,importarLectura,simular,
  solicitarSincronizacion,actualizarVigencia,vincularCasa,estadoAccesoComando,
  solicitarPluma,estadoComando,heartbeat,siguienteComando,finalizarComando,
  siguienteAcceso,finalizarAcceso
};
