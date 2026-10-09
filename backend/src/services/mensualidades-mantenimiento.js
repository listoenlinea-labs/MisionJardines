const { centavos, fechaMexico } = require('./vigencia-calculo');
const INICIO='2026-10-01';
const BASE=300;
const RECARGO=50;
const MAX_MESES=36;

// Tarifa por fecha de la transferencia. El corte de acceso se lee del C3;
// esta cotizacion no fija una fecha inicial ni calcula fechas de TAGs.
// Un comprobante de varios meses debe cubrir la misma tarifa por cada mes.
function cotizar(fechaOperacion,monto,{hoy=fechaMexico()}={}){
  const fecha=String(fechaOperacion||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(fecha+'T12:00:00Z')) ||
     new Date(fecha+'T12:00:00Z').toISOString().slice(0,10)!==fecha)
      throw Object.assign(new Error('La fecha del depósito no es válida'),{status:400});
  if(fecha<INICIO)throw Object.assign(new Error('El control automático inicia en octubre de 2026'),{status:400});
  if(fecha>hoy)throw Object.assign(new Error('La fecha del depósito no puede ser futura'),{status:400});
  const tardio=Number(fecha.slice(8,10))>10;
  const precioUnitario=BASE+(tardio?RECARGO:0);
  const amount=centavos(monto);
  const unit=precioUnitario*100;
  if(amount<unit)throw Object.assign(new Error(
    'El depósito mínimo para esa fecha es $'+precioUnitario.toFixed(2)+' MXN por mensualidad.'
  ),{status:400});
  if(amount%unit!==0)throw Object.assign(new Error(
    'El importe debe cubrir mensualidades completas de $'+precioUnitario.toFixed(2)+' MXN. '+
    'Antes o hasta el día 10 son $300; del 11 al fin del mes son $350 por mes.'
  ),{status:400});
  const meses=amount/unit;
  if(meses>MAX_MESES)throw Object.assign(new Error('Por seguridad, registra como máximo 36 mensualidades por movimiento'),{status:400});
  return {base:BASE,recargo:tardio?RECARGO*meses:0,total:amount/100,
    meses,principal:BASE*meses,precioUnitario,tardio};
}
module.exports={INICIO,BASE,RECARGO,cotizar};
