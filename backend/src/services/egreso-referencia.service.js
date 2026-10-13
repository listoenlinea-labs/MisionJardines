'use strict';

// El ID autoincremental garantiza referencias distintas incluso cuando dos
// administradores registran egresos durante el mismo segundo.
function referenciaEgreso(fecha, id) {
  const day = String(fecha || '');
  const number = Number(id);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isSafeInteger(number) || number < 1) {
    throw new Error('La fecha o el identificador del egreso no son válidos');
  }
  return 'EGR-' + day.replace(/-/g, '') + '-' + String(number).padStart(6, '0');
}
module.exports = { referenciaEgreso };
