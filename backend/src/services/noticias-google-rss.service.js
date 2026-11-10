'use strict';

// Google Noticias RSS no requiere clave ni consultar MySQL.
// Normalizar al formato de prepararNoticiasLocales, conservando titular,
// fuente y fecha real de la nota (no la fecha de lectura).
function decodeEntities(value) {
  return String(value || '').replace(/&#(x[0-9a-f]+|\d+);|&(?:amp|lt|gt|quot|apos|nbsp);/gi, entity => {
    const decimal = /^&#(x[0-9a-f]+|\d+);$/i.exec(entity);
    if (decimal) {
      const number = decimal[1].toLowerCase().startsWith('x')
        ? parseInt(decimal[1].slice(1), 16) : Number(decimal[1]);
      return Number.isInteger(number) && number >= 0 && number <= 0x10ffff
        ? String.fromCodePoint(number) : '';
    }
    return { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"',
      '&apos;': "'", '&nbsp;': ' ' }[entity.toLowerCase()] || entity;
  });
}
function field(block, tag) {
  const match = new RegExp('<' + tag + '(?:\\s[^>]*)?>([\\s\\S]*?)<\\/' + tag + '>', 'i').exec(block);
  if (!match) return '';
  return decodeEntities(match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')).trim();
}
function parseGoogleRss(xml) {
  if (typeof xml !== 'string' || !/<rss\b/i.test(xml)) throw new Error('La fuente RSS no devolvió XML válido');
  const results = [];
  const matches = xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) || [];
  for (const block of matches.slice(0, 80)) {
    const title = field(block, 'title');
    const url = field(block, 'link');
    const date = field(block, 'pubDate');
    const source = field(block, 'source');
    const description = field(block, 'description').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
    if (!title || !/^https:\/\//i.test(url) || !Number.isFinite(Date.parse(date))) continue;
    results.push({
      title, url, published_at: new Date(date).toISOString(),
      description, sitename: source || 'Google Noticias', country: 'MX', lang: 'es'
    });
  }
  return results;
}
function rssUrl(term) {
  const url = new URL('https://news.google.com/rss/search');
  url.searchParams.set('q', term);
  url.searchParams.set('hl', 'es-419');
  url.searchParams.set('gl', 'MX');
  url.searchParams.set('ceid', 'MX:es-419');
  return url;
}
async function fetchGoogleRss(term, fetchImpl = fetch) {
  const url = rssUrl(term);
  const response = await fetchImpl(url, {
    headers: { 'User-Agent': 'MisionJardines/1.0 (noticias locales)' },
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) throw new Error('Google Noticias RSS respondió ' + response.status);
  const xml = await response.text();
  if (xml.length > 1500000) throw new Error('RSS demasiado grande');
  return parseGoogleRss(xml);
}
module.exports = { decodeEntities, parseGoogleRss, rssUrl, fetchGoogleRss };
