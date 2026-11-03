'use strict';
const {Op}=require('sequelize');
const {PagoReportado,PagoManualConcepto,AportacionExtraordinaria}=require('../models');

// Cada proyecto tiene una META por vivienda, no cuotas con vencimientos periódicos.
// Calcular en centavos, conservando cada abono real y cada comprobante bancario.
function centavos(n){
 const v=Number(n);
 const val=Math.round(v*100);
 if(!Number.isFinite(v)||!Number.isSafeInteger(val)||val<0)throw Error('Importe extraordinario inválido');
 return val;
}
function calcularSaldo(cargo,reportados=[],manuales=[],aportaciones=[]){
 const cargoId=String(cargo.id);
 const meta=centavos(cargo.monto);
 const bancarios=reportados.filter(p=>String(p.cargoExtraordinarioId)===cargoId);
 const recibidos=aportaciones
  .filter(a=>String(a.cargoExtraordinarioId)===cargoId)
  .reduce((sum,a)=>sum+centavos(a.monto),0)
  +manuales.filter(p=>String(p.cargoExtraordinarioId)===cargoId)
   .reduce((sum,p)=>sum+centavos(p.monto),0)
  +bancarios.filter(p=>p.estatus==='VALIDADO')
   .reduce((sum,p)=>sum+centavos(p.monto),0);
 const porVerificar=bancarios.filter(p=>p.estatus==='PENDIENTE_VALIDACION')
  .reduce((sum,p)=>sum+centavos(p.monto),0);
 const saldo=Math.max(0,meta-recibidos);
 const disponible=Math.max(0,meta-recibidos-porVerificar);
 return {
  meta:meta/100,abonado:recibidos/100,pendienteValidacion:porVerificar/100,
  restante:saldo/100,disponible:disponible/100,
  estado:saldo===0?'PAGADO':porVerificar>0?'EN_REVISION':recibidos>0?'PAGO_PARCIAL':'PENDIENTE',
  // No implica mora ni obligación de pagar en una fecha.
  mensaje:saldo===0?'Meta alcanzada':recibidos>0?'Aportación parcial':'Sin aportaciones'
 };
}
async function consultarSaldoCargo(cargo,{transaction}={}){
 const id=cargo.id;
 const [reportados,manuales,aportaciones]=await Promise.all([
  PagoReportado.findAll({where:{cargoExtraordinarioId:id,
    estatus:{[Op.in]:['VALIDADO','PENDIENTE_VALIDACION']}},
    attributes:['cargoExtraordinarioId','monto','estatus'],transaction}),
  PagoManualConcepto.findAll({where:{cargoExtraordinarioId:id},
    attributes:['cargoExtraordinarioId','monto'],transaction}),
  AportacionExtraordinaria.findAll({where:{cargoExtraordinarioId:id},
    attributes:['cargoExtraordinarioId','monto'],transaction})
 ]);
 return calcularSaldo(cargo,reportados,manuales,aportaciones);
}
module.exports={centavos,calcularSaldo,consultarSaldoCargo};
