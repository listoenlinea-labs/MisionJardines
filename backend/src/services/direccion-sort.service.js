'use strict';

// Ordena direcciones para la interfaz: nunca modifica calle física, casa_id ni TAGs.
const collator = new Intl.Collator('es-MX', { numeric: true, sensitivity: 'base' });
const street = item => String(item?.calleCorrecta || item?.calle_correcta || item?.calle || '').trim();
const number = item => String(item?.numero ?? item?.numeroCasa ?? '').trim();
function compararDirecciones(a, b) {
  return collator.compare(street(a), street(b))
    || collator.compare(number(a), number(b))
    || Number(a?.id || a?.casaId || 0) - Number(b?.id || b?.casaId || 0);
}
function ordenarDirecciones(items) { return [...items].sort(compararDirecciones); }
function ordenarCalles(items) { return [...items].sort((a,b)=>collator.compare(String(a||''),String(b||''))); }
module.exports = { compararDirecciones, ordenarDirecciones, ordenarCalles };
