const express = require('express');
const { autenticarToken } = require('../middlewares/auth.middleware');

const router = express.Router();

const ADDRESS = process.env.MISION_JARDINES_ADDRESS ||
  'C. Atotonilco 700, 45138 Nuevo México, Zapopan, Jalisco, México';

const cache = new Map();
function getCached(key, maxAgeMs) {
  const item = cache.get(key);
  if (!item || Date.now() - item.at > maxAgeMs) return null;
  return item.value;
}
function setCached(key, value) {
  cache.set(key, { at: Date.now(), value });
  return value;
}

async function fetchJson(url, timeoutMs = 8000) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'MisionJardines/1.0' },
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error('Servicio externo respondió ' + response.status + (body ? ': ' + body.slice(0, 120) : ''));
  }
  return response.json();
}

function incidentLabel(category) {
  return ({
    0: 'Incidente',
    1: 'Accidente',
    2: 'Niebla',
    3: 'Condición peligrosa',
    4: 'Lluvia',
    5: 'Hielo',
    6: 'Congestión',
    7: 'Carril cerrado',
    8: 'Vialidad cerrada',
    9: 'Obras',
    10: 'Viento',
    11: 'Inundación',
    14: 'Vehículo averiado'
  })[Number(category)] || 'Incidente vial';
}

router.get('/config', autenticarToken, (req, res) => {
  res.json({
    ok: true,
    data: {
      address: ADDRESS,
      googleMapsKey: process.env.GOOGLE_MAPS_BROWSER_API_KEY || '',
      trafficIncidentsConfigured: Boolean(process.env.TOMTOM_API_KEY),
      newsProvider: 'GDELT'
    }
  });
});

router.get('/incidencias', autenticarToken, async (req, res) => {
  try {
    const key = process.env.TOMTOM_API_KEY;
    if (!key) {
      return res.json({
        ok: true,
        configured: false,
        data: [],
        message: 'Configura TOMTOM_API_KEY para mostrar accidentes, obras y cierres cercanos.'
      });
    }

    const cached = getCached('incidents', 2 * 60 * 1000);
    if (cached) return res.json(cached);

    const geocodeUrl = new URL(
      'https://api.tomtom.com/search/2/geocode/' + encodeURIComponent(ADDRESS) + '.json'
    );
    geocodeUrl.searchParams.set('key', key);
    geocodeUrl.searchParams.set('limit', '1');
    geocodeUrl.searchParams.set('countrySet', 'MX');

    const geocode = await fetchJson(geocodeUrl);
    const position = geocode.results?.[0]?.position;
    if (!position) throw new Error('No fue posible ubicar Misión Jardines en TomTom.');

    const lat = Number(position.lat);
    const lon = Number(position.lon);
    const radiusKm = 5;
    const latDelta = radiusKm / 111;
    const lonDelta = radiusKm / (111 * Math.cos(lat * Math.PI / 180));
    const bbox = [
      lon - lonDelta,
      lat - latDelta,
      lon + lonDelta,
      lat + latDelta
    ].join(',');

    const incidentsUrl = new URL('https://api.tomtom.com/traffic/services/5/incidentDetails');
    incidentsUrl.searchParams.set('key', key);
    incidentsUrl.searchParams.set('bbox', bbox);
    incidentsUrl.searchParams.set('language', 'es-MX');
    incidentsUrl.searchParams.set('timeValidityFilter', 'present');

    const payload = await fetchJson(incidentsUrl);
    const data = (payload.incidents || [])
      .map(item => {
        const p = item.properties || {};
        return {
          id: p.id,
          category: Number(p.iconCategory || 0),
          type: incidentLabel(p.iconCategory),
          description: p.events?.[0]?.description || incidentLabel(p.iconCategory),
          from: p.from || '',
          to: p.to || '',
          delaySeconds: Number(p.delay || 0),
          lengthMeters: Number(p.length || 0),
          magnitude: Number(p.magnitudeOfDelay || 0),
          startTime: p.startTime || null,
          endTime: p.endTime || null,
          geometry: item.geometry || null
        };
      })
      .sort((a, b) => b.magnitude - a.magnitude || b.delaySeconds - a.delaySeconds)
      .slice(0, 12);

    const result = {
      ok: true,
      configured: true,
      center: { lat, lng: lon },
      radiusKm,
      data,
      updatedAt: new Date().toISOString()
    };
    setCached('incidents', result);
    return res.json(result);
  } catch (error) {
    console.error('Error consultando incidencias de tráfico:', error);
    return res.status(502).json({
      ok: false,
      message: 'No fue posible consultar las incidencias cercanas.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

router.get('/noticias', autenticarToken, async (req, res) => {
  try {
    const cached = getCached('news', 5 * 60 * 1000);
    if (cached) return res.json(cached);

    const url = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
    url.searchParams.set('query', '(Guadalajara OR Zapopan OR Jalisco OR "Nuevo México") sourcelang:spanish');
    url.searchParams.set('mode', 'artlist');
    url.searchParams.set('format', 'json');
    url.searchParams.set('maxrecords', '15');
    url.searchParams.set('timespan', '24h');
    url.searchParams.set('sort', 'datedesc');

    const payload = await fetchJson(url, 10000);
    const data = (payload.articles || []).slice(0, 12).map(article => ({
      title: article.title || 'Noticia local',
      url: article.url,
      domain: article.domain || '',
      seenDate: article.seendate || null,
      sourceCountry: article.sourcecountry || '',
      language: article.language || ''
    }));

    const result = {
      ok: true,
      provider: 'GDELT',
      queryWindow: '24h',
      data,
      updatedAt: new Date().toISOString()
    };
    setCached('news', result);
    return res.json(result);
  } catch (error) {
    console.error('Error consultando noticias locales:', error);
    return res.status(502).json({
      ok: false,
      message: 'No fue posible consultar noticias cercanas en este momento.',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

module.exports = router;
