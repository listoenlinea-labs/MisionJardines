const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
Object.assign(process.env, { DB_HOST: '127.0.0.1', DB_PORT: '3306', DB_NAME: 'phone_test',
  DB_USER: 'test', DB_PASSWORD: 'unused', JWT_SECRET: 'phone-test-secret' });
const models = require('../src/models');
const router = require('../src/routes/telefonia.routes');

test('configuración requiere sesión y rol de personal; false no entrega secretos', async () => {
  const originalUser = models.Usuario.findByPk;
  const originalMembership = models.UsuarioCasa.findOne;
  let role = 'SEGURIDAD';
  models.Usuario.findByPk = async () => ({ id: 1, rolId: 1, estatus: 'ACTIVO', rol: { nombre: role, activo: true } });
  models.UsuarioCasa.findOne = async () => null;
  const app = express();
  app.use('/api/telefonia', router);
  const server = app.listen(0);
  const url = `http://127.0.0.1:${server.address().port}/api/telefonia/configuracion`;
  try {
    const token = jwt.sign({ usuarioId: 1 }, process.env.JWT_SECRET);
    assert.equal((await fetch(url)).status, 401);
    const headers = { Authorization: `Bearer ${token}` };
    const response = await fetch(url, { headers });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await response.json(), { ok: true, habilitada: false, modo: 'WHATSAPP' });
    const mode = await fetch(url.replace('/configuracion', '/modo'), { headers });
    assert.equal(mode.status, 200);
    assert.deepEqual(await mode.json(), { ok: true, habilitada: false });
    role = 'CONDOMINO';
    assert.equal((await fetch(url, { headers })).status, 403);
  } finally {
    models.Usuario.findByPk = originalUser;
    models.UsuarioCasa.findOne = originalMembership;
    await new Promise(resolve => server.close(resolve));
  }
});
