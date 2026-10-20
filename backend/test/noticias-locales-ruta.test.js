'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
Object.assign(process.env, { DB_HOST: 'localhost', DB_NAME: 'test', DB_USER: 'test', DB_PASSWORD: 'test', JWT_SECRET: 'test-secret' });
const router = require('../src/routes/entorno.routes');

test('endpoint de noticias usa búsquedas locales y devuelve publicaciones recientes aun si falla una consulta', async t => {
  const route = router.stack.find(layer => layer.route?.path === '/noticias');
  const handler = route.route.stack.at(-1).handle;
  const requests = [];
  const now = new Date().toISOString();
  t.mock.method(global, 'fetch', async input => {
    const url = new URL(input);
    requests.push(url);
    if (url.hostname === 'traficozmg.com') {
      return {ok:true,headers:{get:key=>key==='content-type'?'application/json':null},
        json:async()=>[{slug:'nota',link:'https://traficozmg.com/nota',featured_media:5,
          _embedded:{'wp:featuredmedia':[{id:5,media_details:{sizes:{medium:{source_url:
            'https://traficozmg.com/wp-content/uploads/2026/10/choque-300x169.jpg'}}}}]}}]};
    }
    if (url.searchParams.get('q') === 'choque Guadalajara') throw new Error('Proveedor temporalmente ocupado');
    return {
      ok: true,
      json: async () => ({ results: [{
        title: 'Choque en Zapopan', url: 'https://traficozmg.com/nota',
        published_at: now, sitename: 'Tráfico ZMG', country: 'MX', lang: 'es',
        image: 'https://traficozmg.com/foto-choque.jpg'
      }] })
    };
  });
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
  await handler({ query: {} }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.provider, 'FreeNewsApi');
  assert.equal(res.payload.queryWindow, '7d');
  assert.equal(res.payload.data.length, 1); // Misma noticia de tres búsquedas: sin duplicados.
  assert.equal(res.payload.data[0].dateLabel, 'Publicada');
  assert.equal(res.payload.data[0].imageUrl,
    'https://traficozmg.com/wp-content/uploads/2026/10/choque-300x169.jpg');
  assert.match(res.payload.data[0].imageProxyToken,/^[0-9a-f-]{36}$/);
  const providerRequests=requests.filter(url=>url.hostname==='freenewsapi.ai');
  assert.equal(providerRequests.length, 12);
  assert.equal(requests.filter(url=>url.hostname==='traficozmg.com').length,1);
  assert.ok(providerRequests.some(url => url.searchParams.get('q') === 'Atotonilco'));
  assert.ok(providerRequests.some(url => url.searchParams.get('q') === 'Valle de México'));
  assert.ok(providerRequests.some(url => url.searchParams.get('q') === 'Base Aérea'));
  assert.ok(providerRequests.some(url => url.searchParams.get('q') === 'marcha Zapopan'));
  assert.ok(providerRequests.some(url => url.searchParams.get('q') === 'marcha Guadalajara'));
  assert.ok(providerRequests.every(url => url.searchParams.get('date') === '7d'));
  assert.ok(providerRequests.every(url => url.searchParams.get('country') === 'MX'));
});

test('permite buscar noticias por texto y evita consultas inválidas al proveedor', async t => {
  const handler = router.stack.find(layer => layer.route?.path === '/noticias').route.stack.at(-1).handle;
  const requests = [];
  t.mock.method(global, 'fetch', async input => {
    const url = new URL(input);
    requests.push(url);
    return { ok: true, json: async () => ({ results: [{
      title: 'Cierre en Avenida Aviación por trabajos',
      url: 'https://ejemplo.mx/aviacion', published_at: new Date().toISOString()
    }] }) };
  });
  const res = () => ({
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  });

  const invalid = res();
  await handler({ query: { q: 'a' } }, invalid);
  assert.equal(invalid.statusCode, 400);
  assert.equal(requests.length, 0);

  const searched = res();
  await handler({ query: { q: '  Avenida   Aviación  ' } }, searched);
  assert.equal(searched.statusCode, 200);
  assert.equal(searched.payload.searchQuery, 'Avenida Aviación');
  assert.equal(searched.payload.data[0].nearbyStreet, 'Avenida Aviación');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].searchParams.get('q'), 'Avenida Aviación');
  assert.equal(requests[0].searchParams.get('date'), '7d');

  const repeat = res();
  await handler({ query: { q: 'avenida aviación' } }, repeat);
  assert.equal(requests.length, 1, 'la búsqueda equivalente debe reutilizar el caché');
});
