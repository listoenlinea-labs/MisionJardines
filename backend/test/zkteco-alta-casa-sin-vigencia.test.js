'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
Object.assign(process.env, { DB_HOST: 'localhost', DB_PORT: '3306', DB_NAME: 'test',
  DB_USER: 'test', DB_PASSWORD: 'unused', ZKTECO_DIRECT_HOST: 'localhost' });
const { C3Client } = require('../src/services/zkteco-c3-client.service');
const Casa = require('../src/models/Casa');
const Tags = require('../src/models/ZkTarjeta');
const Vigencia = require('../src/models/VigenciaMantenimiento');
const direct = require('../src/services/zkteco-direct.service');

for (const hasAuthorization of [false, true]) {
  test(hasAuthorization
    ? 'reutilizar un TAG C3 autorizado no sobrescribe sus permisos'
    : 'reutilizar TAG C3 sin userauthorize restaura permisos antes de marcarlo activo', async t => {
    const house = { id: 702, calle: 'Guadalajara', numero: '707', controles: '',
      async update(values) { Object.assign(this, values); } };
    const user = { UID: '14', Pin: '5108833', CardNo: '5108833',
      StartTime: '20261008', EndTime: '20270111' };
    let auth = hasAuthorization
      ? { Pin: '5108833', AuthorizeDoorId: '3', AuthorizeTimezoneId: '1' }
      : null;
    const writes = [];
    t.mock.method(Casa, 'findByPk', async id => Number(id) === 702 ? house : null);
    t.mock.method(Tags, 'findAll', async () => []);
    t.mock.method(Tags, 'findOne', async () => null);
    t.mock.method(Tags, 'create', async data => ({ ...data, toJSON() { return { ...data }; } }));
    t.mock.method(Vigencia, 'update', async () => [0]);
    t.mock.method(C3Client.prototype, 'connect', async () => {});
    t.mock.method(C3Client.prototype, 'disconnect', async () => {});
    t.mock.method(C3Client.prototype, 'getData', async table => {
      if (table === 'user') return [user];
      if (table === 'userauthorize') return auth ? [auth] : [];
      throw Error('unexpected table: '+table);
    });
    t.mock.method(C3Client.prototype, 'putRecord', async (table, values) => {
      writes.push({ table, values });
      if (table !== 'userauthorize') throw Error('must not recreate existing C3 user');
      auth = { ...values };
    });
    const oldMode = process.env.ZKTECO_WRITE_MODE;
    process.env.ZKTECO_WRITE_MODE = 'DIRECT';
    t.after(() => {
      if (oldMode === undefined) delete process.env.ZKTECO_WRITE_MODE;
      else process.env.ZKTECO_WRITE_MODE = oldMode;
    });
    const result = await direct.createTagForHouse(702, {
      numeroTarjeta: '5108833', fechaInicio: '2026-10-08', fechaFin: '2027-01-11'
    });
    assert.equal(result.casaId, 702);
    assert.equal(result.vigenciaConfigurada, false,
      'missing vigencia must be reported rather than fabricated');
    assert.equal(result.puertasAutorizadas, 3);
    assert.equal(result.enControlador, true);
    assert.equal(writes.length, hasAuthorization ? 0 : 1);
    if (!hasAuthorization) assert.equal(writes[0].values.AuthorizeDoorId, 3);
    assert.match(house.controles, /5108833/);
  });
}
