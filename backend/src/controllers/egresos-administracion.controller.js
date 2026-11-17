'use strict';
// Borrado auditado de egresos ordinarios; no borra cuotas ni recibos bancarios.
const {Transaction,QueryTypes}=require('sequelize');
const db=require('../config/database');
const Egreso=require('../models/Egreso');
const archivos=require('../services/comprobantes-egresos.service');
const error=(status,message)=>Object.assign(new Error(message),{status});
async function eliminarMantenimiento(req,res){
 let comprobante=null;
 try{
  const id=Number(req.params.id),previous=req.body?.anterior||{};
  if(!Number.isSafeInteger(id)||id<=0)throw error(400,'Identificador de egreso inválido.');
  const result=await db.transaction({isolationLevel:Transaction.ISOLATION_LEVELS.SERIALIZABLE},async transaction=>{
   const row=await Egreso.findByPk(id,{transaction,lock:transaction.LOCK.UPDATE});
   if(!row||row.ambito!=='MANTENIMIENTO'||row.proyectoId||
      ['PROYECTO','PROYECTOS','CUOTA_EXTRAORDINARIA'].includes(row.categoria))
    throw error(404,'No es un egreso ordinario de mantenimiento editable.');
   if(/^AJUSTE_/i.test(String(row.referencia||''))||Number(row.monto)<=0)
    throw error(409,'Los ajustes contables no pueden eliminarse desde esta tabla.');
   const monto=Number(row.monto),fecha=String(row.fecha).slice(0,10);
   if(Number(previous.monto)!==monto||String(previous.fecha)!==fecha||
      String(previous.concepto||'')!==String(row.concepto||''))
    throw error(409,'Este egreso cambió desde que abriste la tabla. Actualiza antes de borrarlo.');
   // Nunca dejar una asignación de fondos apuntando a un gasto eliminado.
   const tables=await db.query("SHOW TABLES LIKE 'finanzas_planes_mensuales'",{transaction,type:QueryTypes.SELECT});
   if(tables.length){
    const plans=await db.query('SELECT asignaciones FROM finanzas_planes_mensuales',{transaction,type:QueryTypes.SELECT});
    if(plans.some(p=>{
     const arr=typeof p.asignaciones==='string'?JSON.parse(p.asignaciones):p.asignaciones;
     return Array.isArray(arr)&&arr.some(a=>Number(a.egresoId)===id);
    }))throw error(409,'El gasto está asignado a un plan. Retira primero la asignación.');
   }
   comprobante=row.comprobanteArchivo;
   await db.query('INSERT INTO finanzas_edicion_auditoria (tipo,entidad_id,monto_anterior,monto_nuevo,usuario_id,detalle) VALUES (?,?,?,?,?,?)',
    {transaction,replacements:['ELIMINAR_EGRESO_MANTENIMIENTO',id,monto,0,
     Number(req.usuario.usuarioId),String(row.concepto+' · '+fecha+' · '+(row.referencia||'')).slice(0,250)]});
   await row.destroy({transaction});
   return {id,referencia:row.referencia||null};
  });
  if(comprobante)await archivos.eliminar(comprobante);
  return res.json({ok:true,...result,message:'Egreso de mantenimiento eliminado con auditoría.'});
 }catch(e){
  if(!e.status)console.error('[Eliminar mantenimiento]',e);
  return res.status(e.status||503).json({ok:false,message:e.status?e.message:'No se pudo eliminar el egreso.'});
 }
}
module.exports={eliminarMantenimiento};
