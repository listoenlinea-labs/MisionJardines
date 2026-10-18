'use strict';

const VENTANA_DIAS = 7;
const VENTANA_MS = VENTANA_DIAS * 24 * 60 * 60 * 1000;
const PATRON_VIAL = /\b(choques?|accidentes?|volcaduras?|atropellamientos?|colisiones?|carambolas?)\b/i;
// Solo se marca una vía como cercana si el texto habla de una calle/avenida:
// "Guadalajara" o "Valle de México" a secas pueden referirse a otras regiones.
const CALLES_CERCANAS = [
  { nombre: 'Calle Atotonilco', patron: /\b(?:calle|c\.?|avenida|av\.?)\s+atotonilco\b/ },
  { nombre: 'Avenida Valle de México', patron: /\b(?:avenida|av\.?)\s+valle de mexico\b/ },
  { nombre: 'Avenida Guadalajara', patron: /\b(?:avenida|av\.?)\s+guadalajara\b/ },
  { nombre: 'Avenida Acueducto', patron: /\b(?:avenida|av\.?)\s+acueducto\b/ },
  { nombre: 'Avenida Base Aérea', patron: /\b(?:avenida|av\.?)\s+base aerea\b/ },
  { nombre: 'Avenida Aviación', patron: /\b(?:avenida|av\.?)\s+aviacion\b/ }
];

function calleCercana(texto) {
  const contenido = String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return CALLES_CERCANAS.find(calle => calle.patron.test(contenido))?.nombre || null;
}

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

    const texto = `${title} ${article.description || ''}`;
    const nearbyStreet = calleCercana(texto);
    const esVial = PATRON_VIAL.test(texto);
    const categoria = esVial ? 'Choques' : /zapopan/i.test(title) ? 'Zapopan'
      : /guadalajara/i.test(title) ? 'Guadalajara' : 'Noticias';

    noticias.push({
      title,
      url: url.href,
      domain: article.sitename || article.domain || article.host || url.hostname,
      seenDate: fecha.toISOString(),
      dateLabel: article.published_at ? 'Publicada' : 'Detectada',
      category: categoria,
      nearbyStreet,
      sourceCountry: article.country || article.sourcecountry || '',
      language: article.lang || article.language || ''
    });
  }

  // Las vialidades identificadas tienen prioridad absoluta; después vienen
  // hasta cuatro notas viales y finalmente la cobertura local más reciente.
  noticias.sort((a, b) => Date.parse(b.seenDate) - Date.parse(a.seenDate));
  const cercanas = noticias.filter(n => n.nearbyStreet).slice(0, 6);
  const viales = noticias.filter(n => !n.nearbyStreet && n.category === 'Choques').slice(0, 4);
  const resto = noticias.filter(n => !n.nearbyStreet && n.category !== 'Choques')
    .sort((a, b) => {
      const categoria = { Zapopan: 0, Guadalajara: 1, Noticias: 2 };
      return (categoria[a.category] ?? 3) - (categoria[b.category] ?? 3)
        || Date.parse(b.seenDate) - Date.parse(a.seenDate);
    });
  return [...cercanas, ...viales, ...resto].slice(0, 12);
}

module.exports = { VENTANA_DIAS, fechaGdelt, calleCercana, prepararNoticiasLocales };
