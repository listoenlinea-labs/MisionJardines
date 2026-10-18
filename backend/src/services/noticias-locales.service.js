'use strict';

const VENTANA_DIAS = 7;
const VENTANA_MS = VENTANA_DIAS * 24 * 60 * 60 * 1000;
const PATRON_VIAL = /\b(choques?|accidentes?|volcaduras?|atropellamientos?|colisiones?|carambolas?)\b/i;

// GDELT devuelve la fecha de detección en formato 20261018T050000Z;
// FreeNewsApi devuelve la fecha editorial de publicación en ISO 8601.
function fechaGdelt(value) {
  if (typeof value !== 'string') return null;
  const match = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(value);
  const date = match
    ? new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`)
    : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function prepararNoticiasLocales(articles, now = new Date()) {
  const fechaActual = now.getTime();
  const cutoff = fechaActual - VENTANA_MS;
  const vistas = new Set();
  const noticias = [];

  for (const article of Array.isArray(articles) ? articles : []) {
    const fecha = fechaGdelt(article.published_at || article.seendate);
    if (!fecha || fecha.getTime() < cutoff || fecha.getTime() > fechaActual + 5 * 60 * 1000) continue;

    let url;
    try {
      url = new URL(article.url);
      if (!['http:', 'https:'].includes(url.protocol)) continue;
    } catch (_) { continue; }

    const title = String(article.title || '').trim();
    if (!title || vistas.has(url.href)) continue;
    vistas.add(url.href);

    const esVial = PATRON_VIAL.test(title);
    const categoria = esVial ? 'Choques' : /zapopan/i.test(title) ? 'Zapopan'
      : /guadalajara/i.test(title) ? 'Guadalajara' : 'Noticias';

    noticias.push({
      title,
      url: url.href,
      domain: article.sitename || article.domain || article.host || url.hostname,
      seenDate: fecha.toISOString(),
      dateLabel: article.published_at ? 'Publicada' : 'Detectada',
      category: categoria,
      sourceCountry: article.country || article.sourcecountry || '',
      language: article.lang || article.language || ''
    });
  }

  // Se reservan hasta cuatro espacios para notas de choques/accidentes;
  // las demás muestran la cobertura local más reciente.
  noticias.sort((a, b) => Date.parse(b.seenDate) - Date.parse(a.seenDate));
  const viales = noticias.filter(n => n.category === 'Choques').slice(0, 4);
  return [...viales, ...noticias.filter(n => n.category !== 'Choques').slice(0, 12 - viales.length)]
    .sort((a, b) => Date.parse(b.seenDate) - Date.parse(a.seenDate));
}

module.exports = { VENTANA_DIAS, fechaGdelt, prepararNoticiasLocales };
