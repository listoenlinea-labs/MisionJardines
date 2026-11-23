'use strict';
// Un comprobante de un egreso NO acredita un depósito a una vivienda.
const crypto=require('node:crypto');
const {Transaction}=require('sequelize');
const db=require('../config/database');
const Egreso=require('../models/Egreso');
const Adjunto=require('../models/ComprobanteEgreso');
const storage=require('../services/comprobantes-egresos.service');
const bad=(status,message)=>Object.assign(new Error(message),{status});
const error=(res,e)=>{if(!e.status)console.error('[Comprobantes egresos]',e);
 return res.status(e.status||503).json({ok:false,message:e.status?e.message:'No se pudo gestionar el comprobante.'});};
const validarId=req=>{
 const id=Number(req.params.id);
 if(!Number.isSafeInteger(id)||id<=0)throw bad(400,'Identificador de gasto inválido.');
 return id;
};
async function buscar(id,opts={}){
 const row=await Egreso.findByPk(id,opts);
 if(!row)throw bad(404,'El gasto no existe.');
 if(String(row.referencia||'').startsWith('AJUSTE_'))throw bad(409,'No se adjuntan archivos a ajustes contables.');
 return row;
}
async function listar(req,res){
 try{
  const id=validarId(req);
  const e=await buscar(id);
  const rows=await Adjunto.findAll({where:{egresoId:id},order:[['id','ASC']]});
  res.set('Cache-Control','private, no-store');
  return res.json({ok:true,data:[
   ...(e.comprobanteArchivo?[{id:0,nombre:'Comprobante anterior',creadoEn:e.creadoEn,heredado:true}]:[]),
   ...rows.map(x=>({id:Number(x.id),nombre:x.nombre,creadoEn:x.creadoEn,heredado:false}))
  ]});
 }catch(e){return error(res,e);}
}
async function agregar(req,res){
 let archivo=null;
 try{
  const id=validarId(req),file=req.body?.comprobante;
  if(!file||typeof file!=='object'||Array.isArray(file))
   throw bad(400,'Selecciona un PDF, PNG o JPG válido.');
  const nombre=String(req.body?.nombre||'Comprobante').replace(/[\x00-\x1f\/\\]/g,'').trim().slice(0,255)||'Comprobante';
  const hash=crypto.createHash('sha256').update(Buffer.from(String(file.base64||''),'base64')).digest('hex');
  archivo=await storage.guardar(file);
  const data=await db.transaction({isolationLevel:Transaction.ISOLATION_LEVELS.SERIALIZABLE},async transaction=>{
   await buscar(id,{transaction,lock:transaction.LOCK.UPDATE});
   const existing=await Adjunto.findAll({where:{egresoId:id},transaction,lock:transaction.LOCK.UPDATE});
   if(existing.length>=12)throw bad(409,'Se permiten hasta 12 comprobantes nuevos por gasto.');
   if(existing.some(x=>x.hash===hash))throw bad(409,'Este archivo ya está registrado para el gasto.');
   const row=await Adjunto.create({egresoId:id,archivo,nombre,hash,subidoPor:req.usuario.usuarioId},{transaction});
   return {id:Number(row.id),egresoId:id,nombre};
  });
  return res.status(201).json({ok:true,data,message:'Comprobante añadido sin reemplazar los anteriores.'});
 }catch(e){await storage.eliminar(archivo);return error(res,e);}
}
async function descargar(req,res){
 try{
  const id=validarId(req),proofId=Number(req.params.comprobanteId);
  if(!Number.isSafeInteger(proofId)||proofId<0)throw bad(400,'Comprobante inválido.');
  const e=await buscar(id);
  let archivo;
  if(proofId===0){archivo=e.comprobanteArchivo;if(!archivo)throw bad(404,'No hay comprobante anterior.');}
  else {
   const item=await Adjunto.findOne({where:{id:proofId,egresoId:id}});
   if(!item)throw bad(404,'Comprobante no asociado a este gasto.');
   archivo=item.archivo;
  }
  const file=await storage.leer(archivo);
  res.set('Cache-Control','private, no-store');
  res.set('X-Content-Type-Options','nosniff');
  res.set('Content-Disposition','inline');
  res.type(file.mime);return res.send(file.bytes);
 }catch(e){return error(res,e);}
}
async function retirarRegistros(id,transaction){
 const rows=await Adjunto.findAll({where:{egresoId:id},transaction,lock:transaction.LOCK.UPDATE});
 await Adjunto.destroy({where:{egresoId:id},transaction});
 return rows.map(x=>x.archivo);
}
async function eliminarArchivos(files){for(const file of files||[])await storage.eliminar(file);}
module.exports={listar,agregar,descargar,retirarRegistros,eliminarArchivos};