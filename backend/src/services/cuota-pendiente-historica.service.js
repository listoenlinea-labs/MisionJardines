'use strict';

// HIST identifica cuotas importadas. Las fechas de pago/confirmación en una
// fila PENDIENTE con $0 pueden ser metadatos heredados; solo se corrigen con
// confirmación humana explícita, previa auditoría en el formulario.
const LEGACY_REFERENCE=/^HIST-[A-Z]{3}\d{2,4}-\d+$/i;
function clasificarCuotaParaPago(cuota){
  if(!cuota)return {registrable:true,requiereRevision:false,referenciaAnterior:null};
  const estado=String(cuota.estatusPago||'').trim().toUpperCase();
  const monto=Number(cuota.montoPagado||0);
  const ref=String(cuota.referencia||'').trim();
  const esHistorico=Boolean(ref)&&LEGACY_REFERENCE.test(ref);
  const folio=String(cuota.folio||'').trim();
  const esFolioHistorico=Boolean(folio)&&LEGACY_REFERENCE.test(folio);
  const base={referenciaAnterior:ref||null,folioAnterior:esFolioHistorico?folio:null};
  if(estado==='PAGADO')return {...base,registrable:false,motivo:'Ya figura como PAGADO; no se duplicará el cobro.'};
  if(estado==='PAGO_PARCIAL'||monto>0)return {...base,registrable:false,motivo:'Existe un abono o pago parcial; concílialo antes de continuar.'};
  if(estado!=='PENDIENTE')return {...base,registrable:false,motivo:'El registro no está pendiente.'};
  if((folio&&!esFolioHistorico)||cuota.reciboPdfUrl||cuota.confirmadoPorUsuarioId)
    return {...base,registrable:false,motivo:'Existe un folio, recibo o administrador que confirmó el movimiento; revisar manualmente antes de cobrar.'};
  if(String(cuota.tipoPago||'').toUpperCase()==='EXTRAORDINARIO')
    return {...base,registrable:false,motivo:'Es una cuota extraordinaria; no es mantenimiento.'};
  const fechaHeredada=Boolean(cuota.fechaPago||cuota.fechaConfirmacion);
  // Una referencia no-HIST en una cuota PENDIENTE con $0 NO prueba que se
  // recibió dinero. Exigimos conciliación explícita, sin permitir sobrescribir
  // un folio real, un pago confirmado ni operaciones vinculadas en otras tablas.
  const requiereRevision=fechaHeredada||(Boolean(ref)&&!esHistorico);
  const advertencias=[];
  if(ref&&!esHistorico)advertencias.push('Referencia anterior no-HIST: '+ref+'. Verifica que NO represente un cobro real antes de registrar el pago.');
  if(fechaHeredada)advertencias.push('Existen fechas históricas de pago/confirmación aunque el importe pagado sea $0.');
  return {...base,registrable:true,requiereRevision,
    advertencia:advertencias.length?advertencias.join(' ')+
      ' Autoriza explícitamente la conciliación; los datos originales quedarán auditados.':null};
}
module.exports={clasificarCuotaParaPago,LEGACY_REFERENCE};
