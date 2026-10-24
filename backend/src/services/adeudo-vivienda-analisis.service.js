'use strict';

// Cálculo de SOLO LECTURA para Consulta de viviendas. La contabilidad de
// ingresos, los abonos guardados y los estados del C3 no se modifican.
const { BASE } = require('./mensualidades-mantenimiento');
const { siguienteDelUltimo } = require('./pago-manual-analisis.service');
const { fechaMexico } = require('./vigencia-calculo');
const {estadoPeriodo,contextoCuotas,inicioDesdeUltimo}=require('./cuotas-mantenimiento-calculo');

const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
  'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
const indice = (anio, mes) => Number(anio) * 12 + Number(mes) - 1;


// El importe se calcula por diferencia de cortes desde el último periodo pagado.
// Solo el desglose visible enumera los periodos pendientes posteriores a ese corte.
function calcularAdeudoVivienda(cuotas, { anio, mes, hoy = fechaMexico(), tarifa = BASE, incluirDetalles = false }) {
  if (!Number.isInteger(tarifa) || tarifa < 1 || tarifa > 10000) throw new Error('Tarifa mensual inválida');
  const fin = indice(anio, mes);
  const finCalendario = new Date(Date.UTC(Number(anio), Number(mes), 0))
    .toISOString().slice(0, 10);
  const corte = hoy < finCalendario ? hoy : finCalendario;
  const limite = Math.min(fin, indice(Number(corte.slice(0, 4)), Number(corte.slice(5, 7))));
  // El último mes pagado refleja TODO el historial confirmado, incluidos
  // anticipos de años posteriores; no representa el corte del saldo.
  const ultimo = siguienteDelUltimo(cuotas, 2100, 12);
  const resumen=contextoCuotas(cuotas,corte,tarifa);
  const detalles = [];
  if(incluirDetalles){
    const porPeriodo=new Map((cuotas||[]).map(c=>[
      Number(c.anio)*12+MESES.indexOf(String(c.mes||'').toUpperCase()),c
    ]));
    // Desglose a petición: el importe total ya se obtuvo por diferencia de cortes.
    for(let n=inicioDesdeUltimo(cuotas);n<=limite;n++){
      const yy=Math.floor(n/12),mm=n%12+1;
      const {faltante,recargoPendiente}=estadoPeriodo(porPeriodo.get(n),n,corte,tarifa);
      if(!faltante)continue;
      detalles.push({categoria:'MANTENIMIENTO',periodo:`${yy}-${String(mm).padStart(2,'0')}`,
        monto:faltante/100,recargo:recargoPendiente/100,concepto:'Mantenimiento'});
    }
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
    mesesPendientes:resumen.mesesPendientes,
    fechaUltimoCortePagado:resumen.fechaUltimoCortePagado,
    fechaCorteActual:resumen.fechaCorteActual,
    recargosPendientes:resumen.recargo,
    saldoPendiente:resumen.adeudoTotal,
    detalles
  };
}

module.exports = { calcularAdeudoVivienda };
