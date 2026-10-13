'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const camera = require('../src/services/camaras-hls.service');

const env = Object.freeze({
  CAMERAS_HLS_GATEWAY_URL: 'https://gateway-seguro.example/base/',
  CAMERAS_STREAM_SIGNING_KEY: 'esta-clave-ficticia-tiene-mas-de-treinta-y-dos-caracteres',
  CAMERAS_UPSTREAM_BEARER_TOKEN: 'token-que-verifica-el-proxy-de-prueba',
  CAMERAS_CHANNELS_JSON: JSON.stringify([
    { id: 'jardines-1', name: 'Jardines 1', path: 'jardines-1' },
    { id: 'porton-1', name: 'Portón 1', path: 'porton-1' }
  ])
});

test('Requiere gateway privado autenticado y llave firmante de longitud suficiente', () => {
  assert.equal(camera.enabled(env), true);
  assert.equal(camera.enabled({ ...env, CAMERAS_UPSTREAM_BEARER_TOKEN: '' }), false);
  assert.equal(camera.enabled({ ...env, CAMERAS_HLS_GATEWAY_URL: 'http://cam.example/' }), false);
  assert.equal(camera.enabled({ ...env, CAMERAS_HLS_GATEWAY_URL: 'https://user:password@gateway-seguro.example/' }), false);
  assert.equal(camera.enabled({ ...env, CAMERAS_STREAM_SIGNING_KEY: 'abc' }), false);
  assert.equal(camera.enabled({ ...env, CAMERAS_CHANNELS_JSON: 'garbled' }), false);
  assert.equal(camera.gateway({
    ...env,
    CAMERAS_HLS_GATEWAY_URL: 'http://127.0.0.1:8888/',
    CAMERAS_UPSTREAM_BEARER_TOKEN: ''
  })?.hostname, '127.0.0.1');
});

test('Emite y verifica tickets distintos por cámara con caducidad y firma', () => {
  const now = Date.UTC(2026, 9, 13, 12, 0, 0);
  const ticket = camera.issueTicket('jardines-1', env, now);
  assert.match(ticket, /^\d{10}\.[\w-]{43}$/);
  assert.equal(camera.checkTicket('jardines-1', ticket, env, now), true);
  assert.equal(camera.checkTicket('porton-1', ticket, env, now), false);
  assert.equal(camera.checkTicket('jardines-1', ticket, env, now + (16 * 60000)), false);
  assert.equal(camera.checkTicket('jardines-1', ticket.slice(0, -2) + 'xx', env, now), false);
  assert.equal(camera.issueTicket('no-existe', env, now), null);
});

test('La playlist HLS solo admite recursos locales permitidos', () => {
  const ticket = camera.issueTicket('jardines-1', env);
  const input = '#EXTM3U\n#EXT-X-MAP:URI="init.mp4"\n#EXTINF:2.0,\nseg_123.mp4\n';
  const playlist = camera.rewriteHls(input, 'jardines-1', ticket);
  assert.match(playlist, /\/api\/camaras\/stream\/jardines-1\/init\.mp4\?ticket=/);
  assert.match(playlist, /\/api\/camaras\/stream\/jardines-1\/seg_123\.mp4\?ticket=/);
  assert.equal(camera.sourceUrl(camera.channels(env)[0], 'index.m3u8', env),
    'https://gateway-seguro.example/base/jardines-1/index.m3u8');
  for (const forbidden of [
    'https://example.com/private.mp4', '/admin.html',
    '../private.mp4', '../../passwd'
  ]) {
    assert.throws(() => camera.rewriteHls('#EXTM3U\n' + forbidden,
      'jardines-1', ticket));
  }
  assert.equal(camera.safeAsset('seg-1.m4s'), true);
  assert.equal(camera.safeAsset('../admin'), false);
  assert.equal(camera.safeAsset('foo/bar.ts'), false);
});

test('Seguridad reutiliza el POST de ZKTeco y no presenta estado físico inventado', () => {
  const html = fs.readFileSync(path.resolve(__dirname, '../../docs/seguridad.html'), 'utf8');
  const zkteco = fs.readFileSync(path.resolve(__dirname, '../../docs/zkteco.html'), 'utf8');
  const app = fs.readFileSync(path.resolve(__dirname, '../src/app.js'), 'utf8');
  assert.match(html, /API_BASE_URL\+'\/zkteco\/pluma'/);
  assert.match(html, /body:JSON\.stringify\(\{accion\}\)/);
  assert.match(zkteco, /'\/zkteco\/pluma'/);
  assert.match(html, /ORDEN ENVIADA/);
  assert.match(html, /no una lectura física de posición/);
  assert.match(html, /API_BASE_URL\+'\/camaras'/);
  assert.match(html, /data-watch/);
  assert.doesNotMatch(html, /rtsp:\/\/admin:/);
  assert.doesNotMatch(html, /192\.168\.1\.101/);
  assert.match(app, /app\.use\('\/api\/camaras'/);
  assert.match(app, /skip: req => req\.path\.startsWith\('\/camaras\/stream\/'\)/);
});
