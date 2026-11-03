'use strict';
const svc=require('../services/proyectos-extraordinarios.service');
const error=(res,e)=>{if(!e.status)console.error('[proyectos extraordinarios]',e);return res.status(e.status||503).json({ok:false,message:e.status?e.message:'No fue posible procesar proyectos y cuotas extraordinarias'});};
async function previsualizar(req,res){
 try{
  const data=await svc.previsualizar(req.body);
  res.setHeader('Cache-Control','no-store');
  return res.json({ok:true,data});
 }catch(e){return error(res,e);}
}
async function importar(req,res){
 try{
  if(req.body?.confirmacion!=='IMPORTAR')return res.status(400).json({ok:false,message:'Se requiere confirmación IMPORTAR'});
  const data=await svc.crearLote(req.body,req.usuario.usuarioId,{
   aceptarDiferencias:req.body.aceptarDiferencias===true,
   confirmarTarifas:req.body.confirmarTarifas===true
  });
  return res.status(201).json({ok:true,data,message:'Proyectos y aportaciones guardados en una transacción. No se modificaron TAGs ni mantenimiento.'});
 }catch(e){return error(res,e);}
}
async function crear(req,res){
 try{
  const data=await svc.crearProyecto(req.body,req.usuario.usuarioId);
  return res.status(201).json({ok:true,data,message:'Proyecto creado con cargos por las 231 viviendas.'});
 }catch(e){return error(res,e);}
}
async function ajustar(req,res){
 try{
  const data=await svc.ajustarCuota(req.params.id,req.params.casaId,req.body?.monto,req.usuario.usuarioId);
  return res.json({ok:true,data,message:'Tarifa específica del proyecto actualizada sin cambiar mantenimiento o TAGs.'});
 }catch(e){return error(res,e);}
}

async function ajustarProyecto(req,res){
 try{
  const data=await svc.ajustarCuotasProyecto(req.params.id,req.body,req.usuario.usuarioId);
  return res.json({ok:true,data,message:'Metas y excepciones guardadas con auditoría para las 231 viviendas.'});
 }catch(e){return error(res,e);}
}
module.exports={previsualizar,importar,crear,ajustar,ajustarProyecto};
