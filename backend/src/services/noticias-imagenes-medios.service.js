'use strict';

// Sólo consultar el artículo original de medios conocidos. La URL proviene
// de una API externa y nunca debe convertirse en un proxy SSRF arbitrario.
const DOMINIOS_EDITORIALES = [
  'informador.mx', 'eloccidental.com.mx', 'milenio.com', 'infobae.com',
  'eluniversal.com.mx', 'eleconomista.com.mx', 'vanguardia.com.mx',
  'unotv.com', 'aztecanoticias.com', 'notisistema.com', 'ntrguadalajara.com',
  'traficozmg.com', 'en15dias.com', 'noticiasdeseguros.com',
  'noticiasdeseguros.com.mx', 'mexicoenlared.com',
  'analisisnoticiasonline.com', 'publimetro.com.mx', 'aristeguinoticias.com',
  'proceso.com.mx', 'sdpnoticias.com', 'debate.com.mx', 'elheraldodemexico.com.mx'
];

function urlEditorialSegura(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/\.$/, '');
    if (url.protocol !== 'https:' || url.port || url.username || url.password) return null;
    if (!DOMINIOS_EDITORIALES.some(d => host === d || host.endsWith('.' + d))) return null;
    return url;
  } catch (_) { return null; }
}

function decodificarEntidades(value) {
  return String(value || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/gi, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}
function metadatosFoto(html, articleUrl) {
  for (const tag of String(html || '').match(/<meta\b[^>]{0,1200}>/gi) || []) {
    const attrs = {};
    for (const match of tag.matchAll(/\b([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      attrs[match[1].toLowerCase()] = match[2] ?? match[3];
    }
    const prop = String(attrs.property || attrs.name || '').toLowerCase();
    if (!['og:image', 'og:image:secure_url', 'twitter:image', 'twitter:image:src'].includes(prop)) continue;
    try {
      const image = new URL(decodificarEntidades(attrs.content), articleUrl);
      if (image.protocol !== 'https:' || image.username || image.password ||
          image.port || image.href.length > 2048 || !image.hostname) continue;
      return image.href; // metadato de ESTA noticia, no búsqueda por tema.
    } catch (_) { /* intentar el siguiente metadato */ }
  }
  return null;
}

async function fotoDelArticuloOriginal(articleUrl, {fetchImpl=fetch, timeoutMs=2500}={}) {
  const url = urlEditorialSegura(articleUrl);
  if (!url) return null;
  try {
    const response = await fetchImpl(url.href, {
      redirect: 'error',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {'User-Agent':'Mozilla/5.0 (compatible; MisionJardinesNews/1.0)',
        Accept:'text/html'}
    });
    if (!response.ok || !String(response.headers?.get('content-type') || '').toLowerCase().includes('text/html') ||
      Number(response.headers?.get('content-length') || 0) > 220000) return null;
    const limit = 220000, chunks = [];
    let bytes = 0;
    if (response.body?.getReader) {
      const reader = response.body.getReader();
      try {
        while (bytes < limit) {
          const {done, value} = await reader.read();
          if (done) break;
          const chunk = Buffer.from(value);
          chunks.push(chunk.subarray(0,limit - bytes));
          bytes += Math.min(chunk.length, limit - bytes);
        }
      } finally { await reader.cancel().catch(() => {}); }
    } else if (response.arrayBuffer) {
      chunks.push(Buffer.from(await response.arrayBuffer()).subarray(0,limit));
    }
    return metadatosFoto(Buffer.concat(chunks).toString('utf8'), url.href);
  } catch (_) { return null; }
}

module.exports = {urlEditorialSegura, metadatosFoto, fotoDelArticuloOriginal};
