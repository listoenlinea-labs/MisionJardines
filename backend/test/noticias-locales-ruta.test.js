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
    if (url.searchParams.get('q') === 'choque Guadalajara') throw new Error('Proveedor temporalmente ocupado');
    return {
      ok: true,
      json: async () => ({ results: [{
        title: 'Choque en Zapopan', url: 'https://traficozmg.com/nota',
        published_at: now, sitename: 'Tráfico ZMG', country: 'MX', lang: 'es'
      }] })
    };
  });
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
  await handler({}, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.provider, 'FreeNewsApi');
  assert.equal(res.payload.queryWindow, '7d');
  assert.equal(res.payload.data.length, 1); // Misma noticia de tres búsquedas: sin duplicados.
  assert.equal(res.payload.data[0].dateLabel, 'Publicada');
  assert.equal(requests.length, 4);
  assert.ok(requests.every(url => url.searchParams.get('date') === '7d'));
  assert.ok(requests.every(url => url.searchParams.get('country') === 'MX'));
});
