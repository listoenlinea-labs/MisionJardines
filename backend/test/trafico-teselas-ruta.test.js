'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

Object.assign(process.env, {
  DB_HOST: 'localhost', DB_PORT: '3306', DB_NAME: 'test', DB_USER: 'test',
  DB_PASSWORD: 'test', JWT_SECRET: 'test-secret'
});

const router = require('../src/routes/entorno.routes');
const route = router.stack.find(layer => layer.route?.path === '/trafico/tesela/:zoom/:x/:y');
const handler = route.route.stack.at(-1).handle;

function response() {
  return {
    code: 200,
    headers: {},
    status(code) { this.code = code; return this; },
    set(key, value) { this.headers[key] = value; return this; },
    type(value) { this.mime = value; return this; },
    send(value) { this.bytes = value; return this; },
    json(value) { this.payload = value; return this; }
  };
}

test('proxy de tráfico valida acceso configurado y teselas de Zapopan', async () => {
  const previous = process.env.TOMTOM_API_KEY;
  try {
    delete process.env.TOMTOM_API_KEY;
    const unconfigured = response();
    await handler({ params: { zoom: '14', x: '3484', y: '7226' } }, unconfigured);
    assert.equal(unconfigured.code, 503);

    process.env.TOMTOM_API_KEY = 'tomtom-test';
    for (const params of [
      { zoom: 'z', x: '3484', y: '7226' },
      { zoom: '18', x: '3484', y: '7226' },
      { zoom: '14', x: '0', y: '0' },
      { zoom: '14', x: '999999', y: '7226' }
    ]) {
      const res = response();
      await handler({ params }, res);
      assert.equal(res.code, 400);
    }
  } finally {
    if (previous === undefined) delete process.env.TOMTOM_API_KEY;
    else process.env.TOMTOM_API_KEY = previous;
  }
});

test('proxy TomTom entrega PNG sin revelar credencial y reutiliza caché', async t => {
  const previous = process.env.TOMTOM_API_KEY;
  process.env.TOMTOM_API_KEY = 'no-publicar-esta-key';
  t.after(() => {
    if (previous === undefined) delete process.env.TOMTOM_API_KEY;
    else process.env.TOMTOM_API_KEY = previous;
  });

  const urls = [];
  const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  t.mock.method(global, 'fetch', async (url, options) => {
    urls.push(new URL(url));
    assert.ok(options.signal);
    return {
      ok: true,
      headers: { get: header => header === 'content-type' ? 'image/png' : null },
      arrayBuffer: async () => png
    };
  });

  const params = { zoom: '14', x: '3484', y: '7226' };
  const first = response(), second = response();
  await handler({ params }, first);
  await handler({ params }, second);

  assert.equal(first.code, 200);
  assert.equal(first.mime, 'png');
  assert.deepEqual(first.bytes, png);
  assert.equal(first.headers['Cache-Control'], 'private, max-age=60');
  assert.deepEqual(second.bytes, png);
  assert.equal(urls.length, 1);
  assert.equal(urls[0].pathname, '/traffic/map/4/tile/flow/relative0/14/3484/7226.png');
  assert.equal(urls[0].searchParams.get('key'), 'no-publicar-esta-key');
  assert.doesNotMatch(JSON.stringify(first), /no-publicar-esta-key/);
});

test('error del proveedor no devuelve URL ni clave secreta', async t => {
  const previous = process.env.TOMTOM_API_KEY;
  process.env.TOMTOM_API_KEY = 'clave-secreta';
  t.after(() => {
    if (previous === undefined) delete process.env.TOMTOM_API_KEY;
    else process.env.TOMTOM_API_KEY = previous;
  });
  t.mock.method(global, 'fetch', async () => ({
    ok: false,
    headers: { get: () => 'application/json' }
  }));
  const res = response();
  await handler({ params: { zoom: '14', x: '3485', y: '7226' } }, res);
  assert.equal(res.code, 502);
  assert.doesNotMatch(JSON.stringify(res.payload), /clave-secreta|api\.tomtom\.com/);
});
