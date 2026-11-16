'use strict';
// CRUD auditado de gastos reales de Casa Club; no modifica las reservaciones
// ni la provisión histórica de limpieza.
const {Transaction,QueryTypes}=require('sequelize');
const db=require('../config/database');
const Egreso=require('../models/Egreso');
const archivos=require('../services/comprobantes-egresos.service');
const bad=(status,message)=>Object.assign(new Error(message),{status});
const err=(res,e)=>{if(!e.status)console.error('[Egresos Casa Club]',e);return res.status(e.status||503).json({ok:false,message:e.status?e.message:'No fue posible actualizar el gasto.'});};
const clean=x=>{
 if(!x||typeof x!=='object'||Array.isArray(x))throw bad(400,'Datos del gasto inválidos.');
 const concepto=String(x.concepto||'').trim(),fecha=String(x.fecha||'');
 const monto=Number(x.monto),pagado=x.pagado;
 const parsed=new Date(fecha+'T12:00:00Z');
 if(!concepto||concepto.length>250||!/^\d{4}-\d{2}-\d{2}$/.test(fecha)||
  !Number.isFinite(parsed.getTime())||parsed.toISOString().slice(0,10)!==fecha||
  !Number.isSafeInteger(monto)||monto<1||monto>100000000||typeof pagado!=='boolean')
  throw bad(400,'Nombre, fecha, monto entero y estado de pago válidos son obligatorios.');
 return {concepto,fecha,monto,pagado};
};
const snapshot=r=>({concepto:String(r.concepto||'').trim(),fecha:String(r.fecha||'').slice(0,10),
 monto:Math.round(Number(r.monto)),pagado:Boolean(Number(r.pagado))});
const allowed=async(id,transaction)=>{
 const row=await Egreso.findByPk(id,{transaction,lock:transaction.LOCK.UPDATE});
 if(!row||row.ambito!=='CASA_CLUB'||row.proyectoId)
  throw bad(404,'No se encontró este concepto de Casa Club.');
 return row;
};
const guard=(row,old)=>{const prev=snapshot(row);if(Object.keys(prev).some(k=>prev[k]!==old[k]))
 throw bad(409,'El concepto cambió desde otra sesión. Actualiza el análisis antes de continuar.');return prev;};
const audit=async(type,id,oldAmount,newAmount,actor,text,transaction)=>
 db.query('INSERT INTO finanzas_edicion_auditoria (tipo,entidad_id,monto_anterior,monto_nuevo,usuario_id,detalle) VALUES (?,?,?,?,?,?)',
 {transaction,replacements:[type,id,oldAmount,newAmount,actor,String(text||'').slice(0,250)]});
async function editar(req,res){
 try{
  const id=Number(req.params.id),anterior=clean(req.body?.anterior),nuevo=clean(req.body?.nuevo);
  if(!Number.isSafeInteger(id)||id<1)throw bad(400,'Concepto inválido.');
  const result=await db.transaction({isolationLevel:Transaction.ISOLATION_LEVELS.SERIALIZABLE},async transaction=>{
   const row=await allowed(id,transaction),prev=guard(row,anterior);
   if(Object.keys(nuevo).every(k=>prev[k]===nuevo[k]))return {id,sinCambio:true};
   await row.update(nuevo,{transaction});
   await audit('EDITAR_CONCEPTO_CASA_CLUB',id,prev.monto,nuevo.monto,req.usuario.usuarioId,
    prev.concepto+' -> '+nuevo.concepto+'; '+(row.referencia||''),transaction);
   return {id,concepto:nuevo.concepto,monto:nuevo.monto};
  });
  return res.json({ok:true,...result,message:'Concepto de Casa Club actualizado.'});
 }catch(e){return err(res,e);}
}
async function eliminar(req,res){
 let file=null;
 try{
  const id=Number(req.params.id),anterior=clean(req.body?.anterior);
  if(!Number.isSafeInteger(id)||id<1)throw bad(400,'Concepto inválido.');
  const result=await db.transaction({isolationLevel:Transaction.ISOLATION_LEVELS.SERIALIZABLE},async transaction=>{
   const row=await allowed(id,transaction),prev=guard(row,anterior);
   // No dejar planes mensuales con una asignación apuntando a un gasto borrado.
   const tables=await db.query("SHOW TABLES LIKE 'finanzas_planes_mensuales'",{transaction,type:QueryTypes.SELECT});
   if(tables.length){
    const records=await db.query('SELECT asignaciones FROM finanzas_planes_mensuales',{transaction,type:QueryTypes.SELECT});
    if(records.some(p=>{
     const arr=typeof p.asignaciones==='string'?JSON.parse(p.asignaciones):p.asignaciones;
     return Array.isArray(arr)&&arr.some(a=>Number(a.egresoId)===id);
    }))throw bad(409,'Este gasto aparece en un plan de fondos. Retira primero sus asignaciones.');
   }
   file=row.comprobanteArchivo;
   await audit('ELIMINAR_CONCEPTO_CASA_CLUB',id,prev.monto,0,req.usuario.usuarioId,
    prev.concepto+'; '+(row.referencia||''),transaction);
   await row.destroy({transaction});
   return {id};
  });
  if(file)await archivos.eliminar(file);
  return res.json({ok:true,...result,message:'Concepto eliminado y auditoría conservada.'});
 }catch(e){return err(res,e);}
}
module.exports={editar,eliminar};
