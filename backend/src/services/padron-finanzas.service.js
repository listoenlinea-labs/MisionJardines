'use strict';

/**
 * Padrón usado exclusivamente en la vista de Análisis de cuotas.
 *
 * direcciones contiene domicilios heredados, auxiliares y de prueba. Su existencia
 * no demuestra que deban entrar al denominador de viviendas del fraccionamiento.
 * El padrón oficial cotejado en docs/INDICE_DOCUMENTOS.md identifica únicamente
 * Atotonilco 752, Guadalajara 789 y Valle de México 3614 para estas avenidas.
 *
 * IMPORTANTE: esta selección es de SOLO LECTURA. No edita direcciones,
 * cuotas, pagos, TAGs ni fechas físicas del controlador C3.
 */
const AVENIDAS_PADRON = Object.freeze({
  atotonilco: '752',
  guadalajara: '789',
  'valle de mexico': '3614'
});

function normalizarCalle(valor) {
  return String(valor ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
    .replace(/^(?:avenida|avda|av)\s+/, '').replace(/\s+/g, ' ');
}

function nombreCalle(casa) {
  return normalizarCalle(casa?.calleCorrecta || casa?.calle_correcta || casa?.calle);
}

function estaPagada(cuota) {
  return cuota?.estatusPago === 'PAGADO'
    || (cuota?.estatusPago === 'PAGO_PARCIAL' && Number(cuota?.montoPagado || 0) > 0);
}

function compararPrioridad(a, b, cuotasPorCasa) {
  const qa = cuotasPorCasa.get(String(a.id));
  const qb = cuotasPorCasa.get(String(b.id));
  // Si hay dos filas de la MISMA dirección oficial, conserva para el análisis
  // la que tenga evidencia de cobro del período, sin borrar ni combinar pagos.
  const score = q => [estaPagada(q) ? 1 : 0, Number(q?.montoPagado || 0), q ? 1 : 0];
  const sa = score(qa), sb = score(qb);
  for (let i = 0; i < sa.length; i += 1) {
    if (sa[i] !== sb[i]) return sb[i] - sa[i];
  }
  return Number(a.id || 0) - Number(b.id || 0);
}

function seleccionarPadronAnalisis(casas, cuotas) {
  const cuotasPorCasa = new Map((cuotas || []).map(c => [String(c.casaId), c]));
  const seleccionadas = [];
  const candidatas = new Map();
  let excluidas = 0;
  for (const casa of casas || []) {
    const calle = nombreCalle(casa);
    // El registro Prueba / TEST-001 del C3 no es una vivienda del padrón.
    if (calle === 'prueba' || calle.startsWith('prueba ')) {
      excluidas += 1;
      continue;
    }
    if (!Object.prototype.hasOwnProperty.call(AVENIDAS_PADRON, calle)) {
      seleccionadas.push(casa);
      continue;
    }
    if (String(casa.numero ?? '').trim() !== AVENIDAS_PADRON[calle]) {
      excluidas += 1;
      continue;
    }
    if (!candidatas.has(calle)) candidatas.set(calle, []);
    candidatas.get(calle).push(casa);
  }

  let duplicadas = 0;
  for (const grupo of candidatas.values()) {
    grupo.sort((a, b) => compararPrioridad(a, b, cuotasPorCasa));
    seleccionadas.push(grupo[0]);
    duplicadas += grupo.length - 1;
  }
  return { casas: seleccionadas, excluidas: excluidas + duplicadas, duplicadas };
}

module.exports = { AVENIDAS_PADRON, normalizarCalle, seleccionarPadronAnalisis };
