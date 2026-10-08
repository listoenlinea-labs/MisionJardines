const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
Object.assign(process.env, { DB_HOST: 'localhost', DB_PORT: '3306', DB_NAME: 'test', DB_USER: 'test', DB_PASSWORD: 'unused', JWT_SECRET: 'public-reg-test' });
const db = require('../src/config/database');
const { Usuario, Rol, VerificacionCuenta } = require('../src/models');
const SolicitudRegistro = require('../src/models/SolicitudRegistro');
const controller = require('../src/controllers/registro-publico.controller');

function response() {
  return { statusCode: 200, payload: null,
    status(code) { this.statusCode = code; return this; },
    json(data) { this.payload = data; return this; } };
}
function fakeTx() {
  return { LOCK: { UPDATE: 'UPDATE' }, finished: false,
    async commit() { this.finished = true; },
    async rollback() { this.finished = true; } };
}
async function verify(t, { security = false, wrong = false } = {}) {
  const correo = 'new@example.com';
  const code = '123456';
  const hash = crypto.createHash('sha256').update(correo + ':' + code + ':public-reg-test').digest('hex');
  let created = null;
  let request = null;
  t.mock.method(db, 'transaction', async () => fakeTx());
  t.mock.method(VerificacionCuenta, 'findOne', async () => ({
    casaId: security ? null : 5, expiraEn: new Date(Date.now() + 60000),
    intentos: 0, codigoHash: hash,
    datosJson: JSON.stringify({ registroPublico: true, nombre: 'Test', apellidoPaterno: 'Residencia', contrasenaHash: 'bcrypt-hash', esSeguridad: security }),
    async update() {}, async increment() {}
  }));
  t.mock.method(Usuario, 'findOne', async () => null);
  t.mock.method(Rol, 'findOne', async () => ({ id: 7 }));
  t.mock.method(Usuario, 'create', async data => { created = data; return { id: 100 }; });
  t.mock.method(SolicitudRegistro, 'create', async data => { request = data; return { id: 200 }; });
  const res = response();
  await controller.verificarAlta({ body: { correo, codigo: wrong ? '000000' : code } }, res);
  return { res, created, request };
}
test('registro de seguridad espera aprobación y no tiene casa ni rol privilegiado', async t => {
  const { res, created, request } = await verify(t, { security: true });
  assert.equal(res.statusCode, 201);
  assert.equal(created.estatus, 'PENDIENTE');
  assert.equal(created.casaId, null);
  assert.equal(created.rolId, 7);
  assert.equal(request.tipoSolicitado, 'SEGURIDAD');
  assert.equal(request.estatus, 'PENDIENTE');
});
test('registro residencial espera aprobación sin crear membresía activa', async t => {
  const { res, created, request } = await verify(t);
  assert.equal(res.statusCode, 201);
  assert.equal(created.casaId, 5);
  assert.equal(created.estatus, 'PENDIENTE');
  assert.equal(request.tipoSolicitado, 'CONDOMINO');
});
test('código incorrecto no crea un usuario ni solicitud', async t => {
  const { res, created, request } = await verify(t, { wrong: true });
  assert.equal(res.statusCode, 400);
  assert.equal(created, null);
  assert.equal(request, null);
});
test('aprobación explícita concede Seguridad sin vincular una vivienda', async t => {
  let roleSet = null, audit = null;
  t.mock.method(db, 'transaction', async () => fakeTx());
  t.mock.method(SolicitudRegistro, 'findByPk', async () => ({
    id: 2, usuarioId: 5, tipoSolicitado: 'SEGURIDAD', estatus: 'PENDIENTE', casaId: null,
    async update(data) { audit = data; }
  }));
  t.mock.method(Usuario, 'findByPk', async () => ({
    id: 5, estatus: 'PENDIENTE', async update(data) { roleSet = data; }
  }));
  t.mock.method(Rol, 'findOne', async () => ({ id: 33 }));
  const res = response();
  await controller.revisarSolicitud({
    params: { id: 2 }, usuario: { usuarioId: 1 },
    body: { accion: 'APROBAR', rol: 'SEGURIDAD' }
  }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(roleSet.estatus, 'ACTIVO');
  assert.equal(roleSet.casaId, null);
  assert.equal(roleSet.rolId, 33);
  assert.equal(audit.rolAsignado, 'SEGURIDAD');
});
test('no se pueden conceder roles fuera de lista de aprobación', async () => {
  const res = response();
  await controller.revisarSolicitud({
    params: { id: 2 }, usuario: { usuarioId: 1 },
    body: { accion: 'APROBAR', rol: 'SUPER_ADMIN' }
  }, res);
  assert.equal(res.statusCode, 400);
});
