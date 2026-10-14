'use strict';

// Una referencia HIST-... es una etiqueta creada para identificar una
// mensualidad del padrón; NO es un cobro, comprobante ni folio validado.
// Solo esa referencia histórica y un registro realmente vacío pueden
// sustituirse por el movimiento de confirmación de pago.
const LEGACY_REFERENCE=/^HIST-[A-Z]{3}\d{2,4}-\d+$/i;
function clasificarCuotaParaPago(cuota){
  if(!cuota)return {registrable:true,referenciaAnterior:null};
  const estado=String(cuota.estatusPago||'').trim().toUpperCase();
  const monto=Number(cuota.montoPagado||0);
  const ref=String(cuota.referencia||'').trim();
  const motivo=estado==='PAGADO'?'El período ya figura como PAGADO. Revisa el historial y la sincronización del C3; no se volverá a cobrar.':
    estado==='PAGO_PARCIAL'||monto>0?'Ya existe un abono o pago parcial en el período. Debe conciliarse antes de registrar otro.':
    estado!=='PENDIENTE'?'El período no está PENDIENTE; revisa su estatus antes de confirmarlo.':
    ref&&!LEGACY_REFERENCE.test(ref)?'Hay una referencia de operación que no es un marcador histórico; revisa su origen antes de confirmar.':
    cuota.folio||cuota.reciboPdfUrl||cuota.fechaPago||cuota.fechaConfirmacion||cuota.confirmadoPorUsuarioId?
      'El período tiene evidencia de pago, recibo o confirmación previa; no se sobrescribió.':
    String(cuota.tipoPago||'').toUpperCase()==='EXTRAORDINARIO'?
      'El período pertenece a una cuota extraordinaria; no puede registrarse como mantenimiento.':null;
  return motivo?{registrable:false,motivo}:{registrable:true,referenciaAnterior:ref||null};
}
module.exports={clasificarCuotaParaPago,LEGACY_REFERENCE};
