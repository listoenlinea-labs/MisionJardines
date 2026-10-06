const ZkTarjeta=require('../models/ZkTarjeta');
const {
  testDirectConnection,
  syncUsers,
  setCardBlocked,
  operateGate,
  dashboard,
  writeUserValidity
}=require('../services/zkteco-direct.service');
const {simularCorte}=require('../services/zkteco-read.service');

async function estado(req,res){
  try{
    const info=await testDirectConnection();
    res.json({ok:true,data:{
      ...info,
      modelo:'C3-200',
      modo:'DIRECT',
      conexionDirecta:true,
      tarjetas:await ZkTarjeta.count()
    }});
  }catch(error){
    res.status(503).json({ok:false,message:'No fue posible conectar directamente con el ZKTeco',error:error.message});
  }
}
async function inventario(req,res){
  const rows=await ZkTarjeta.findAll({order:[['departamento','ASC'],['numeroTarjeta','ASC']],limit:2000});
  res.json({ok:true,total:rows.length,data:rows});
}
async function sincronizar(req,res){
  try{res.json({ok:true,data:await syncUsers(),message:'Usuarios sincronizados desde el C3-200'});}
  catch(error){res.status(502).json({ok:false,message:'No fue posible sincronizar el C3-200',error:error.message});}
}
async function bloquear(req,res){
  try{
    const blocked=Boolean(req.body.bloqueado);
    const data=await setCardBlocked(req.params.id,blocked);
    res.json({ok:true,message:blocked?'Control bloqueado':'Control habilitado',data});
  }catch(error){res.status(502).json({ok:false,message:'No fue posible modificar el control en ZKTeco',error:error.message});}
}
async function actualizarVigencia(req,res){
  try{
    const tarjeta=await ZkTarjeta.findByPk(req.params.id);
    if(!tarjeta)return res.status(404).json({ok:false,message:'Tarjeta no encontrada'});
    const fechaInicio=String(req.body.fechaInicio||'').trim()||null;
    const fechaFin=String(req.body.fechaFin||'').trim()||null;
    await writeUserValidity(tarjeta.numeroTarjeta,fechaInicio,fechaFin);
    await tarjeta.update({fechaInicio,fechaFin,bloqueado:false,fechaFinOriginal:null,ultimaLectura:new Date()});
    res.json({ok:true,message:'Vigencia actualizada en el C3-200',data:tarjeta});
  }catch(error){res.status(502).json({ok:false,message:'No fue posible actualizar la vigencia',error:error.message});}
}
async function pluma(req,res){
  const accion=String(req.body.accion||'').toUpperCase();
  if(!['ABRIR','CERRAR'].includes(accion))return res.status(400).json({ok:false,message:'Acción no válida'});
  try{res.json({ok:true,message:accion==='ABRIR'?'Orden de apertura enviada':'Orden de cierre enviada',data:await operateGate(accion)});}
  catch(error){res.status(502).json({ok:false,message:'No fue posible operar la pluma',error:error.message});}
}
async function viviendas(req,res){
  try{res.json({ok:true,data:await dashboard(req.query)});}
  catch(error){res.status(500).json({ok:false,message:'No fue posible consultar viviendas y controles',error:error.message});}
}
async function simular(req,res){res.json({ok:true,data:await simularCorte(new Date())});}

module.exports={estado,inventario,sincronizar,bloquear,actualizarVigencia,pluma,viviendas,simular};
