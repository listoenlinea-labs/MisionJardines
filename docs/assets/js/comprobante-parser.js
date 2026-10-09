/* Lector determinista de campos OCR. Compatible con navegador y Node. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MJComprobante = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const normal = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\u00a0/g, ' ');
  const clean = s => normal(s).replace(/[^A-Z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
  const pad = n => String(n).padStart(2, '0');
  const months = { ENE: 1, FEB: 2, MAR: 3, ABR: 4, MAY: 5, JUN: 6, JUL: 7, AGO: 8, SEP: 9, SET: 9, OCT: 10, NOV: 11, DIC: 12 };
  function fechaValida(y, m, d) {
    const t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
  }
  function fecha(text) {
    const src = normal(text);
    let m = src.match(/\b(\d{1,2})\s*(?:DE\s*)?(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|SET|OCT|NOV|DIC)[A-Z]*\.?\s*(?:DE\s*)?(20\d{2})\b/);
    if (m) {
      const d = Number(m[1]), mo = months[m[2]], y = Number(m[3]);
      return fechaValida(y, mo, d) ? y + '-' + pad(mo) + '-' + pad(d) : '';
    }
    m = src.match(/\b(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
    if (m) {
      const y = +m[1], mo = +m[2], d = +m[3];
      return fechaValida(y, mo, d) ? y + '-' + pad(mo) + '-' + pad(d) : '';
    }
    m = src.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](20\d{2}|\d{2})\b/);
    if (m) {
      const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]), mo = +m[2], d = +m[1];
      return fechaValida(y, mo, d) ? y + '-' + pad(mo) + '-' + pad(d) : '';
    }
    return '';
  }
  function hora(text) {
    const m = normal(text).match(/\b([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?\b/);
    return m ? pad(m[1]) + ':' + m[2] + ':' + (m[3] || '00') : '';
  }
  function monto(text) {
    const m = String(text).match(/(?:\$\s*)?(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?)/);
    if (!m) return '';
    let n = m[1];
    const dot = n.lastIndexOf('.'), comma = n.lastIndexOf(',');
    if (dot !== -1 && comma !== -1) n = dot > comma ? n.replace(/,/g, '') : n.replace(/\./g, '').replace(',', '.');
    else if ((n.match(/[.,]/g) || []).length > 1) n = n.replace(/[.,]/g, '');
    else if (comma !== -1) n = /,\d{2}$/.test(n) ? n.replace(',', '.') : n.replace(',', '');
    else if (dot !== -1 && /\.\d{3}$/.test(n)) n = n.replace('.', '');
    const value = Number(n);
    return Number.isFinite(value) && value > 0 ? value.toFixed(2) : '';
  }
  function valueNear(lines, labels, type) {
    for (const label of labels) for (let i = 0; i < lines.length; i++) {
      const m = normal(lines[i]).match(label);
      if (!m) continue;
      const remainder = normal(lines[i]).slice(m.index + m[0].length).replace(/^\s*[:#=.-]\s*/, '').trim();
      for (const sample of [remainder, normal(lines[i+1] || ''), normal(lines[i+2] || '')]) {
        if (!sample) continue;
        if (type === 'folio') {
          const token = sample.match(/\b([A-Z0-9][A-Z0-9-]{4,})\b/);
          if (token && /\d/.test(token[1]) && !/^(REFERENCIA|CONCEPTO|FECHA|CLAVE|RASTREO)$/.test(token[1])) return token[1];
        }
        if (type === 'amount') {
          const a = monto(sample); if (a) return a;
        }
        if (type === 'date') {
          const d = fecha(sample); if (d) return { date: d, time: hora(sample) || hora(normal(lines[i+1] || '')) };
        }
      }
    }
    return type === 'date' ? { date: '', time: '' } : '';
  }
  function extract(text) {
    const lines = String(text || '').replace(/\r/g, '').split(/\n/).map(s => s.trim()).filter(Boolean);
    // Do not use "Referencia", "Concepto" or "Clave de rastreo" if a folio exists.
    const folio = valueNear(lines, [/\bFOLIO\s+(?:DE\s+)?(?:OPERACION|TRANSACCION|TRANSFERENCIA)\b/, /\bNUMERO\s+DE\s+OPERACION\b/, /\bFOLIO\b/], 'folio');
    const amount = valueNear(lines, [/\bMONTO\s+(?:TRANSFERIDO|PAGADO|ENVIADO)\b/, /\bIMPORTE\s+(?:TRANSFERIDO|PAGADO)\b/, /\b(?:MONTO|IMPORTE|TOTAL)\b/], 'amount');
    const when = valueNear(lines, [/\bFECHA\s+(?:DE\s+)?(?:OPERACION|TRANSFERENCIA|PAGO)\b/, /\bFECHA\b/], 'date');
    return { folio, amount, date: when.date, time: when.time };
  }
  function verifyDestination(text, owner, suffix) {
    const lines = String(text || '').replace(/\r/g, '').split(/\n/).map(x => x.trim()).filter(Boolean);
    const desiredName = clean(owner).replace(/[0-9]+/g, '').trim();
    const last4 = String(suffix || '').replace(/\D/g, '').slice(-4);
    if (!desiredName || last4.length !== 4) return { ok: false, owner: false, suffix: false, message: 'La cuenta receptora no está configurada correctamente.' };
    let best = { owner: false, suffix: false };
    for (let i = 0; i < lines.length; i++) {
      const line = normal(lines[i]);
      const marker = line.match(/\b(?:DESTINO|BENEFICIARIO|DESTINATARIO|CUENTA\s+DESTINO|CUENTA\s+RECEPTORA)\b/);
      if (!marker) continue;
      const sample = [line.slice(marker.index + marker[0].length)];
      for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
        if (/^\s*(?:ORIGEN|COMISION|CONCEPTO|REFERENCIA|FOLIO|CLAVE\s+DE\s+RASTREO|FECHA\s+DE\s+OPERACION)\b/.test(normal(lines[j]))) break;
        sample.push(normal(lines[j]));
      }
      const raw = sample.join(' ');
      const seen = {
        owner: clean(raw).includes(desiredName),
        suffix: new RegExp('(?:^|\\D)' + last4 + '(?!\\d)').test(raw)
      };
      if (seen.owner && seen.suffix) return { ok: true, owner: true, suffix: true, message: '' };
      if (Number(seen.owner) + Number(seen.suffix) > Number(best.owner) + Number(best.suffix)) best = seen;
    }
    return {
      ok: false, ...best,
      message: !best.owner && !best.suffix ? 'No se encontró el beneficiario ni la terminación de cuenta en la sección Destino.'
        : !best.owner ? 'El beneficiario del comprobante no coincide con la cuenta de Misión Jardines.'
        : 'No se encontró la terminación de cuenta ' + last4 + ' junto al beneficiario.'
    };
  }
  return { extract, verifyDestination, fecha, hora, monto };
});
