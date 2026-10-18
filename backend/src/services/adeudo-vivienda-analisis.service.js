'use strict';

// Cálculo de SOLO LECTURA para Consulta de viviendas. La contabilidad de
// ingresos, los abonos guardados y los estados del C3 no se modifican.
const { BASE, RECARGO } = require('./mensualidades-mantenimiento');
const { siguienteDelUltimo } = require('./pago-manual-analisis.service');
const { fechaMexico } = require('./vigencia-calculo');

const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
  'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
const INICIO = 2026 * 12 + 8; // Septiembre 2026; agosto puede ser el último mes pagado.
const indice = (anio, mes) => Number(anio) * 12 + Number(mes) - 1;
const centavos = valor => {
  const n = Number(valor);
  return Number.isFinite(n) ? Math.max(0, Math.round(n * 100)) : 0;
};

/**
 * Saldo acumulado del padrón hasta el período consultado, nunca más allá de hoy
 * (hora de México). Sin cuotas guardadas para un mes, éste también se debe.
 * El corte de cada MES es el día 10 de ese mismo mes: desde el día 11 aplica
 * una sola penalización de $50 si sigue pendiente.
 *
 * Los importes persistidos pueden ya incorporar un recargo; MAX evita
 * sumarlo de nuevo. Los abonos se descuentan del total de cada período.
 * 'PAGADO' con importe confirmado, 'CONDONADO' y 'CANCELADO' no se cobran.
 */
function calcularAdeudoVivienda(cuotas, { anio, mes, hoy = fechaMexico() }) {
  const fin = indice(anio, mes);
  const finCalendario = new Date(Date.UTC(Number(anio), Number(mes), 0))
    .toISOString().slice(0, 10);
  const corte = hoy < finCalendario ? hoy : finCalendario;
  const limite = Math.min(fin, indice(Number(corte.slice(0, 4)), Number(corte.slice(5, 7))));
  // El último mes pagado refleja TODO el historial confirmado, incluidos
  // anticipos de años posteriores; no representa el corte del saldo.
  const ultimo = siguienteDelUltimo(cuotas, 2100, 12);
  const porPeriodo = new Map();
  for (const cuota of cuotas || []) {
    const mm = MESES.indexOf(String(cuota.mes || '').toUpperCase()) + 1;
    const yy = Number(cuota.anio);
    if (mm && Number.isInteger(yy) && indice(yy, mm) <= limite)
      porPeriodo.set(indice(yy, mm), cuota);
  }
  let pendiente = 0, recargos = 0, mesesPendientes = 0;
  const detalles = [];
  for (let n = INICIO; n <= limite; n++) {
    const yy = Math.floor(n / 12), mm = n % 12 + 1;
    const cuota = porPeriodo.get(n);
    const estado = String(cuota?.estatusPago || '').toUpperCase();
    const pagado = centavos(cuota?.montoPagado);
    if ((estado === 'PAGADO' && pagado > 0) ||
        estado === 'CONDONADO' || estado === 'CANCELADO') continue;
    const vencimiento = String(yy) + '-' + String(mm).padStart(2, '0') + '-10';
    const multa = corte > vencimiento ? RECARGO * 100 : 0;
    const total = Math.max(BASE * 100, centavos(cuota?.montoCuota),
      BASE * 100 + centavos(cuota?.recargo), BASE * 100 + multa);
    // No perder un saldo histórico explícito mayor que el importe teórico.
    const faltante = Math.max(0, total - pagado, centavos(cuota?.saldoPendiente));
    if (!faltante) continue;
    pendiente += faltante;
    mesesPendientes++;
    const sinMulta = Math.max(0, BASE * 100 - pagado);
    recargos += multa ? Math.min(multa, Math.max(0, faltante - sinMulta)) : 0;
    detalles.push({categoria:'MANTENIMIENTO',periodo:`${yy}-${String(mm).padStart(2,'0')}`,
      monto:faltante/100,recargo:(multa ? Math.min(multa,Math.max(0,faltante-sinMulta)) : 0)/100,
      concepto:'Mantenimiento'});
  }
  return {
    ultimoMesPagado: ultimo ? { mes: ultimo.nombre, anio: ultimo.anio } : null,
    mesesPendientes,
    recargosPendientes: recargos / 100,
    saldoPendiente: pendiente / 100
    ,detalles
  };
}

module.exports = { calcularAdeudoVivienda };
