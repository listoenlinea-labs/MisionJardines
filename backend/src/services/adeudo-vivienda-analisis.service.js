'use strict';

// Cálculo de SOLO LECTURA para Consulta de viviendas. La contabilidad de
// ingresos, los abonos guardados y los estados del C3 no se modifican.
const { BASE } = require('./mensualidades-mantenimiento');
const { siguienteDelUltimo } = require('./pago-manual-analisis.service');
const { fechaMexico } = require('./vigencia-calculo');
const {estadoPeriodo}=require('./cuotas-mantenimiento-calculo');

const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
  'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
const INICIO = 2026 * 12 + 8; // Septiembre 2026; agosto puede ser el último mes pagado.
const indice = (anio, mes) => Number(anio) * 12 + Number(mes) - 1;


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
function calcularAdeudoVivienda(cuotas, { anio, mes, hoy = fechaMexico(), tarifa = BASE }) {
  if (!Number.isInteger(tarifa) || tarifa < 1 || tarifa > 10000) throw new Error('Tarifa mensual inválida');
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
    const {faltante,recargoPendiente}=estadoPeriodo(cuota,n,corte,tarifa);
    if (!faltante) continue;
    pendiente += faltante;
    mesesPendientes++;
    recargos += recargoPendiente;
    detalles.push({categoria:'MANTENIMIENTO',periodo:`${yy}-${String(mm).padStart(2,'0')}`,
      monto:faltante/100,recargo:recargoPendiente/100,
      concepto:'Mantenimiento'});
  }
  // Etiqueta administrativa anual en el último diciembre confirmado.
  // Se deriva del origen de las cuotas: no se agrega ninguna columna SQL y
  // una cuota de diciembre ordinaria nunca aparece como pago anual.
  const ultimoMesPagado = ultimo ? { mes: ultimo.nombre, anio: ultimo.anio } : null;
  if (ultimoMesPagado && ultimo.mes === 12 && (cuotas || []).some(c =>
    Number(c.anio) === ultimo.anio && String(c.mes || '').toUpperCase() === 'DICIEMBRE' &&
    String(c.estatusPago || '').toUpperCase() === 'PAGADO' && Number(c.montoPagado) > 0 &&
    c.origenImportacion === 'MANUAL_ANALISIS_ANUAL')) {
    ultimoMesPagado.pagoAnual = true;
  }
  return {
    ultimoMesPagado,
    mesesPendientes,
    recargosPendientes: recargos / 100,
    saldoPendiente: pendiente / 100
    ,detalles
  };
}

module.exports = { calcularAdeudoVivienda };
