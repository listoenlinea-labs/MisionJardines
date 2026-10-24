'use strict';
// SPEI: un día operativo bancario inicia a las 18:00, conforme a Banxico.
// Esta equivalencia distingue fecha visible SPEI de fecha calendario del movimiento.
// Solo contempla fines de semana ordinarios, no inventa excepciones para feriados.
const ZONA = 'America/Mexico_City';
function mexico(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: ZONA, year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23'
  }).formatToParts(now);
  const p=Object.fromEntries(parts.map(({type,value})=>[type,value]));
  return {fecha:p.year+'-'+p.month+'-'+p.day, hora:p.hour+':'+p.minute+':'+p.second};
}
function formatoFecha(f) { return /^20\d{2}-\d{2}-\d{2}$/.test(String(f||'')); }
function validarDia(fecha) {
  if(!formatoFecha(fecha))return false;
  const d=new Date(fecha+'T00:00:00.000Z');
  return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===fecha;
}
function horaValida(h) {return /^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/.test(String(h||''));}
function siguienteHabil(fecha) {
  if(!validarDia(fecha))return '';
  const d=new Date(fecha+'T12:00:00.000Z');
  do {d.setUTCDate(d.getUTCDate()+1);}
  while(d.getUTCDay()===0||d.getUTCDay()===6);
  return d.toISOString().slice(0,10);
}
function fechaOperativaSpei(fechaReal,hora) {
  if(!validarDia(fechaReal)||!horaValida(hora))return '';
  const dia=new Date(fechaReal+'T12:00:00.000Z').getUTCDay();
  if(dia===0||dia===6||String(hora).slice(0,5)>='18:00')return dia===0||dia===6
    ? siguienteHabil(fechaReal) : siguienteHabil(fechaReal);
  return fechaReal;
}
function equivaleFechaSpei(fechaReal,fechaVisible,hora) {
  return validarDia(fechaReal)&&validarDia(fechaVisible)&&fechaVisible!==fechaReal
    &&horaValida(hora)&&fechaOperativaSpei(fechaReal,hora)===fechaVisible;
}
function resolverFechaCapturada(fechaVisible,hora,now=new Date()) {
  const ahora=mexico(now);
  if(!validarDia(fechaVisible))return {ok:false,mensaje:'La fecha del comprobante es inválida.'};
  if(fechaVisible<=ahora.fecha)return {ok:true,fechaOperacion:fechaVisible,fechaComprobante:fechaVisible,ajusteSpei:false};
  // Condición MUY acotada: el comprobante muestra el siguiente día hábil
  // y fue emitido HOY después del cierre SPEI a las 18:00, con hora ya transcurrida.
  // Los casos ambiguos (días posteriores, feriados) requieren el detalle/CEP.
  if(horaValida(hora)&&String(hora).slice(0,5)>='18:00'
      &&String(hora).slice(0,5)<=ahora.hora.slice(0,5)
      &&equivaleFechaSpei(ahora.fecha,fechaVisible,hora)) {
    return {ok:true,fechaOperacion:ahora.fecha,fechaComprobante:fechaVisible,ajusteSpei:true};
  }
  // Fechas impresas por el banco posteriores a hoy (feriados, puentes o
  // cambios de día operativo) no impiden REPORTAR. No se infiere que el pago
  // ya ocurrió: la aprobación sigue condicionada a la evidencia bancaria.
  return {ok:true,fechaOperacion:fechaVisible,fechaComprobante:fechaVisible,
    ajusteSpei:false,fechaPosterior:true};
}
module.exports={mexico,validarDia,fechaOperativaSpei,equivaleFechaSpei,resolverFechaCapturada};
