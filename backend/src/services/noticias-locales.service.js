'use strict';

const VENTANA_DIAS = 7;
const VENTANA_MS = VENTANA_DIAS * 24 * 60 * 60 * 1000;
const PATRON_CHOQUES = /\b(?:choques?|accidentes?|volcaduras?|atropellamientos?|colisiones?|carambolas?|percances?)\b/;
const PATRON_MARCHAS = /\b(?:marchas?|manifestacion(?:es)?|protestas?|bloqueos?)\b/;
const PATRON_LOCAL = /\b(?:zapopan|guadalajara|san juan de ocotan|nuevo mexico|mision jardines)\b/;
const PATRON_RUTA_INTERURBANA = /\b(?:mexico|cdmx)\s*[-–]\s*guadalajara\b/;
const PATRON_UBICACION_CONCRETA = /\b(?:zapopan|san juan de ocotan|nuevo mexico|mision jardines|en guadalajara|a la altura de guadalajara)\b/;
// Solo evalúa titulares: un artículo local podría mencionar otra ciudad en su contexto.
const PATRON_FUERA_ZONA = /\b(?:monterrey|nuevo leon|morelia|michoacan|cdmx|ciudad de mexico|queretaro|puebla|san luis potosi|tijuana|saltillo|culiacan|hermosillo|toluca|cancun|tonala|tlaquepaque|tlajomulco|puerto vallarta|tepatitlan|lagos de moreno|ocotlan)\b/;
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

function normalizarTexto(texto) {
  return String(texto || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function calleCercana(texto) {
  const contenido = normalizarTexto(texto);
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

// FreeNewsApi proporciona la imagen destacada del artículo original en "image"
// (extraída de og:image/JSON-LD). No buscar fotos por palabras clave.
function imagenNoticia(value) {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value.trim());
    // La aplicación se sirve por HTTPS; evitar contenido mixto y URLs ejecutables.
    if (url.protocol !== 'https:' || url.username || url.password || !url.hostname) return null;
    if (url.hostname === 'localhost' || url.hostname.endsWith('.localhost')) return null;
    return url.href;
  } catch (_) {
    return null;
  }
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

    const titular = normalizarTexto(title);
    const texto = normalizarTexto(`${title} ${article.description || ''}`);
    const nearbyStreet = calleCercana(texto);
    // "country=MX" solo filtra el país del medio, no la ciudad de la nota.
    // Un titular sobre Monterrey no es noticia local aunque su medio sea de Jalisco.
    if (!PATRON_LOCAL.test(texto) && !nearbyStreet) continue;
    if (PATRON_FUERA_ZONA.test(titular)) continue;
    // La carretera México–Guadalajara atraviesa varias regiones: no atribuir
    // un siniestro a la ciudad si falta una ubicación precisa dentro de ella.
    if (PATRON_RUTA_INTERURBANA.test(titular) && !PATRON_UBICACION_CONCRETA.test(texto)) continue;

    const esChoque = PATRON_CHOQUES.test(texto);
    const esMarcha = PATRON_MARCHAS.test(texto);
    const categoria = esChoque ? 'Choques' : esMarcha ? 'Marchas y bloqueos'
      : /zapopan/.test(texto) ? 'Zapopan' : 'Guadalajara';
    const fuente = normalizarTexto(`${article.sitename || ''} ${article.host || ''} ${url.hostname}`);
    const isTraficoZmg = /\btrafico\s*zmg\b/.test(fuente) ||
      /^(?:www\.)?traficozmg\.com$/.test(url.hostname.toLowerCase());

    noticias.push({
      title,
      url: url.href,
      imageUrl: imagenNoticia(article.image),
      domain: article.sitename || article.domain || article.host || url.hostname,
      seenDate: fecha.toISOString(),
      dateLabel: article.published_at ? 'Publicada' : 'Detectada',
      category: categoria,
      nearbyStreet,
      isTrafficEvent: esChoque || esMarcha,
      isTraficoZmg,
      sourceCountry: article.country || article.sourcecountry || '',
      language: article.lang || article.language || ''
    });
  }

  // Reservar cupos a calles próximas, hechos viales y Tráfico ZMG permite que
  // haya más cobertura relevante sin alterar el orden cronológico final.
  noticias.sort((a, b) => Date.parse(b.seenDate) - Date.parse(a.seenDate));
  const seleccionadas = new Map();
  function reservar(coincide, maximo) {
    let agregadas = 0;
    for (const nota of noticias) {
      if (agregadas >= maximo || seleccionadas.size >= 12) break;
      if (coincide(nota) && !seleccionadas.has(nota.url)) {
        seleccionadas.set(nota.url, nota);
        agregadas++;
      }
    }
  }
  reservar(n => Boolean(n.nearbyStreet), 4);
  reservar(n => n.isTrafficEvent, 6);
  const fuentesPreferidas = [...seleccionadas.values()].filter(n => n.isTraficoZmg).length;
  reservar(n => n.isTraficoZmg, Math.max(0, 5 - fuentesPreferidas));
  reservar(() => true, 12);
  return [...seleccionadas.values()].sort((a, b) =>
    Date.parse(b.seenDate) - Date.parse(a.seenDate) || Number(b.isTraficoZmg) - Number(a.isTraficoZmg));
}

module.exports = { VENTANA_DIAS, fechaGdelt, calleCercana, imagenNoticia, prepararNoticiasLocales };
