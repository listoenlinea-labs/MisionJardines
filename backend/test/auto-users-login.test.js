const test = require('node:test');
const assert = require('node:assert/strict');
Object.assign(process.env, { DB_HOST: 'localhost', DB_PORT: '3306', DB_NAME: 'test', DB_USER: 'test', DB_PASSWORD: 'unused', JWT_SECRET: 'synthetic-test-secret' });
const { Op } = require('sequelize');
const models = require('../src/models');
const bcrypt = require('bcryptjs');
const { iniciarSesion } = require('../src/controllers/auth.controller');
test('login accepts username or email and never exposes the password hash', async t => {
  let filter;
  const user = { id: 1, casaId: 10, rolId: 3, rol: { nombre: 'CONDOMINO' }, cuentaAceptada: true, estatus: 'ACTIVO', contrasenaHash: 'synthetic-hash',
    async update() {}, toJSON() { return { id: 1, contrasenaHash: this.contrasenaHash }; } };
  let ambiguous = false;
  t.mock.method(models.Usuario, 'scope', () => ({ findAll: async options => { filter = options.where; return ambiguous ? [user, { id: 2 }] : [user]; } }));
  t.mock.method(bcrypt, 'compare', async () => true);
  const res = { code: 200, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
  await iniciarSesion({ body: { correo: '3312345678personaprueba', contrasena: 'PruebaSegura123' } }, res);
  assert.deepEqual(filter[Op.or], [{ correo: '3312345678personaprueba' }, { nombreUsuario: '3312345678personaprueba' }]);
  assert.equal(res.code, 200); assert.ok(res.body.token); assert.equal(res.body.usuario.contrasenaHash, undefined);
  user.cuentaAceptada = false;
  await iniciarSesion({ body: { correo: '3312345678personaprueba', contrasena: 'PruebaSegura123' } }, res); assert.equal(res.code, 403);
  user.cuentaAceptada = true; ambiguous = true;
  await iniciarSesion({ body: { correo: '3312345678personaprueba', contrasena: 'PruebaSegura123' } }, res); assert.equal(res.code, 401);
});
