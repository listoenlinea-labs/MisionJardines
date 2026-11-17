'use strict';

function leerNumero(texto) {
  // El símbolo puede estar presente o ausente. Un dígito inicial siempre
  // se conserva: nunca se prueba una subcadena contra el aviso bancario.
  return /^#?\s*(\d{10,17})$/.exec(String(texto || '').trim())?.[1] || '';
}

function localizarRenglon(blocks) {
  const lines = (blocks || []).flatMap(block =>
    (block.paragraphs || []).flatMap(paragraph => paragraph.lines || []))
    .filter(line => {
      const b = line.bbox;
      return b && [b.x0, b.x1, b.y0, b.y1].every(Number.isInteger) &&
        b.x0 >= 0 && b.y0 >= 0 && b.x1 > b.x0 && b.y1 > b.y0;
    });
  const labels = lines.filter(line => /^comprobante\s*:?$/i.test(line.text.trim()));
  if (labels.length !== 1) return null;
  const label = labels[0].bbox;
  const height = label.y1 - label.y0;
  const below = lines.filter(({ bbox: b }) =>
    b.y0 >= label.y1 - 2 && b.y0 - label.y1 <= height * 3 &&
    Math.abs(b.x0 - label.x0) <= height * 2)
    .sort((a, b) => a.bbox.y0 - b.bbox.y0);
  const line = below[0];
  if (!line || !leerNumero(line.text) ||
      (below[1] && below[1].bbox.y0 < line.bbox.y1)) return null;
  const b = line.bbox;
  // Incluir margen a la izquierda para no cortar un símbolo que el primer
  // pase haya omitido. No recortar caracteres internos ni unir renglones.
  const left = Math.max(0, Math.min(label.x0, b.x0) - 8);
  const top = Math.max(label.y1, b.y0 - 7);
  return { left, top, width: b.x1 + 8 - left, height: b.y1 + 7 - top };
}
module.exports = { leerNumero, localizarRenglon };
