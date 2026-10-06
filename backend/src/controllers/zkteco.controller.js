const crypto=require('crypto');
const {Op}=require('sequelize');
const ZkTarjeta=require('../models/ZkTarjeta');
const ZkGateCommand=require('../models/ZkGateCommand');
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
async function estado(req,res){
  const gateway=await ZkGatewayState.findByPk('principal');
  const ultima=gateway?.ultimaSenal?new Date(gateway.ultimaSenal):null;
  const online=Boolean(ultima&&(Date.now()-ultima.getTime())<45000);
  res.json({ok:true,data:{
    modelo:'C3-200',
    host:process.env.ZKTECO_HOST||'192.168.1.201',
    puerto:Number(process.env.ZKTECO_PORT||4370),
    modo:'GATEWAY',
    salidasAbrir:parseOutputs('ABRIR'),
    salidasCerrar:parseOutputs('CERRAR'),
    gatewayOnline:online,
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
  const rows=await ZkTarjeta.findAll({order:[['departamento','ASC'],['numeroTarjeta','ASC']],limit:2000});
  res.json({ok:true,total:rows.length,data:rows});
}
async function importarLectura(req,res){
  const usuarios=Array.isArray(req.body.usuarios)?req.body.usuarios:[];
  if(usuarios.length>2000)return res.status(400).json({ok:false,message:'Máximo 2000 registros por lote'});
  const n=await guardarInventario(usuarios);
  res.json({ok:true,procesados:n});
}
async function simular(req,res){res.json({ok:true,data:await simularCorte(new Date())});}

async function solicitarPluma(req,res){
  const accion=String(req.body.accion||'').toUpperCase();
  if(!['ABRIR','CERRAR'].includes(accion))return res.status(400).json({ok:false,message:'Acción no válida'});
  const salidas=parseOutputs(accion);
  if(!salidas.length){
    const variable=accion==='CERRAR'?'ZKTECO_GATE_CLOSE_OUTPUTS':'ZKTECO_GATE_OPEN_OUTPUTS';
    return res.status(503).json({ok:false,message:`Configura ${variable} después de confirmar el cableado físico`});
  }
  const gateway=await ZkGatewayState.findByPk('principal');
  const ultima=gateway?.ultimaSenal?new Date(gateway.ultimaSenal):null;
  if(!ultima||Date.now()-ultima.getTime()>45000)return res.status(503).json({ok:false,message:'Gateway local ZKTeco sin conexión'});
  const pulso=Math.max(1,Math.min(30,Number(process.env.ZKTECO_GATE_PULSE_SECONDS||3)));
  const comando=await ZkGateCommand.create({
    accion,
    salidasJson:JSON.stringify(salidas),
    pulsoSegundos:pulso,
    solicitadoPorUsuarioId:req.usuario?.usuarioId||null
  });
  res.status(202).json({ok:true,message:accion==='ABRIR'?'Solicitud de apertura enviada':'Solicitud de cierre enviada',data:{id:comando.id,accion,estatus:comando.estatus}});
}

async function estadoComando(req,res){
  const c=await ZkGateCommand.findByPk(req.params.id);
  if(!c)return res.status(404).json({ok:false,message:'Comando no encontrado'});
  res.json({ok:true,data:{id:c.id,accion:c.accion,estatus:c.estatus,resultado:c.resultadoJson?JSON.parse(c.resultadoJson):null,creadoEn:c.creadoEn,finalizadoEn:c.finalizadoEn}});
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
  res.json({ok:true,data:{id:c.id,accion:c.accion,salidas:JSON.parse(c.salidasJson||'[]'),pulsoSegundos:c.pulsoSegundos}});
}

async function finalizarComando(req,res){
  const c=await ZkGateCommand.findByPk(req.params.id);
  if(!c)return res.status(404).json({ok:false,message:'Comando no encontrado'});
  const ok=Boolean(req.body.ok);
  await c.update({estatus:ok?'COMPLETADO':'ERROR',resultadoJson:JSON.stringify(req.body.resultado||{}),finalizadoEn:new Date()});
  res.json({ok:true});
}

module.exports={requireGateway,estado,inventario,importarLectura,simular,solicitarPluma,estadoComando,heartbeat,siguienteComando,finalizarComando};
