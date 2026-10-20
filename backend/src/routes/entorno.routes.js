const express = require('express');
const { rateLimit } = require('express-rate-limit');
const { autenticarToken } = require('../middlewares/auth.middleware');
const { VENTANA_DIAS, prepararNoticiasLocales } = require('../services/noticias-locales.service');
const {randomUUID}=require('node:crypto');
const {esImagenZmg,descargarHtmlZmg}=require('../services/noticias-imagenes-zmg.service');

const router = express.Router();

const ADDRESS = process.env.MISION_JARDINES_ADDRESS ||
  'C. Atotonilco 700, 45138 Nuevo México, Zapopan, Jalisco, México';

const cache = new Map();
// Las teselas son imágenes públicas de tráfico, pero la API key de TomTom
// permanece únicamente en el servidor. Límite de memoria y vigencia corta.
const trafficTiles = new Map();
const trafficTileRequests = new Map();
const TRAFFIC_TILE_TTL_MS = 60 * 1000;
const TRAFFIC_TILE_LIMIT = 200;
const NEWS_CACHE_LIMIT = 40;
const newsImageTokens = new Map();
function imageTokenFor(url) {
  const u=new URL(url);
  if(!esImagenZmg(u.href))return null;
  const token=randomUUID();
  newsImageTokens.set(token,{url:u.href,at:Date.now()});
  for(const [key,value] of newsImageTokens){
    if(Date.now()-value.at>30*60*1000 || newsImageTokens.size>150) newsImageTokens.delete(key);
  }
  return token;
}
const newsLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 15,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: req => String(req.usuario.usuarioId)
});
const trafficTileLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  keyGenerator: req => String(req.usuario.usuarioId)
});
function getCached(key, maxAgeMs) {
  const item = cache.get(key);
  if (!item || Date.now() - item.at > maxAgeMs) return null;
  return item.value;
}
function setCached(key, value) {
  cache.delete(key);
  cache.set(key, { at: Date.now(), value });
  while (cache.size > NEWS_CACHE_LIMIT) cache.delete(cache.keys().next().value);
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
      trafficFlowConfigured: Boolean(process.env.TOMTOM_API_KEY),
      newsProvider: 'FreeNewsApi'
    }
  });
});

// TomTom Traffic Flow: capa raster transparente para calles con circulación
// lenta (naranja) y congestionada (rojo). Se limita al área metropolitana
// cercana a Misión Jardines para no convertir el proxy en un servicio general.
router.get('/trafico/tesela/:zoom/:x/:y', autenticarToken, trafficTileLimiter, async (req, res) => {
  const key = process.env.TOMTOM_API_KEY;
  if (!key) return res.status(503).json({ ok: false, message: 'Tráfico en vivo no configurado.' });

  const { zoom, x, y } = req.params;
  if (![zoom, x, y].every(value => /^\d{1,7}$/.test(String(value)))) {
    return res.status(400).json({ ok: false, message: 'Coordenadas de mapa inválidas.' });
  }
  const [z, tileX, tileY] = [zoom, x, y].map(Number);
  const limit = 2 ** z;
  if (z < 12 || z > 17 || tileX >= limit || tileY >= limit) {
    return res.status(400).json({ ok: false, message: 'Tesela fuera del rango permitido.' });
  }

  const lat = Math.atan(Math.sinh(Math.PI * (1 - 2 * (tileY + 0.5) / limit))) * 180 / Math.PI;
  const lon = (tileX + 0.5) / limit * 360 - 180;
  if (lat < 20.55 || lat > 20.95 || lon < -103.70 || lon > -103.19) {
    return res.status(400).json({ ok: false, message: 'Tesela fuera del entorno de Misión Jardines.' });
  }

  const tileId = `${z}/${tileX}/${tileY}`;
  const cached = trafficTiles.get(tileId);
  let bytes;
  try {
    if (cached && Date.now() - cached.at < TRAFFIC_TILE_TTL_MS) {
      bytes = cached.bytes;
    } else {
      let pending = trafficTileRequests.get(tileId);
      if (!pending) {
        pending = (async () => {
          const url = new URL(`https://api.tomtom.com/traffic/map/4/tile/flow/relative0/${tileId}.png`);
          url.searchParams.set('key', key);
          const response = await fetch(url, { signal: AbortSignal.timeout(8000) });
          if (!response.ok || !response.headers.get('content-type')?.includes('image/png')) {
            throw new Error('TomTom rechazó una tesela de tráfico.');
          }
          const payload = Buffer.from(await response.arrayBuffer());
          if (payload.length > 350000) throw new Error('Tesela de tráfico demasiado grande.');
          return payload;
        })();
        trafficTileRequests.set(tileId, pending);
      }
      try {
        bytes = await pending;
        trafficTiles.delete(tileId);
        trafficTiles.set(tileId, { bytes, at: Date.now() });
        if (trafficTiles.size > TRAFFIC_TILE_LIMIT) {
          trafficTiles.delete(trafficTiles.keys().next().value);
        }
      } finally {
        if (trafficTileRequests.get(tileId) === pending) trafficTileRequests.delete(tileId);
      }
    }
    res.set('Cache-Control', 'private, max-age=60');
    res.type('png');
    return res.send(bytes);
  } catch (error) {
    console.error('No fue posible obtener la tesela TomTom:', error.message);
    return res.status(502).json({ ok: false, message: 'No fue posible cargar el tráfico en este momento.' });
  }
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
    // Incident Details acepta el código ISO 639-1 "es", no la variante "es-MX".
    incidentsUrl.searchParams.set('language', 'es');
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

// Ticket aleatorio efímero: las etiquetas IMG no envían Authorization.
router.get('/noticias/imagen/:token', rateLimit({windowMs:60000,limit:50,standardHeaders:'draft-8',legacyHeaders:false}), async (req,res)=>{
  const item=newsImageTokens.get(req.params.token);
  if(!item||Date.now()-item.at>30*60*1000)return res.status(404).end();
  try {
    const url=new URL(item.url);
    if(!esImagenZmg(url.href))return res.status(404).end();
    const response=await fetch(url,{redirect:'error',signal:AbortSignal.timeout(5500),
      headers:{'User-Agent':'Mozilla/5.0 (compatible; MisionJardinesNews/1.0)',
        'Referer':'https://traficozmg.com/','Accept':'image/avif,image/webp,image/png,image/jpeg,image/gif'}});
    const type=String(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
    if(!response.ok||!['image/png','image/jpeg','image/webp','image/avif','image/gif'].includes(type)||
       Number(response.headers.get('content-length')||0)>2000000)return res.status(404).end();
    const bytes=Buffer.from(await response.arrayBuffer());
    if(bytes.length>2000000)return res.status(413).end();
    res.set('Cache-Control','public, max-age=900');
    res.type(type);
    return res.send(bytes);
  }catch(error){return res.status(404).end();}
});
router.get('/noticias', autenticarToken, newsLimiter, async (req, res) => {
  try {
    const rawQuery = req.query?.q;
    if (rawQuery !== undefined && typeof rawQuery !== 'string') {
      return res.status(400).json({ ok: false, message: 'Búsqueda inválida.' });
    }
    const query = (rawQuery || '').trim().replace(/\s+/g, ' ');
    if (query.length > 80 || (query.length > 0 && query.length < 2)) {
      return res.status(400).json({ ok: false, message: 'Escribe entre 2 y 80 caracteres para buscar noticias.' });
    }
    const cacheKey = query ? `news:${query.toLocaleLowerCase('es')}` : 'news';
    const cached = getCached(cacheKey, 15 * 60 * 1000);
    if (cached) return res.json(cached);

    // GDELT devuelve 429 de forma recurrente desde IPs de servidores compartidos.
    // FreeNewsApi permite búsquedas gratuitas y uso comercial sin credenciales,
    // y filtra sobre la fecha real de publicación de cada nota.
    // Los seis términos de calle permiten encontrar notas que no dicen
    // "Zapopan" en el titular. La clasificación exige el nombre de la vialidad.
    const terminos = query ? [query] : [
      'Zapopan', 'Guadalajara', 'choque Zapopan', 'choque Guadalajara',
      'marcha Zapopan', 'marcha Guadalajara',
      'Atotonilco', 'Valle de México', 'Avenida Guadalajara',
      'Acueducto', 'Base Aérea', 'Aviación'
    ];
    const consultas = terminos.map(termino => {
      const url = new URL('https://freenewsapi.ai/v1/search');
      url.searchParams.set('q', termino);
      url.searchParams.set('country', 'MX');
      url.searchParams.set('lang', 'es');
      url.searchParams.set('date', '7d');
      url.searchParams.set('sort', 'date');
      url.searchParams.set('size', query ? '70' : termino.startsWith('choque') ? '30' : '45');
      return fetchJson(url, 8000);
    });
    const respuestas = await Promise.allSettled(consultas);
    const correctas = respuestas.filter(r => r.status === 'fulfilled');
    if (!correctas.length) {
      const detalle = respuestas[0]?.reason?.message || 'Todas las fuentes rechazaron la consulta';
      throw new Error('No fue posible obtener noticias de la fuente: ' + detalle);
    }
    const articles = correctas.flatMap(r => r.value.results || []);
    const data = prepararNoticiasLocales(articles, new Date());
    // Recuperar exclusivamente la foto publicada en la nota original.
    await Promise.all(data.filter(n=>n.isTraficoZmg).slice(0,6).map(async n=>{
      try{
        const original=await descargarHtmlZmg(n.url);
        if(original)n.imageUrl=original;
        if(n.imageUrl)n.imageProxyToken=imageTokenFor(n.imageUrl);
      }catch(error){ /* La nota sigue visible sin fotografía. */ }
    }));

    const result = {
      ok: true,
      provider: 'FreeNewsApi',
      searchQuery: query,
      queryWindow: `${VENTANA_DIAS}d`,
      data,
      updatedAt: new Date().toISOString()
    };
    setCached(cacheKey, result);
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
