const test = require('node:test');
const assert = require('node:assert/strict');
Object.assign(process.env, { DB_HOST: 'localhost', DB_PORT: '3306', DB_NAME: 'test', DB_USER: 'test', DB_PASSWORD: 'unused', JWT_SECRET: 'synthetic-route-secret' });
const express = require('express');
const jwt = require('jsonwebtoken');
const models = require('../src/models');
const router = require('../src/routes/auto-users.routes');
test('HTTP routes refuse anonymous/resident/forged-admin requests and allow authoritative administrator', async t => {
  let currentRole = 'CONDOMINO', queried = 0;
  t.mock.method(models.Usuario, 'findByPk', async () => ({ id: 1, condominoId: 9, observaciones: 'AUTO_USERS_PRUEBA:' + 'a'.repeat(32), casaId: 10, rolId: 3, estatus: 'ACTIVO', cuentaAceptada: true, sesionVersion: 0, rol: { nombre: currentRole, activo: true } }));
  t.mock.method(models.UsuarioCasa, 'findOne', async () => ({ casaId: 10 }));
  t.mock.method(models.Condomino, 'findAll', async () => { queried++; return []; });
  const app = express(); app.use(express.json()); app.use('/api/auto-users', router);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port + '/api/auto-users';
  const forged = jwt.sign({ usuarioId: 1, rol: 'SUPER_ADMIN', sesionVersion: 0 }, process.env.JWT_SECRET);
  const send = (url, authorization, method = 'POST') => fetch(base + url, { method, headers: { 'Content-Type': 'application/json', ...(authorization ? { Authorization: 'Bearer ' + authorization } : {}) }, ...(method === 'GET' ? {} : { body: '{}' }) });
  try {
    for (const path of ['/crear', '/prueba/crear', '/prueba/1/enlace']) {
      assert.equal((await send(path)).status, 401);
      assert.equal((await send(path, forged)).status, 403);
    }
    assert.equal((await send('/crear', forged)).status, 403); assert.equal(queried, 0);
    for (const [path, method] of [['/prueba/usuarios', 'GET'], ['/prueba/1', 'PATCH'], ['/prueba/1', 'DELETE']]) {
      assert.equal((await send(path, undefined, method)).status, 401);
      assert.equal((await send(path, forged, method)).status, 403);
    }
    currentRole = 'ADMINISTRADOR'; const allowed = await send('/crear', forged);
    assert.equal(allowed.status, 200); assert.equal((await allowed.json()).siguiente, null); assert.equal(queried, 1);
    assert.equal((await send('/0/invitacion', forged)).status, 400);
    assert.equal((await send('/prueba/crear', forged)).status, 400);
    assert.equal((await send('/prueba/1/enlace', forged)).status, 400);
    t.mock.method(require('../src/config/database'), 'transaction', async fn => fn({ LOCK: { UPDATE: 'UPDATE' } }));
    t.mock.method(models.Rol, 'findByPk', async () => { throw Object.assign(Error('SQL and private data must not leak'), { name: 'SequelizeDatabaseError', original: { code: 'ER_BAD_FIELD_ERROR' } }); });
    t.mock.method(console, 'error', () => {});
    const failedDelete = await send('/prueba/1', forged, 'DELETE');
    assert.equal(failedDelete.status, 503);
    const diagnostic = await failedDelete.json();
    assert.match(diagnostic.message, /ER_BAD_FIELD_ERROR/);
    assert.doesNotMatch(diagnostic.message, /private data/);
    t.mock.method(models.Usuario, 'findAll', async () => []);
    const discovery = await fetch(base + '/acceso/telefono', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ telefono: '3312345678' }) });
    assert.equal(discovery.status, 200); assert.equal((await discovery.json()).estado, 'NUEVA');
    assert.equal(discovery.headers.get('cache-control'), 'no-store');
    assert.equal((await send('/acceso/telefono')).status, 400);
    const invalid = await send('/invitacion/consultar'); assert.equal(invalid.status, 410);
    assert.equal(invalid.headers.get('cache-control'), 'no-store');
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
