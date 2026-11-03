'use strict';
// Compatibilidad con pagos históricos sin instantánea de captura manual.
// Nunca confundir con movimientos bancarios validados (requieren conciliación).
const referenciaHistoricaValida=ref=>
 typeof ref==='string'&&/^[A-Za-z0-9][A-Za-z0-9:_./-]{0,149}$/.test(ref);
const esOrigenBancario=origen=>/BANCO|BANCARIO|TRANSFERENCIA|IMAP|REPARTO|PAGO_REPORTADO/i.test(String(origen||''));
const fail=(message)=>Object.assign(new Error(message),{status:409});
function estadoPendienteHistorico(cuota,referencia){
 const origen=String(cuota?.origenImportacion||'');
 if(esOrigenBancario(origen))throw fail('El pago está ligado a un depósito bancario. No puede anularse sin revertir también su conciliación.');
 if(String(cuota?.estatusPago).toUpperCase()!=='PAGADO'||!Number.isFinite(Number(cuota?.montoPagado))||Number(cuota.montoPagado)<=0)
  throw fail('El pago ya no está confirmado o contiene abonos parciales; requiere conciliación antes de anular.');
 const montoCuota=Number(cuota?.montoCuota);
 if(!Number.isFinite(montoCuota)||montoCuota<=0)
  throw fail('La cuota histórica no conserva su importe original; no es posible restaurarla automáticamente.');
 const nota='Reversión administrativa de referencia '+referencia+'. El registro original se archivó en pagos_anulaciones.';
 return {
  estatusPago:'PENDIENTE',montoPagado:0,recargo:0,recargoPagado:0,
  saldoPendiente:montoCuota,formaPago:null,referencia:null,folio:null,
  reciboPdfUrl:null,fechaPago:null,fechaConfirmacion:null,
  confirmadoPorUsuarioId:null,correoEnviado:false,fechaEnvioCorreo:null,
  correoDestino:null,origenImportacion:'REVERSA_HISTORICO',
  observaciones:[cuota?.observaciones,nota].filter(Boolean).join('\n')
 };
}
module.exports={referenciaHistoricaValida,esOrigenBancario,estadoPendienteHistorico};
