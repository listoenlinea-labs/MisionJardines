const test = require('node:test');
const assert = require('node:assert/strict');

Object.assign(process.env, {
  DB_HOST: 'localhost', DB_PORT: '3306', DB_NAME: 'test', DB_USER: 'test',
  DB_PASSWORD: 'unused', JWT_SECRET: 'test-secret'
});

const { Usuario, VerificacionCuenta } = require('../src/models');
const emailService = require('../src/services/email.service');
const { solicitarRegistro } = require('../src/controllers/auth.controller');

function fakeResponse() {
  return {
    code: 200, data: null,
    status(value) { this.code = value; return this; },
    json(payload) { this.data = payload; return this; }
  };
}
function request() {
  return {
    body: {
      nombre: 'Test', apellidoPaterno: 'Usuario', correo: 'prueba@example.com',
      contrasena: 'ContraseñaSegura123', calle: 'Gardenias', numeroCasa: '5',
      tipoCuenta: 'CONDOMINO'
    }
  };
}
function stubLookup(t) {
  t.mock.method(Usuario, 'findOne', async () => null);
  t.mock.method(VerificacionCuenta, 'findOne', async () => null);
}
test('registro distingue configuración SMTP ausente sin crear verificaciones', async t => {
  stubLookup(t);
  t.mock.method(emailService, 'validarConfiguracionSmtp', () => { throw Error('Falta SMTP_PASSWORD'); });
  let created = false;
  t.mock.method(VerificacionCuenta, 'create', async () => { created = true; });
  const res = fakeResponse();
  await solicitarRegistro(request(), res);
  assert.equal(res.code, 503);
  assert.equal(res.data.codigo, 'SMTP_CONFIG_INCOMPLETA');
  assert.equal(created, false);
});
test('envío SMTP rechazado responde con diagnóstico y limpia el código provisional', async t => {
  stubLookup(t);
  t.mock.method(emailService, 'validarConfiguracionSmtp', () => {});
  const deleted = [];
  t.mock.method(VerificacionCuenta, 'destroy', async options => { deleted.push(options.where); });
  t.mock.method(VerificacionCuenta, 'create', async () => ({ id: 123 }));
  t.mock.method(emailService, 'enviarCodigoVerificacion', async () => {
    throw Object.assign(Error('Auth failed'), { code: 'EAUTH', command: 'AUTH' });
  });
  const res = fakeResponse();
  await solicitarRegistro(request(), res);
  assert.equal(res.code, 503);
  assert.equal(res.data.codigo, 'SMTP_ENVIO_FALLIDO');
  assert.ok(deleted.some(w => w.id === 123), 'se eliminó la verificación provisional');
  assert.ok(!JSON.stringify(res.data).includes('Auth failed'), 'no se revelan detalles de proveedor');
});
