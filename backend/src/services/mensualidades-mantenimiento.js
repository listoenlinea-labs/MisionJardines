const { centavos, fechaMexico } = require('./vigencia-calculo');
const { fechaReal } = require('./pago-acceso-calculo');
const INICIO = '2026-10-01', BASE = 300, RECARGO = 50, MAX_MESES = 36;
function validarOperacion(value, hoy = fechaMexico()) {
  let fecha;
  try { fecha = fechaReal(value); } catch (_) { throw Object.assign(new Error('Fecha del depósito inválida'), { status: 400 }); }
  if (fecha < INICIO || fecha > hoy) throw Object.assign(new Error('Selecciona una fecha desde octubre de 2026, no futura'), { status: 400 });
  return fecha;
}
function cortesVencidos(fechaFinal, fechaOperacion) {
  fechaReal(fechaFinal); fechaReal(fechaOperacion);
  // Historical physical dates can be day 11; billing always cuts on day 10.
  if (fechaOperacion <= fechaFinal.slice(0,7) + '-10') return [];
  let month = Number(fechaFinal.slice(0,4)) * 12 + Number(fechaFinal.slice(5,7)) - 1;
  const last = Number(fechaOperacion.slice(0,4)) * 12 + Number(fechaOperacion.slice(5,7)) - 1;
  const result = [];
  for (; month <= last; month++) {
    const corte = String(Math.floor(month / 12)).padStart(4,'0') + '-' + String(month % 12 + 1).padStart(2,'0') + '-10';
    if (corte < fechaOperacion) result.push(corte);
  }
  return result;
}
function cotizar(fechaOperacion, monto, { hoy = fechaMexico(), fechaFinal, cortesPagados = [], saldoParcial = 0 } = {}) {
  const fecha = validarOperacion(fechaOperacion, hoy);
  const pagados = new Set(cortesPagados);
  const cortes = cortesVencidos(fechaFinal, fecha).filter(c => !pagados.has(c));
  const recargo = cortes.length * RECARGO, amount = centavos(monto), saldo = centavos(saldoParcial);
  const principal = amount - recargo * 100;
  if (principal <= 0 || principal + saldo < BASE * 100)
    throw Object.assign(new Error('El importe debe cubrir los recargos pendientes de $' + recargo.toFixed(2) + ' y al menos una mensualidad neta, considerando tu saldo a favor'), { status: 400 });
  const meses = Math.floor((principal + saldo) / (BASE * 100));
  if (meses > MAX_MESES) throw Object.assign(new Error('Registra como máximo 36 mensualidades por movimiento'), { status: 400 });
  return { base: BASE, recargo, total: amount / 100, principal: principal / 100, meses,
    cortesRecargo: cortes, fechaFinalC3: fechaFinal, saldoParcial: ((principal + saldo) % (BASE * 100)) / 100,
    tardio: cortes.length > 0 };
}
module.exports = { INICIO, BASE, RECARGO, MAX_MESES, validarOperacion, cortesVencidos, cotizar };
