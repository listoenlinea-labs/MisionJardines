'use strict';
// Conciliación exclusivamente contable de la casa SINTÉTICA Prueba TEST-001.
// No llama al C3 ni modifica TAGs, permisos o eventos de acceso.
// El depósito ha sido autenticado previamente por el reconciliador bancario.
const {Cuota,Casa}=require('../models');
const {centavos}=require('./vigencia-calculo');

function esViviendaSintetica(casa){
 return String(casa?.calle||'').trim().toLowerCase()==='prueba' &&
   String(casa?.numero||'').trim().toUpperCase()==='TEST-001';
}
function esDepositoPruebaDiez(pago,casa){
 return esViviendaSintetica(casa)
  &&pago?.tipoPago==='MANTENIMIENTO'
  &&centavos(pago?.monto)===1000
  &&centavos(pago?.recargo||0)===0
  &&String(pago?.concepto||'').startsWith('PRUEBA CONTROLADA:')
  &&String(pago?.estatus||'')==='VALIDADO';
}
function validarCuotaPrueba(row){
 const valido=Number(row?.anio)===2026 && String(row?.mes||'').toUpperCase()==='OCTUBRE'
   &&String(row?.estatusPago||'')==='PAGO_PARCIAL'
   &&centavos(row?.montoCuota)===30000
   &&centavos(row?.recargo)===5000
   &&centavos(row?.montoPagado)===34000
   &&centavos(row?.saldoPendiente)===1000
   &&String(row?.origenImportacion||'')==='PRUEBA_10_PESOS';
 if(!valido)throw Object.assign(new Error(
   'Vivienda de prueba: la cuota sintética de octubre no está preparada con $340 abonados y $10 pendientes. No se valida ni duplica el depósito.'
 ),{status:409});
}
async function aplicarSiCorresponde(pago,transaction){
 const casa=await Casa.findByPk(pago.casaId,{transaction,lock:transaction.LOCK.UPDATE});
 if(!casa)return {aplicado:false,motivo:'SIN_VIVIENDA'};
 if(!esViviendaSintetica(casa))return {aplicado:false,motivo:'NO_ES_PRUEBA'};
 if(!esDepositoPruebaDiez(pago,casa))
   return {aplicado:false,motivo:'NO_ES_COMPLEMENTO_DIEZ'};
 const cuota=await Cuota.findOne({
   where:{casaId:casa.id,anio:2026,mes:'OCTUBRE'},
   transaction,lock:transaction.LOCK.UPDATE
 });
 validarCuotaPrueba(cuota);
 const auditar='Complemento $10.00 confirmado automáticamente por aviso bancario autenticado. Folio '+String(pago.folioReporte||'')+'.';
 await cuota.update({
   montoPagado:'350.00',saldoPendiente:'0.00',estatusPago:'PAGADO',
   fechaPago:pago.fechaOperacion,fechaConfirmacion:new Date(),
   formaPago:'TRANSFERENCIA',
   observaciones:[cuota.observaciones,auditar].filter(Boolean).join('\n'),
   actualizadoEn:new Date()
 },{transaction});
 return {aplicado:true,mes:'OCTUBRE',anio:2026,saldoPendiente:0};
}
module.exports={esViviendaSintetica,esDepositoPruebaDiez,validarCuotaPrueba,aplicarSiCorresponde};
