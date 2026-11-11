'use strict';
const { esViviendaVisible } = require('./viviendas-visibles.service');
// La misma vivienda puede aparecer en varias filas por sus vínculos activos.
function resumenResidentesVisibles(rows = []) {
  const viviendas = new Set(), ocupadas = new Set(), residentes = new Set();
  for (const row of rows || []) {
    if (!esViviendaVisible(row)) continue;
    const id = Number(row.id), condomino = Number(row.condominoId);
    if (!Number.isSafeInteger(id) || id <= 0) continue;
    viviendas.add(id);
    if (Number.isSafeInteger(condomino) && condomino > 0) {
      ocupadas.add(id);
      residentes.add(condomino);
    }
  }
  return { residentes_activos: residentes.size,
    viviendas_ocupadas: ocupadas.size, viviendas_totales: viviendas.size };
}
module.exports = { resumenResidentesVisibles };
