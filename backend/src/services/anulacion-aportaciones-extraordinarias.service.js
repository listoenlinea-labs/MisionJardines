'use strict';
const {Transaction,Op}=require('sequelize');
const db=require('../config/database');
const {CuotaExtraordinaria:Proyecto,CargoExtraordinario:Cargo,AportacionExtraordinaria:Aportacion,PagoManualConcepto:Manual,PagoReportado:Banco}=require('../models');
const {esOrigenBancario}=require('./reversion-historicos.helper');
const fail=(status,message)=>Object.assign(new Error(message),{status});
function positiveId(value,name){
 const id=Number(value);
 if(!Number.isSafeInteger(id)||id<1)throw fail(400,name+' inválido');
 return id;
}
function validInput(data){
 const origen=String(data.origen||'').toUpperCase();
 if(!['APORTACION','MANUAL','BANCO'].includes(origen))throw fail(400,'Origen del movimiento inválido');
 return {proyectoId:positiveId(data.proyectoId,'Proyecto'),casaId:positiveId(data.casaId,'Vivienda'),origen,id:positiveId(data.id,'Movimiento')};
}
function cents(value){
 const n=Number(value),i=Math.round(n*100);
 if(!Number.isFinite(n)||!Number.isSafeInteger(i)||i<1||Math.abs(n*100-i)>0.001)
  throw fail(409,'Importe del movimiento inválido; requiere conciliación.');
 return i;
}
function checkConfirmation(pago,body){
 if(body?.confirmacion!=='ANULAR')throw fail(400,'Escribe ANULAR para confirmar la anulación.');
 if(String(body?.referencia||'').trim()!==String(pago.referencia||'').trim()||
   cents(body?.monto)!==cents(pago.monto))
  throw fail(409,'La referencia o importe cambió. Actualiza el historial antes de anular.');
}
async function prepare(raw,transaction=null){
 const {proyectoId,casaId,origen,id}=validInput(raw);
 if(origen==='BANCO')throw fail(409,'Un pago bancario validado requiere reversión de su conciliación. No puede borrarse aquí.');
 const opts=transaction?{transaction,lock:transaction.LOCK.UPDATE}:{};
 const project=await Proyecto.findOne({where:{id:proyectoId,activo:true},...opts});
 if(!project)throw fail(404,'Proyecto extraordinario no encontrado');
 const charge=await Cargo.findOne({where:{cuotaExtraordinariaId:proyectoId,casaId},...opts});
 if(!charge)throw fail(404,'La vivienda no pertenece al proyecto seleccionado');
 const model=origen==='APORTACION'?Aportacion:Manual;
 const where={id,casaId,cargoExtraordinarioId:charge.id,...(origen==='APORTACION'?
  {cuotaExtraordinariaId:proyectoId}:{tipoPago:'EXTRAORDINARIO'})};
 const pago=await model.findOne({where,...opts});
 if(!pago)throw fail(409,'El abono ya fue anulado o pertenece a otra vivienda/proyecto.');
 if(origen==='APORTACION'&&esOrigenBancario(pago.origen))
  throw fail(409,'Aportación de origen bancario: requiere conciliación.');
 const referencia=String(pago.referencia||'').trim(),monto=cents(pago.monto);
 if(!referencia)throw fail(409,'Aportación sin referencia; requiere conciliación.');
 const bank=await Banco.findOne({where:{casaId,cargoExtraordinarioId:charge.id,tipoPago:'EXTRAORDINARIO',
  [Op.or]:[{folioOperacion:referencia},{folioReporte:referencia}]},...opts});
 if(bank)throw fail(409,'La referencia está asociada a un comprobante bancario. Requiere conciliación antes de anular.');
 return {project,charge,pago,proyectoId,casaId,origen,referencia,monto:monto/100,
  fecha:origen==='APORTACION'?pago.fecha:pago.creadoEn};
}
function summary(x){
 return {proyectoId:x.proyectoId,proyecto:x.project.concepto,casaId:x.casaId,origen:x.origen,
  movimientoId:Number(x.pago.id),referencia:x.referencia,monto:x.monto,fecha:x.fecha,
  advertencia:x.origen==='APORTACION'&&String(x.pago.origen).includes('HISTORICO')
   ?'Es una aportación de importación histórica. Se archivará el asiento original en auditoría.'
   :'Se archivará el abono con auditoría antes de retirarlo del saldo.',
  avisoRecibos:'Los PDF ya descargados o guardados en Google Drive no se eliminan automáticamente.'};
}
async function vistaPrevia(params){return summary(await prepare(params));}
async function anular(params,body,usuarioId){
 const actor=positiveId(usuarioId,'Administrador');
 return db.transaction({isolationLevel:Transaction.ISOLATION_LEVELS.SERIALIZABLE},async transaction=>{
  const x=await prepare(params,transaction);
  checkConfirmation(x.pago,body);
  await db.query('INSERT INTO proyectos_aportaciones_anulaciones '+
   '(cuota_extraordinaria_id,cargo_extraordinario_id,casa_id,origen_tipo,origen_id,referencia,monto,usuario_id,datos_originales) '+
   'VALUES (?,?,?,?,?,?,?,?,?)',{replacements:[
    x.proyectoId,x.charge.id,x.casaId,x.origen,x.pago.id,x.referencia,x.monto,actor,
    JSON.stringify(x.pago.get({plain:true}))
   ],transaction});
  const deleted=await x.pago.destroy({transaction});
  if(deleted!==1)throw fail(409,'La anulación no afectó exactamente un movimiento. Transacción cancelada.');
  return {...summary(x),anulado:true,sinCambiosEnMantenimiento:true,sinCambiosEnTags:true};
 });
}
module.exports={validInput,checkConfirmation,vistaPrevia,anular};
