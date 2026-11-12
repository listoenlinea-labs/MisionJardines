'use strict';
const {Op}=require('sequelize');
const db=require('../config/database');
const {Casa}=require('../models');
const Tarjeta=require('../models/TarjetaRojaCasaClub');
const Sancion=require('../models/SancionCasaClub');
const Config=require('../models/ConfiguracionTarjetasRojas');
const UMBRAL=3; // Más de tres tarjetas ACTIVAS bloquean; con tres aún se puede reservar.
const diaMexico=()=>new Intl.DateTimeFormat('sv-SE',{
 timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'
}).format(new Date());
const fallo=(status,message,extra={})=>Object.assign(new Error(message),{status,...extra});
function sumarAnios(dia,anios){
 const fecha=new Date(dia+'T12:00:00Z');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(dia)||Number.isNaN(fecha.getTime()))
  throw Error('Fecha de restricción inválida');
 const original=fecha.getUTCMonth();
 fecha.setUTCFullYear(fecha.getUTCFullYear()+anios);
 // 29 de febrero -> 28 de febrero cuando no hay equivalente.
 if(fecha.getUTCMonth()!==original)fecha.setUTCDate(0);
 return fecha.toISOString().slice(0,10);
}
function idCasa(raw){
 const id=Number(raw);
 if(!Number.isSafeInteger(id)||id<1)return null;
 return id;
}
const normalizarMotivo=(v,{min=5,max=500}={})=>{
 const s=String(v||'').trim();
 if(s.length<min||s.length>max)throw fallo(400,'Escribe un motivo de '+min+' a '+max+' caracteres.');
 return s;
};
async function configuracion({transaction}={}){
 const row=await Config.findByPk(1,{transaction});
 if(!row)throw fallo(503,'Falta inicializar la configuración de tarjetas rojas.');
 return {umbral:UMBRAL,aniosBloqueo:Number(row.aniosBloqueo)};
}
async function obtener(casaId,{historial=false,transaction}={}){
 const id=idCasa(casaId);
 if(!id)throw fallo(400,'Vivienda inválida');
 const [c,registros,sancion]=await Promise.all([
  configuracion({transaction}),
  Tarjeta.findAll({where:{casaId:id,...(historial?{}:{retiradaEn:null})},
   order:[['asignadaEn','DESC'],['id','DESC']],transaction}),
  Sancion.findByPk(id,{transaction})
 ]);
 const activas=registros.filter(t=>!t.retiradaEn);
 const vence=sancion?.bloqueadoHasta||null;
 const bloqueada=activas.length>UMBRAL&&!!vence&&vence>=diaMexico();
 return {casaId:id,totalActivas:activas.length,umbral:c.umbral,
  aniosBloqueo:c.aniosBloqueo,bloqueada,bloqueadoHasta:bloqueada?vence:null,
  tarjetas:registros.map(t=>({
   id:Number(t.id),motivo:t.motivo,asignadaEn:t.asignadaEn,
   activa:!t.retiradaEn,
   ...(historial?{asignadaPor:t.asignadaPor,retiradaPor:t.retiradaPor,
     retiradaEn:t.retiradaEn,motivoRetiro:t.motivoRetiro}: {})
  }))};
}
async function exigirDisponible(casaId){
 const resumen=await obtener(casaId);
 if(resumen.bloqueada)throw fallo(409,
  'Esta vivienda no puede reservar Casa Club por exceder tres tarjetas rojas activas. Restricción vigente hasta el '+resumen.bloqueadoHasta+'.',
  {codigo:'TARJETAS_ROJAS',tarjetas:{
   totalActivas:resumen.totalActivas,umbral:UMBRAL,
   bloqueadoHasta:resumen.bloqueadoHasta,aniosBloqueo:resumen.aniosBloqueo}});
 return resumen;
}
async function agregar(casaId,motivo,usuarioId){
 const id=idCasa(casaId),actor=idCasa(usuarioId),nota=normalizarMotivo(motivo);
 if(!id||!actor)throw fallo(400,'Casa o responsable inválido');
 return db.transaction(async transaction=>{
  const casa=await Casa.findByPk(id,{transaction,lock:transaction.LOCK.UPDATE});
  if(!casa)throw fallo(404,'Vivienda no registrada');
  const anteriores=await Tarjeta.count({where:{casaId:id,retiradaEn:null},transaction});
  if(anteriores>=50)throw fallo(409,'Demasiadas tarjetas activas; requiere revisión administrativa.');
  await Tarjeta.create({casaId:id,motivo:nota,asignadaPor:actor,asignadaEn:new Date()},{transaction});
  const vigentes=anteriores+1;
  const fecha=diaMexico();
  const config=vigentes>UMBRAL?await configuracion({transaction}):null;
  let sancion=await Sancion.findByPk(id,{transaction,lock:transaction.LOCK.UPDATE});
  const bloqueoVigente=sancion?.bloqueadoHasta&&sancion.bloqueadoHasta>=fecha;
  if(vigentes>UMBRAL&&!bloqueoVigente){
   const valores={bloqueadoDesde:fecha,bloqueadoHasta:sumarAnios(fecha,config.aniosBloqueo),actualizadoEn:new Date()};
   if(sancion)await sancion.update(valores,{transaction});
   else sancion=await Sancion.create({casaId:id,...valores},{transaction});
  }
  return {casaId:id,totalActivas:vigentes,bloqueadoHasta:
   vigentes>UMBRAL?sancion?.bloqueadoHasta||null:null};
 });
}
async function retirar(tarjetaId,motivoRetiro,usuarioId){
 const tid=idCasa(tarjetaId),actor=idCasa(usuarioId),justificacion=normalizarMotivo(motivoRetiro);
 if(!tid||!actor)throw fallo(400,'Tarjeta o responsable inválido');
 // Evita carreras entre asignación/retiro: bloqueo de la vivienda como mutex.
 const original=await Tarjeta.findByPk(tid);
 if(!original)throw fallo(404,'Tarjeta roja no encontrada');
 return db.transaction(async transaction=>{
  const casa=await Casa.findByPk(original.casaId,{transaction,lock:transaction.LOCK.UPDATE});
  if(!casa)throw fallo(404,'Vivienda no registrada');
  const tarjeta=await Tarjeta.findByPk(tid,{transaction,lock:transaction.LOCK.UPDATE});
  if(!tarjeta||Number(tarjeta.casaId)!==Number(original.casaId)||tarjeta.retiradaEn)
   throw fallo(409,'Esta tarjeta ya fue retirada.');
  await tarjeta.update({retiradaPor:actor,retiradaEn:new Date(),motivoRetiro:justificacion},{transaction});
  const activas=await Tarjeta.count({where:{casaId:casa.id,retiradaEn:null},transaction});
  if(activas<=UMBRAL){
   const sancion=await Sancion.findByPk(casa.id,{transaction,lock:transaction.LOCK.UPDATE});
   if(sancion)await sancion.update({bloqueadoDesde:null,bloqueadoHasta:null,actualizadoEn:new Date()},{transaction});
  }
  return {casaId:Number(casa.id),totalActivas:activas,restriccionLevantada:activas<=UMBRAL};
 });
}
async function configurarAnios(anios,usuarioId){
 const value=Number(anios),actor=idCasa(usuarioId);
 if(!Number.isSafeInteger(value)||value<1||value>20||!actor)
  throw fallo(400,'Indica de 1 a 20 años de suspensión.');
 return db.transaction(async transaction=>{
  const c=await Config.findByPk(1,{transaction,lock:transaction.LOCK.UPDATE});
  if(!c)throw fallo(503,'No existe la configuración inicial.');
  await c.update({aniosBloqueo:value,actualizadoPor:actor,actualizadoEn:new Date()},{transaction});
  // Ajustar suspensiones actualmente vigentes al plazo definido por Administración.
  const vigentes=await Sancion.findAll({where:{bloqueadoDesde:{[Op.ne]:null},
   bloqueadoHasta:{[Op.gte]:diaMexico()}},transaction,lock:transaction.LOCK.UPDATE});
  for(const sancion of vigentes)await sancion.update({
   bloqueadoHasta:sumarAnios(sancion.bloqueadoDesde,value),actualizadoEn:new Date()
  },{transaction});
  return {umbral:UMBRAL,aniosBloqueo:value,bloqueosAjustados:vigentes.length};
 });
}
module.exports={UMBRAL,diaMexico,sumarAnios,configuracion,obtener,exigirDisponible,agregar,retirar,configurarAnios};
