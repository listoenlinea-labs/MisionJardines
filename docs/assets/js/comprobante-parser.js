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
  const monthPattern = '(?:ENERO|ENE|FEBRERO|FEB|MARZO|MAR|ABRIL|ABR|MAYO|MAY|JUNIO|JUN|JULIO|JUL|AGOSTO|AGO|SEPTIEMBRE|SETIEMBRE|SEPT|SEP|SET|OCTUBRE|OCT|NOVIEMBRE|NOV|DICIEMBRE|DIC)';
  const namedDatePattern = '\\b(\\d{1,2})(?:\\s*(?:DE\\s+)?|\\s*[-/.]\\s*)(' + monthPattern + ')\\.?(?:\\s*(?:DE\\s+)?|\\s*[-/.]\\s*)(20\\d{2}|\\d{2})\\b';
  function fechaValida(y, m, d) {
    const t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
  }
  function fecha(text) {
    const src = normal(text);
    let m = src.match(new RegExp(namedDatePattern));
    if (m) {
      const d = Number(m[1]), mo = months[m[2].slice(0, 3)];
      const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
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
  function montoCerca(lines, labels) {
    const otherField = /\b(?:ORIGEN|DESTINO|BENEFICIARIO|DESTINATARIO|CUENTA|CLABE|TARJETA|COMISION|COMISIONES|RETENCION|RETENCIONES|IMPUESTO|IMPUESTOS|IVA|SALDO|CONCEPTO|REFERENCIA|FOLIO|CLAVE|FECHA|HORA)\b/;
    const amountOnly = /^(?:(?:MXN|M\.N\.|PESOS)\s*)?[-−]?\s*\$?\s*[-−]?\s*(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?)\s*(?:MXN|M\.N\.|PESOS)?[.;]?$/;
    for (const label of labels) for (let i = 0; i < lines.length; i++) {
      const line = normal(lines[i]);
      const found = line.match(label);
      if (!found || otherField.test(line.slice(0, found.index))) continue;
      const remainder = line.slice(found.index + found[0].length).replace(/^\s*[:#=.-]\s*/, '').trim();
      for (const sample of [remainder, normal(lines[i + 1] || ''), normal(lines[i + 2] || '')]) {
        if (!sample) continue;
        const field = sample.match(otherField);
        const candidate = (field ? sample.slice(0, field.index) : sample).trim();
        // Never interpret an account suffix, reference or date as money. A mixed
        // OCR row needs explicit monetary evidence before another field starts.
        const token = candidate.match(amountOnly);
        if (token && (!field || /\$|[.,]\d{2}(?:\D|$)|MXN|PESOS|M\.N\./.test(candidate))) {
          const amount = monto(token[1]);
          if (amount) return amount;
        }
        if (field) break;
      }
    }
    return '';
  }
  // Respaldo por posición: nunca confundir un importe de otra sección con el depósito.
  const nonPayment = /\b(?:COMISION|COMISIONES|RETENCION|RETENCIONES|IMPUESTO|IMPUESTOS|IVA|SALDO|DISPONIBLE|COSTO|CARGO|LIMITE|CUENTA|CLABE|TARJETA|ORIGEN|DESDE|DESTINO|BENEFICIARIO|DESTINATARIO|CONCEPTO|REFERENCIA|FOLIO|RASTREO)\b/;
  const moneyToken = /\$\s*(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?)(?![\d.,])/g;
  const unique = values => {
    const candidates = [...new Set(values.filter(Boolean))];
    return candidates.length === 1 ? candidates[0] : '';
  };
  function montoFlexible(lines) {
    const explicit = [], dollars = [];
    for (let i = 0; i < lines.length; i++) {
      const line = normal(lines[i]);
      const payment = line.match(/\b(?:ENVIASTE|TRANSFERISTE|TRANSFERENCIA\s+POR)\b/);
      if (payment && !nonPayment.test(line.slice(0, payment.index))) {
        const tail = line.slice(payment.index + payment[0].length).replace(/^\s*[:=-]\s*/, '').trim();
        // Sólo el valor inmediatamente posterior a la expresión de pago.
        const sample = tail || normal(lines[i + 1] || '');
        const m = sample.match(/^(?:MXN\s*)?\$?\s*(\d{1,3}(?:[.,]\d{3})+(?:[.,]\d{2})?|\d+(?:[.,]\d{2})?)(?=\s|$)/);
        if (m) explicit.push(monto(m[1]));
        continue;
      }
      if (nonPayment.test(line)) continue;
      // Un importe aislado bajo Cuenta/Comisión/Saldo pertenece a esa sección.
      if (nonPayment.test(normal(lines[i - 1] || '')) && /^\s*\$/.test(line)) continue;
      for (const m of line.matchAll(moneyToken)) dollars.push(monto(m[1]));
    }
    return explicit.length ? unique(explicit) : unique(dollars);
  }
  function fechaFlexible(lines) {
    const candidates = [];
    const dateRow = new RegExp('^(?:' + namedDatePattern + '|\\d{4}[-/.]\\d{1,2}[-/.]\\d{1,2}|\\d{1,2}[-/.]\\d{1,2}[-/.](?:20\\d{2}|\\d{2}))(?:[ ,T]+(?:[01]?\\d|2[0-3]):[0-5]\\d(?::[0-5]\\d)?\\s*(?:H\\.?)?)?[ .]*$');
    for (let i = 0; i < lines.length; i++) {
      const line = normal(lines[i]);
      const mercadoPagoDate=/^\d{1,2}\s*[/.-]\s*[A-Z]+\s*[/.-]\s*20\d{2}\s+A\s+LAS\s+\d{1,2}:\d{2}\b/.test(line);
      if ((!dateRow.test(line) && !mercadoPagoDate) ||
          /\b(?:VENCIMIENTO|EXPIRACION|EMISION|IMPRESION|CONSULTA|CORTE|LIMITE|SESION)\b/.test(normal(lines[i - 1] || ''))) continue;
      const date = fecha(line);
      if (date) candidates.push({ date, time: hora(line) });
    }
    const date = unique(candidates.map(c => c.date));
    return { date, time: date ? unique(candidates.filter(c => c.date === date).map(c => c.time)) : '' };
  }
  function horaAislada(lines) {
    return unique(lines.filter((line, i) => /^(?:HORA\s*:?\s*)?(?:[01]?\d|2[0-3]):[0-5]\d(?::[0-5]\d)?\s*(?:H\.?)?$/i.test(line) &&
      !/\b(?:SESION|VENCIMIENTO|EXPIRACION|IMPRESION|CONSULTA)\b/.test(normal(lines[i - 1] || ''))).map(hora));
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
        if (type === 'date') {
          const d = fecha(sample); if (d) return { date: d, time: hora(sample) || hora(normal(lines[i+1] || '')) };
        }
      }
    }
    return type === 'date' ? { date: '', time: '' } : '';
  }
  // Un identificador de rastreo NO es un folio ni una referencia de concepto.
  // Sólo se lee cuando la etiqueta bancaria aparece en cualquier región del OCR.
  function claveRastreo(text) {
    const lines = String(text || '').replace(/\r/g, '').split(/\n/).map(x=>normal(x).trim()).filter(Boolean);
    const results = new Set();
    for (let i=0;i<lines.length;i++) {
      const label=lines[i].match(/\bCLAVE\s*(?:DE\s*)?RASTRE[O0]\b/);
      if (!label) continue;
      const parts=[lines[i].slice(label.index+label[0].length).replace(/^\s*[:#=.-]\s*/, '').trim()];
      for (let j=i+1;j<Math.min(lines.length,i+4);j++) {
        const line=lines[j];
        if (/\b(?:CONCEPTO|REFERENCIA|FOLIO|TIPO\s+DE|COMISION|FECHA|MONTO|CUENTA|OPERACION|VERIFICA|CONSULTA|BENEFICIARIO|ORIGEN|DESTINO)\b/.test(line)) break;
        if (!/^[A-Z0-9-]{2,90}$/.test(line)) break;
        parts.push(line);
      }
      const tokens=parts.filter(Boolean);
      // La etiqueta suele estar en una línea y el valor en la siguiente.
      // Evitar mezclar textos ajenos u otros conceptos a la clave.
      const first=tokens[0]?.replace(/[^A-Z0-9]/g,'')||'';
      if (!/^[A-Z0-9]{12,90}$/.test(first)||!/[A-Z]/.test(first)||!/[0-9]/.test(first)) continue;
      const extra=tokens.slice(1).filter(x=>/^[A-Z0-9-]{2,12}$/.test(x)).map(x=>x.replace(/-/g,'')).join('');
      const candidate=(first+extra).slice(0,100);
      if (candidate.length<=90) results.add(candidate);
    }
    return results.size===1 ? [...results][0] : '';
  }

  function referenciaBancaria(text) {
    const lines=String(text||'').replace(/\r/g,'').split(/\n/).map(line=>normal(line).trim()).filter(Boolean);
    const values=new Set();
    for(let i=0;i<lines.length;i++) {
      const label=lines[i].match(/\bREFERENCIA(?:\s+NUMERICA)?\b/);
      if(!label)continue;
      const rest=lines[i].slice(label.index+label[0].length).replace(/^\s*[:#=.-]\s*/,'').trim();
      for(const sample of [rest,lines[i+1]||'']) {
        const m=sample.match(/^\s*(\d{5,20})(?!\d)(?:\s|$)/);
        if(m){values.add(m[1]);break}
        if(sample&&/[A-Z]/.test(sample))break;
      }
    }
    return values.size===1?[...values][0]:'';
  }
  function horaOperacion(text) {
    const lines=String(text||'').replace(/\r/g,'').split(/\n/).map(x=>normal(x).trim()).filter(Boolean);
    for(let i=0;i<lines.length;i++) {
      const m=lines[i].match(/\bHORA\s+(?:DE\s+)?OPERACION\b/);
      if(!m)continue;
      const rest=lines[i].slice(m.index+m[0].length).replace(/^\s*[:#=.-]\s*/,'').trim();
      for(const sample of [rest,lines[i+1]||'']) {
        if(!sample)continue;
        if(/^[A-Z]/.test(sample))break;
        const time=hora(sample);if(time)return time;
      }
    }
    return '';
  }
  // Cada lectura OCR debe analizarse de manera independiente. Concatenar
  // resultados directamente puede juntar la etiqueta de un campo con el
  // valor de otro y producir una coincidencia bancaria falsa.
  const OCR_PASS_MARKER = '\n=== MJ OCR RELECTURA ===\n';
  // Mercado Pago Wallet: la pantalla incluye un "Comprobante" propio,
  // distinto de la clave de rastreo SPEI y del concepto de vivienda.
  function folioMercadoPago(text) {
    // No depender de que Tesseract lea el logotipo "Mercado Pago".
    // Sólo se admite un identificador de 10-17 dígitos rotulado "Comprobante".
    const lines=String(text||'').split(/\r?\n/).map(x=>normal(x).trim()).filter(Boolean);
    for(let i=0;i<lines.length;i++){
      const m=lines[i].match(/^COMPROBANTE\s*(?::|#)?\s*(\d{10,17})\s*$/);
      if(m)return m[1];
      if(!/^COMPROBANTE\s*:?\s*$/.test(lines[i]))continue;
      const next=(lines[i+1]||'').match(/^#?\s*(\d{10,17})\s*$/);
      if(next)return next[1];
    }
    return '';
  }
  function extractOne(text) {
    const lines = String(text || '').replace(/\r/g, '').split(/\n/).map(s => s.trim()).filter(Boolean);
    // Do not use "Referencia", "Concepto" or "Clave de rastreo" if a folio exists.
    const folio = valueNear(lines, [/\bFOLIO\s+(?:DE\s+)?(?:OPERACION|TRANSACCION|TRANSFERENCIA)\b/, /\bNUMERO\s+DE\s+OPERACION\b/, /\bFOLIO\b/], 'folio') || folioMercadoPago(text);
    const amount = montoCerca(lines, [/\bMONTO\s+(?:TRANSFERIDO|PAGADO|ENVIADO)\b/, /\bIMPORTE\s+(?:TRANSFERIDO|PAGADO)\b/, /\b(?:MONTO|IMPORTE|TOTAL)\b/]) || montoFlexible(lines);
    const when = valueNear(lines, [/\bFECHA\s+(?:DE\s+)?(?:OPERACION|TRANSFERENCIA|PAGO)\b/, /\bFECHA\b/], 'date');
    const fallback = when.date ? when : fechaFlexible(lines);
    return { folio, claveRastreo: claveRastreo(text), referencia: referenciaBancaria(text), amount,
      date: fallback.date, time: fallback.time || horaOperacion(text) || (fallback.date ? horaAislada(lines) : '') };
  }
  function extract(text) {
    const parts = String(text || '').split(OCR_PASS_MARKER);
    const reads = parts.map(extractOne);
    const keys = ['folio', 'claveRastreo', 'referencia', 'amount', 'date', 'time'];
    const result = {};
    for (const key of keys) {
      const candidates = [...new Set(reads.map(read => read[key]).filter(Boolean))];
      // Si dos lecturas detectan valores distintos del mismo campo, no
      // elegir arbitrariamente uno: pedir otra captura.
      result[key] = candidates.length === 1 ? candidates[0] : '';
    }
    return result;
  }
  // Identificadores sin encabezado fijo (operación, autorización, ID, SPEI,
  // tracking, código de movimiento). NO se prueban contra importes o cuentas:
  // serán candidatos hasta encontrar una coincidencia exacta en Titan.
  function candidatosOperacion(text) {
    const excluded=/\b(?:CUENTA|CLABE|TARJETA|ORIGEN|DESTINO|BENEFICIARIO|DESTINATARIO|SALDO|COMISION|IVA|IMPUESTO|RETENCION|MONTO|IMPORTE|TOTAL|FECHA|HORA|RFC|CURP|TELEFONO|CELULAR|CONCEPTO|VENCIMIENTO|CORTE|CODIGO\s+POSTAL)\b/;
    const label=/\b(?:FOLIO|REFERENCIA|RASTREO|OPERACION|TRANSACCION|MOVIMIENTO|AUTORIZACION|CONFIRMACION|SEGUIMIENTO|IDENTIFICADOR|SPEI|ID)\b/;
    const found=new Set();
    for(const lectura of String(text||'').split(OCR_PASS_MARKER)){
      const lines=lectura.replace(/\r/g,'').split(/\n/).map(s=>normal(s).trim()).filter(Boolean);
      for(let i=0;i<lines.length;i++){
        const line=lines[i];
        if(excluded.test(line)||fecha(line)||hora(line))continue;
        const hasLabel=label.test(line);
        const samples=hasLabel?[line,lines[i+1]||'']: [line];
        for(const sample of samples){
          if(excluded.test(sample)||fecha(sample)||hora(sample))continue;
          const matches=sample.match(/[A-Z0-9][A-Z0-9-]{5,78}/g)||[];
          for(const token of matches){
            const value=token.replace(/-/g,'');
            if(!/\d/.test(value)||!(/^[0-9]{7,17}$/.test(value)||/^[A-Z0-9]{12,80}$/.test(value)))continue;
            if(/^(?:20\d{6}|19\d{6})$/.test(value)||/^0+$/.test(value))continue;
            if(!hasLabel&&!/^[A-Z0-9-]+$/.test(sample))continue;
            if(value.length>70||/^[A-Z]+$/.test(value))continue;
            found.add(value);
            // Clave de rastreo larga cortada por salto de línea OCR.
            if(i+1<lines.length&&/^[0-9]{2,5}$/.test(lines[i+1])&&value.length>=12)
              found.add(value+lines[i+1]);
          }
        }
      }
    }
    return [...found].slice(0,30);
  }
  function verifyDestinationOne(text, owner, suffix) {
    const lines = String(text || '').replace(/\r/g, '').split(/\n/).map(x => x.trim()).filter(Boolean);
    const desiredName = clean(owner).replace(/[0-9]+/g, '').trim();
    const last4 = String(suffix || '').replace(/\D/g, '').slice(-4);
    // Variaciones frecuentes del OCR de fotografías: nombre con palabras
    // repetidas/separadas o 0 por O. Exigir al menos tres palabras distintivas
    // del beneficiario, incluidos apellidos, SIEMPRE en sección Destino.
    const ownerParts = desiredName.split(/\s+/).filter(w => !['DEL','DE','LA','LAS','LOS','EL'].includes(w));
    const token = w => w.replace(/0/g, 'O').replace(/1/g, 'I');
    const ownerIn = raw => {
      const normalized = clean(raw);
      if (normalized.includes(desiredName)) return true;
      if (ownerParts.length < 4) return false;
      const words = new Set(normalized.split(/\s+/).map(token));
      const matched = ownerParts.filter(w => words.has(token(w)));
      const surnames = ownerParts.slice(-2);
      return matched.length >= ownerParts.length - 1 &&
        surnames.some(w => words.has(token(w))) &&
        ownerParts.slice(0, -2).some(w => words.has(token(w)));
    };
    // Admitir CLABE/cuenta/tarjeta completas (10-22 dígitos), no sólo los
    // últimos cuatro impresos por separado.
    const destinoNumero = raw =>
      [...raw.matchAll(/(?:^|\D)(\d{4,22})(?!\d)/g)].some(m => m[1].endsWith(last4));
    if (!desiredName || last4.length !== 4) return { ok: false, owner: false, suffix: false, message: 'La cuenta receptora no está configurada correctamente.' };
    // Mercado Pago muestra "Origen y destino" como CABECERA y después dos
    // identidades con sus respectivos identificadores. No se deben mezclar
    // la persona remitente ni la CLABE de origen con la cuenta receptora.
    const start=lines.findIndex(line=>/^\s*ORIGEN\s+(?:Y|\/)\s+DESTINO\b/.test(normal(line)));
    if(start>=0){
      const registros=[];
      let previo=start;
      for(let j=start+1;j<Math.min(lines.length,start+24);j++){
        const line=normal(lines[j]);
        if(/^\s*(?:COMPROBANTE|REFERENCIA|DETALLES?\s+DE\s+OPERACION)\s*(?:#|:|$)/.test(line))break;
        if(!/\b(?:CLABE|TARJETA|CUENTA|NUMERO\s+DE\s+TARJETA)\b/.test(line))continue;
        const bloqueIdentificador=[line,normal(lines[j+1]||'')].join(' ');
        const numeros=[...bloqueIdentificador.matchAll(/(?:^|\D)(\d{4,22})(?!\d)/g)].map(m=>m[1]);
        if(!numeros.length)continue;
        const identidad=lines.slice(previo+1,j).map(normal).join(' ');
        registros.push({owner:ownerIn(identidad),suffix:numeros.some(n=>n.endsWith(last4))});
        previo=j;
      }
      // Es obligatorio que el último registro corresponda al RECEPTOR.
      // Si no tenemos dos registros fiables, utilizar sólo otros marcadores
      // explícitos y nunca interpretar "Origen y destino" como "Destino".
      if(registros.length>=2){
        const destino=registros[registros.length-1];
        return destino.owner&&destino.suffix
          ?{ok:true,owner:true,suffix:true,message:''}
          :{ok:false,owner:destino.owner,suffix:destino.suffix,
            message:!destino.owner?'El beneficiario receptor no coincide en la sección Destino.':
              'La tarjeta, cuenta o CLABE receptora no coincide con los destinos oficiales.'};
      }
    }
    let best = { owner: false, suffix: false };
    for (let i = 0; i < lines.length; i++) {
      const line = normal(lines[i]);
      const marker = line.match(/\b(?:DESTINO|BENEFICIARIO|DESTINATARIO|CUENTA\s+DESTINO|CUENTA\s+RECEPTORA|CUENTA\s+BENEFICIARIA|TARJETA\s+(?:DESTINO|RECEPTORA)|CLABE\s+(?:DESTINO|RECEPTORA)|A\s+FAVOR\s+DE|A\s+NOMBRE\s+DE|RECEPTOR|RECIBE|ENVIADO\s+A|ENVIASTE\s+A|TRANSFERISTE\s+A|TRANSFERENCIA\s+A|PARA)\b/);
      if (!marker || /^\s*ORIGEN\s+(?:Y|\/)\s+DESTINO\b/.test(line)) continue;
      const sample = [line.slice(marker.index + marker[0].length)];
      for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
        if (/^\s*(?:ORIGEN|DESDE|CUENTA\s+(?:DE\s+)?(?:ORIGEN|RETIRO)|COMISION|CONCEPTO|REFERENCIA|FOLIO|CLAVE\s+DE\s+RASTREO|FECHA\s+DE\s+OPERACION)\b/.test(normal(lines[j]))) break;
        sample.push(normal(lines[j]));
      }
      const raw = sample.join(' ');
      const seen = {
        owner: ownerIn(raw),
        suffix: destinoNumero(raw)
      };
      if (seen.owner && seen.suffix) return { ok: true, owner: true, suffix: true, message: '' };
      if (Number(seen.owner) + Number(seen.suffix) > Number(best.owner) + Number(best.suffix)) best = seen;
    }
    // BBVA Detalle de movimiento presenta beneficiario y CLABE receptora en
    // renglones separados; nunca confundir con "Cuenta de retiro" del emisor.
    let nombreDetallado=false,clabeDestino=false;
    for(let i=0;i<lines.length;i++){
      const l=normal(lines[i]);
      if(/\bNOMBRE\s+DEL\s+BENEFICIARIO\b/.test(l)){
        const bloque=[l,...lines.slice(i+1,i+5).map(normal)].join(' ');
        if(ownerIn(bloque)) nombreDetallado=true;
      }
      if(/\b(?:CUENTA\s*\(\s*CLABE|CUENTA\s+DESTINO|CLABE\s+DESTINO|CUENTA\s+RECEPTORA)\b/.test(l)){
        const bloque=[l,...lines.slice(i+1,i+3).map(normal)].join(' ');
        const cuentas=bloque.match(/\b\d{10,22}\b/g)||[];
        if(cuentas.some(c=>c.endsWith(last4)))clabeDestino=true;
      }
    }
    if(nombreDetallado&&clabeDestino)return {ok:true,owner:true,suffix:true,message:''};
    best={owner:best.owner||nombreDetallado,suffix:best.suffix||clabeDestino};
    return {
      ok: false, ...best,
      message: !best.owner && !best.suffix ? 'No se encontró el beneficiario ni la terminación de cuenta en la sección Destino.'
        : !best.owner ? 'El beneficiario del comprobante no coincide con la cuenta de Misión Jardines.'
        : 'No se encontró la terminación de cuenta ' + last4 + ' junto al beneficiario.'
    };
  }
  function verifyDestination(text, owner, suffix) {
    if (Array.isArray(suffix)) {
      // Nombre y terminación deben coincidir en el mismo pase OCR.
      const permitidas=[...new Set(suffix.map(x=>String(x||'').replace(/\D/g,'').slice(-4))
        .filter(x=>/^\d{4}$/.test(x)))];
      const checks=permitidas.map(value=>({...verifyDestination(text,owner,value),matchedSuffix:value}));
      const confirmado=checks.find(x=>x.ok);
      if(confirmado)return confirmado;
      const mejor=checks.find(x=>x.owner&&x.suffix)||checks.find(x=>x.owner)||checks.find(x=>x.suffix)
        ||checks[0]||verifyDestination(text,owner,'');
      return {...mejor,matchedSuffix:'',
        message:!mejor.owner?'No se pudo comprobar el beneficiario receptor en la sección Destino.':
          'No se encontró junto al beneficiario ninguna terminación bancaria autorizada ('+permitidas.join(', ')+').'};
    }
    const readings = String(text || '').split(OCR_PASS_MARKER);
    const checks = readings.map(part => verifyDestinationOne(part, owner, suffix));
    // Beneficiario y terminación deben coincidir EN LA MISMA lectura.
    return checks.find(check => check.ok)
      || checks.find(check => check.owner && check.suffix)
      || checks.find(check => check.owner || check.suffix)
      || checks[0];
  }
  return { extract, candidatosOperacion, claveRastreo, referenciaBancaria, verifyDestination, fecha, hora, monto, OCR_PASS_MARKER };
});
