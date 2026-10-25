'use strict';

// Único criterio visual de Estado para Análisis de cuotas y Seguridad.
// La deuda la calcula cuotas-mantenimiento-calculo mediante calcularAdeudoVivienda.
// Un pago confirmado posterior puede cubrir el corte de un período anterior.
function estadoPeriodoMantenimiento(cuotaPeriodo, adeudo, anio, mes) {
  const corte = new Date(Date.UTC(Number(anio), Number(mes), 10)).toISOString().slice(0, 10);
  const cubiertoPorCorte = Boolean(adeudo?.fechaUltimoCortePagado &&
    adeudo.fechaUltimoCortePagado >= corte);
  return cubiertoPorCorte ? 'PAGADO' : cuotaPeriodo?.estatusPago || 'PENDIENTE';
}

function estadoSeguridadDesdeAnalisis(estado) {
  return estado === 'PAGADO' ? 'AL_CORRIENTE' : 'DEUDOR';
}

module.exports = { estadoPeriodoMantenimiento, estadoSeguridadDesdeAnalisis };
