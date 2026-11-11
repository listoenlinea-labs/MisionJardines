'use strict';
const Reserva=require('../models/ReservaCasaClub');

const mxHoy=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const pesos=n=>Math.round(Number(n||0)*100);
const conflicto=mensaje=>Object.assign(new Error(mensaje),{status:409});
// Condiciones compartidas por confirmación bancaria y recepción del comprobante.
// No se decide jamás por un PDF o por datos proporcionados por el navegador.
function validarReserva(reserva,pago,{hoy=mxHoy()}={}){
 if(!reserva||!['PENDIENTE','APROBADA'].includes(reserva.estatus)||reserva.pagado)
  throw conflicto('La reservación ya no está pendiente de pago. Requiere revisión de Administración.');
 if(Number(reserva.casaId)!==Number(pago.casaId) ||
    Number(reserva.id)!==Number(pago.reservaCasaClubId))
  throw conflicto('El comprobante no corresponde a esta reservación.');
 if(!reserva.fecha||reserva.fechaBloqueada!==reserva.fecha)
  throw conflicto('La fecha ya no está apartada para esta reservación.');
 if(reserva.fecha<hoy)
  throw conflicto('El evento ya pasó. Administración debe revisar el depósito.');
 if(!reserva.fechaLimitePago||pago.fechaOperacion>reserva.fechaLimitePago)
  throw conflicto('El depósito no corresponde al plazo comunicado para esta reserva.');
 const total=pesos(reserva.cuotaRecuperacion)+pesos(reserva.depositoGarantia)+pesos(reserva.limpieza);
 if(!Number.isSafeInteger(total)||total<=0||total!==pesos(pago.monto))
  throw conflicto('El importe bancario no coincide exactamente con el total de Casa Club de esta reserva.');
 if(pago.tipoPago!=='CASA_CLUB')throw conflicto('La operación no es de Casa Club.');
 return true;
}
async function aplicarConfirmacion({pago,transaction}){
 if(!transaction)throw new Error('La confirmación Casa Club exige transacción SQL');
 const reserva=await Reserva.findByPk(pago.reservaCasaClubId,{transaction,lock:transaction.LOCK.UPDATE});
 validarReserva(reserva,pago);
 await reserva.update({
  estatus:'APROBADA',pagado:true,fechaBloqueada:reserva.fecha,
  fechaPago:pago.fechaOperacion,folio:pago.folioOperacion,actualizadoEn:new Date()
 },{transaction});
 // La bitácora bancaria ya permanece en PagoReportado (folio, OCR, hash, PDF).
 // El administrador no tiene que intervenir para aprobar una operación conciliada.
 return {
  id:reserva.id,casaId:reserva.casaId,fecha:reserva.fecha,
  solicitante:reserva.solicitante,correo:reserva.correo,telefono:reserva.telefono,
  monto:Number(pago.monto),folioReporte:pago.folioReporte,
  fechaPago:pago.fechaOperacion
 };
}
module.exports={validarReserva,aplicarConfirmacion};
