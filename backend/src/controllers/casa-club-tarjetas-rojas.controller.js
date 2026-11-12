'use strict';
const {Casa,UsuarioCasa}=require('../models');
const service=require('../services/casa-club-tarjetas-rojas.service');
const fallo=(res,e)=>{
 if(!e.status)console.error('[Casa Club][Tarjetas rojas]',e);
 return res.status(e.status||503).json({ok:false,message:e.status?e.message:'No fue posible consultar tarjetas rojas.'});
};
const rolStaff=req=>['SUPER_ADMIN','ADMINISTRADOR','SEGURIDAD'].includes(req.usuario?.rol);
const rolAdmin=req=>['SUPER_ADMIN','ADMINISTRADOR'].includes(req.usuario?.rol);
function actor(req){return req.usuario?.usuarioId;}
async function mias(req,res){
 try{
  if(req.usuario?.rol!=='CONDOMINO')return res.status(403).json({ok:false,message:'Consulta propia exclusiva para condóminos.'});
  const casaId=Number(req.usuario?.casaId);
  if(!Number.isSafeInteger(casaId)||casaId<1)return res.status(400).json({ok:false,message:'Selecciona una vivienda vinculada.'});
  const member=await UsuarioCasa.findOne({where:{usuarioId:actor(req),casaId,activo:true}});
  if(!member)return res.status(403).json({ok:false,message:'No tienes acceso a esta vivienda.'});
  res.setHeader('Cache-Control','private, no-store');
  return res.json({ok:true,data:await service.obtener(casaId)});
 }catch(e){return fallo(res,e);}
}
async function viviendas(req,res){
 if(!rolStaff(req))return res.status(403).json({ok:false,message:'Acceso exclusivo de Seguridad o Administración.'});
 try{
  const data=await Casa.findAll({attributes:['id','calle','calleCorrecta','numero'],raw:true});
  res.setHeader('Cache-Control','private, no-store');
  return res.json({ok:true,data:data.map(x=>({id:x.id,calle:x.calleCorrecta||x.calle,numero:x.numero}))
   .filter(x=>x.calle&&x.numero&&!/^test(?:-|$)|^prueba/i.test(x.numero))});
 }catch(e){return fallo(res,e);}
}
async function vivienda(req,res){
 if(!rolStaff(req))return res.status(403).json({ok:false,message:'Acceso exclusivo de Seguridad o Administración.'});
 try{
  const casaId=Number(req.params.casaId);
  const casa=await Casa.findByPk(casaId,{attributes:['id','calle','calleCorrecta','numero']});
  if(!casa)return res.status(404).json({ok:false,message:'Vivienda no encontrada'});
  res.setHeader('Cache-Control','private, no-store');
  return res.json({ok:true,data:{casa:{id:Number(casa.id),calle:casa.calleCorrecta||casa.calle,numero:casa.numero},
   ...(await service.obtener(casa.id,{historial:true}))}});
 }catch(e){return fallo(res,e);}
}
async function agregar(req,res){
 if(!rolStaff(req))return res.status(403).json({ok:false,message:'No tienes permiso para registrar tarjetas.'});
 try{
  const result=await service.agregar(req.params.casaId,req.body?.motivo,actor(req));
  return res.status(201).json({ok:true,data:result,message:'Tarjeta roja registrada para la vivienda.'});
 }catch(e){return fallo(res,e);}
}
async function retirar(req,res){
 if(!rolStaff(req))return res.status(403).json({ok:false,message:'No tienes permiso para retirar tarjetas.'});
 try{
  const result=await service.retirar(req.params.tarjetaId,req.body?.motivoRetiro,actor(req));
  return res.json({ok:true,data:result,message:'Tarjeta retirada y acción conservada en el historial.'});
 }catch(e){return fallo(res,e);}
}
async function configuracion(req,res){
 if(!rolStaff(req))return res.status(403).json({ok:false,message:'Solo personal autorizado.'});
 try{return res.json({ok:true,data:await service.configuracion()});}
 catch(e){return fallo(res,e);}
}
async function guardarConfiguracion(req,res){
 if(!rolAdmin(req))return res.status(403).json({ok:false,message:'Solo Administración puede cambiar la duración.'});
 try{
  const result=await service.configurarAnios(req.body?.aniosBloqueo,actor(req));
  return res.json({ok:true,data:result,message:'Duración de suspensiones actualizada.'});
 }catch(e){return fallo(res,e);}
}
module.exports={mias,viviendas,vivienda,agregar,retirar,configuracion,guardarConfiguracion};
