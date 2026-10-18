'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
Object.assign(process.env, { DB_HOST: 'localhost', DB_NAME: 'test', DB_USER: 'test', DB_PASSWORD: 'test', JWT_SECRET: 'test-secret' });
const router = require('../src/routes/entorno.routes');

test('TomTom usa idioma es soportado por incidentDetails y devuelve incidentes en español', async t => {
  const originalKey = process.env.TOMTOM_API_KEY;
  process.env.TOMTOM_API_KEY = 'test-key';
  t.after(() => {
    if (originalKey === undefined) delete process.env.TOMTOM_API_KEY;
    else process.env.TOMTOM_API_KEY = originalKey;
  });
  const urls = [];
  t.mock.method(global, 'fetch', async input => {
    const url = new URL(input);
    urls.push(url);
    if (url.pathname.startsWith('/search/2/geocode/')) {
      return { ok: true, json: async () => ({ results: [{ position: { lat: 20.75, lon: -103.43 } }] }) };
    }
    assert.equal(url.pathname, '/traffic/services/5/incidentDetails');
    assert.equal(url.searchParams.get('language'), 'es');
    assert.equal(url.searchParams.get('timeValidityFilter'), 'present');
    return { ok: true, json: async () => ({ incidents: [{
      properties: { id: 'tt-1', iconCategory: 1, events: [{ description: 'Choque en la avenida' }] }
    }] }) };
  });
  const handler = router.stack.find(layer => layer.route?.path === '/incidencias').route.stack.at(-1).handle;
  const res = {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.payload = payload; return this; }
  };
  await handler({}, res);
  assert.equal(res.statusCode, 200);
  assert.equal(res.payload.data.length, 1);
  assert.equal(res.payload.data[0].description, 'Choque en la avenida');
  assert.equal(urls.length, 2);
});
