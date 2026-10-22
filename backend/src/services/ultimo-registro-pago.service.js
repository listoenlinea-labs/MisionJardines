'use strict';
const tipos=['MANTENIMIENTO','EXTRAORDINARIO','CASA_CLUB'];
const referencia=value=>String(value||'').trim().toLowerCase();
function ultimosRegistrosPago({reportados=[],cuotas=[],manuales=[]}){
 const result=new Map(),refs=new Set();
 const key=(casa,tipo)=>String(casa)+':'+tipo;
 function add(casa,tipo,value,fuente,estatus){
  if(!tipos.includes(tipo)||!value)return;
  const date=new Date(value);if(Number.isNaN(date.getTime()))return;
  const k=key(casa,tipo),current=result.get(k);
  if(!current||date.getTime()>Date.parse(current.fecha))
   result.set(k,{fecha:date.toISOString(),fuente,estatus:estatus||null});
 }
 for(const p of reportados){
  for(const ref of [p.folioOperacion,p.folioReporte].filter(Boolean))refs.add(key(p.casaId,p.tipoPago)+':'+referencia(ref));
  // Es la subida del folio, no su fecha bancaria ni su validación posterior.
  add(p.casaId,p.tipoPago,p.creadoEn,'FOLIO_REPORTADO',p.estatus);
 }
 for(const p of manuales)add(p.casaId,p.tipoPago,p.creadoEn,'REGISTRO_MANUAL','REGISTRADO');
 for(const c of cuotas){
  if(!(Number(c.montoPagado)>0)||!['PAGADO','PAGO_PARCIAL'].includes(c.estatusPago))continue;
  if([c.referencia,c.folio].some(ref=>ref&&refs.has(key(c.casaId,'MANTENIMIENTO')+':'+referencia(ref))))continue;
  // El alta/importación de una cuota y su última edición no son un pago.
  // El flujo manual conserva la fecha de confirmación de la captura efectiva.
  if(c.origenImportacion!=='MANUAL_ANALISIS'&&!c.confirmadoPorUsuarioId)continue;
  add(c.casaId,'MANTENIMIENTO',c.fechaConfirmacion,'REGISTRO_MANUAL','REGISTRADO');
 }
 return result;
}
module.exports={ultimosRegistrosPago};
