'use strict';
const Modelo=require('../models/TarifaCasaClub');
const TOTAL_FIJO=2000;
const fallo=(status,message)=>Object.assign(Error(message),{status});
const claves=['cuotaRecuperacion','depositoGarantia','limpieza'];
function validar(datos){
 const valores={};
 for(const clave of claves){
  const raw=datos?.[clave];
  if(!['number','string'].includes(typeof raw)||!/^\d+$/.test(String(raw).trim()))
   throw fallo(400,'Los tres importes deben ser pesos enteros no negativos.');
  valores[clave]=Number(raw);
  if(!Number.isSafeInteger(valores[clave])||valores[clave]>TOTAL_FIJO)throw fallo(400,'Importe fuera de rango.');
 }
 if(valores.cuotaRecuperacion+valores.depositoGarantia+valores.limpieza!==TOTAL_FIJO)
  throw fallo(400,'Recuperación, garantía y limpieza deben sumar exactamente $2,000 MXN.');
 return valores;
}
async function obtener(options={}){
 const row=await Modelo.findByPk(1,options);
 if(!row)throw fallo(503,'La configuración de Casa Club no está disponible. Comprueba la migración SQL.');
 // Sequelize devuelve DECIMAL como cadena (p. ej. '700.00').
 return validar(Object.fromEntries(claves.map(clave=>[clave,Number(row[clave])])));
}
async function guardar(datos,usuarioId){
 const nuevos=validar(datos),db=require('../config/database');
 return db.transaction(async transaction=>{
  const row=await Modelo.findByPk(1,{transaction,lock:transaction.LOCK.UPDATE});
  if(!row)throw fallo(503,'No existe la tarifa activa. Ejecuta la migración SQL.');
  await row.update({...nuevos,actualizadoPor:usuarioId,actualizadoEn:new Date()},{transaction});
  return nuevos;
 });
}
module.exports={TOTAL_FIJO,validar,obtener,guardar};
