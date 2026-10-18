'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { VENTANA_DIAS, fechaGdelt, calleCercana, prepararNoticiasLocales } = require('../src/services/noticias-locales.service');

const now = new Date('2026-10-18T05:30:00.000Z');
const article = (title, seendate, url) => ({ title, seendate, url, domain: 'medio.mx' });

test('convierte correctamente la fecha de detección de GDELT', () => {
  assert.equal(fechaGdelt('20261017T120345Z').toISOString(), '2026-10-17T12:03:45.000Z');
  assert.equal(fechaGdelt('fecha mala'), null);
});

test('muestra solo notas de los últimos siete días, sin duplicados y con enlaces web', () => {
  const noticias = prepararNoticiasLocales([
    article('Choque en Zapopan', '20261017T120000Z', 'https://medio.mx/choque'),
    article('Choque duplicado', '20261017T110000Z', 'https://medio.mx/choque'),
    article('Noticia de Guadalajara', '20261012T120000Z', 'https://medio.mx/local'),
    article('Noticia antigua', '20261010T120000Z', 'https://medio.mx/antigua'),
    article('Noticia futura', '20261019T120000Z', 'https://medio.mx/futura'),
    article('URL inválida', '20261017T120000Z', 'javascript:alert(1)')
  ], now);
  assert.equal(VENTANA_DIAS, 7);
  assert.equal(noticias.length, 2);
  assert.equal(noticias[0].category, 'Choques');
  assert.equal(noticias[1].category, 'Guadalajara');
  assert.equal(noticias[0].seenDate, '2026-10-17T12:00:00.000Z');
});

test('usa la fecha editorial publicada por FreeNewsApi y etiqueta el medio', () => {
  const items = prepararNoticiasLocales([
    { title: 'Choque en Guadalajara', url: 'https://traficozmg.com/choque', published_at: '2026-10-17T20:30:00Z', sitename: 'Tráfico ZMG', country: 'MX', lang: 'es' },
    { title: 'Nota anterior a la semana', url: 'https://medio.mx/antigua', published_at: '2026-10-10T20:30:00Z' }
  ], now);
  assert.equal(items.length, 1);
  assert.equal(items[0].dateLabel, 'Publicada');
  assert.equal(items[0].seenDate, '2026-10-17T20:30:00.000Z');
  assert.equal(items[0].domain, 'Tráfico ZMG');
  assert.equal(items[0].category, 'Choques');
});

test('destaca hasta cuatro notas viales y completa con noticias de la zona', () => {
  const articles = Array.from({ length: 18 }, (_, index) => article(
    index < 6 ? `Accidente ${index} en Zapopan` : `Reporte ${index} Guadalajara`,
    '20261017T120000Z',
    `https://medio.mx/${index}`
  ));
  const news = prepararNoticiasLocales(articles, now);
  assert.equal(news.length, 12);
  assert.equal(news.filter(n => n.category === 'Choques').length, 4);
});

test('prioriza las seis vialidades cercanas aunque sus noticias sean menos recientes', () => {
  const calles = [
    'Calle Atotonilco', 'Avenida Valle de México', 'Av. Guadalajara',
    'Av. Acueducto', 'Avenida Base Aérea', 'Av. Aviación'
  ];
  const articles = [
    article('Chivas gana en Guadalajara', '20261018T040000Z', 'https://medio.mx/deportes'),
    article('Choque en Zapopan', '20261018T030000Z', 'https://medio.mx/choque'),
    ...calles.map((calle, index) => ({
      ...article(`Se anuncia obra en ${calle}`, '20261015T080000Z', `https://medio.mx/calle-${index}`),
      description: 'Reporte para automovilistas de Zapopan'
    }))
  ];
  const news = prepararNoticiasLocales(articles, now);
  assert.deepEqual(news.slice(0, 6).map(item => item.nearbyStreet), [
    'Calle Atotonilco', 'Avenida Valle de México', 'Avenida Guadalajara',
    'Avenida Acueducto', 'Avenida Base Aérea', 'Avenida Aviación'
  ]);
  assert.equal(news[6].category, 'Choques');
  assert.equal(news[7].nearbyStreet, null);
});

test('no presenta zonas o ciudades homónimas como una calle junto al fraccionamiento', () => {
  assert.equal(calleCercana('Gran evento en Guadalajara'), null);
  assert.equal(calleCercana('El clima en el Valle de México'), null);
  assert.equal(calleCercana('Aviación comercial en México'), null);
  assert.equal(calleCercana('Choque sobre la Av. Base Aérea'), 'Avenida Base Aérea');
  assert.equal(calleCercana('Problemas viales en Av Aviación'), 'Avenida Aviación');
  assert.equal(calleCercana('Accidente sobre Avenida Aviación'), 'Avenida Aviación');
});
