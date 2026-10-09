'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
Object.assign(process.env, {
  DB_HOST: 'localhost', DB_PORT: '3306', DB_NAME: 'test',
  DB_USER: 'test', DB_PASSWORD: 'unused', ZKTECO_DIRECT_HOST: 'localhost'
});
const sequelize = require('../src/config/database');
const models = require('../src/models');
const Casa = require('../src/models/Casa');
const Tags = require('../src/models/ZkTarjeta');
const Vigencia = require('../src/models/VigenciaMantenimiento');
const direct = require('../src/services/zkteco-direct.service');
const worker = require('../src/services/zkteco-vigencias.service');
const { C3Client } = require('../src/services/zkteco-c3-client.service');

function setup(t, { existingValidity = false, alreadyAuthorized = true,
  physicalTagExists = true, physicalEnd = '2027-01-10', houseExists = true } = {}) {
  const casa = {
    id: 702, calle: 'Guadalajara', numero: '707', controles: '5108838',
    async update(changes) { Object.assign(this, changes); }
  };
  const user = { UID: '20', Pin: '5108833', CardNo: '5108833',
    Password: '', Group: '1', StartTime: '20261008', EndTime: physicalEnd.replace(/-/g, '') };
  let users = physicalTagExists ? [user] : [];
  let auth = alreadyAuthorized && physicalTagExists
    ? [{ Pin: user.Pin, AuthorizeDoorId: '3', AuthorizeTimezoneId: '1' }] : [];
  const writes = [];
  let rowCreated = null;
  const validity = existingValidity ? { casaId: 702, fechaFinal: '2027-01-10' } : null;
  const tx = { LOCK: { UPDATE: 'UPDATE' }, afterCommit() {} };
  t.mock.method(sequelize, 'transaction', async (a, b) =>
    (typeof a === 'function' ? a : b)(tx));
  t.mock.method(Casa, 'findByPk', async id =>
    houseExists && Number(id) === 702 ? casa : null);
  t.mock.method(Tags, 'findAll', async () => []);
  t.mock.method(Tags, 'findOne', async () => null);
  t.mock.method(Tags, 'create', async data => ({
    id: 3333, ...data, toJSON() { return { id: this.id, ...data }; }
  }));
  t.mock.method(Vigencia, 'findByPk', async () => rowCreated || validity);
  t.mock.method(Vigencia, 'create', async data => {
    rowCreated = { ...data };
    return rowCreated;
  });
  t.mock.method(models.Cuota, 'findAll', async () => []);
  t.mock.method(models.PagoReportado, 'findAll', async () => []);
  const queue = [];
  t.mock.method(worker, 'marcarPendiente', async id => {
    queue.push(id);
    return { casaId: id, sincronizacion: 'PENDIENTE' };
  });
  t.mock.method(C3Client.prototype, 'connect', async () => {});
  t.mock.method(C3Client.prototype, 'disconnect', async () => {});
  t.mock.method(C3Client.prototype, 'getData', async table => {
    if (table === 'user') return users;
    if (table === 'userauthorize') return auth;
    throw Error('unexpected table ' + table);
  });
  t.mock.method(C3Client.prototype, 'putRecord', async (table, fields) => {
    writes.push({ table, fields });
    if (table === 'userauthorize') {
      auth = [{ ...fields }];
    } else if (table === 'user') {
      const index = users.findIndex(u => String(u.Pin) === String(fields.Pin));
      if (index < 0) users.push({ UID: '21', ...fields });
      else Object.assign(users[index], fields);
    }
  });
  const previous = process.env.ZKTECO_WRITE_MODE;
  process.env.ZKTECO_WRITE_MODE = 'DIRECT';
  t.after(() => {
    if (previous === undefined) delete process.env.ZKTECO_WRITE_MODE;
    else process.env.ZKTECO_WRITE_MODE = previous;
  });
  return { casa, writes, queue, get validityCreated() { return rowCreated; },
    get users() { return users; }, get auth() { return auth; } };
}

test('alta nueva: misma casa_id 702 y vigencia inicial sin pagos ficticios', async t => {
  const ctx = setup(t);
  const result = await direct.createTagForHouse(702, {
    numeroTarjeta: '5108833', fechaInicio: '2026-10-08', fechaFin: '2027-01-10'
  }, 15);
  assert.equal(result.casaId, 702);
  assert.equal(result.vigenciaCreada, true);
  assert.equal(result.vigenciaMantenimiento, '2027-01-10');
  assert.equal(result.sincronizacionVigencia, 'ALTA_C3_CONFIRMADA');
  assert.equal(ctx.validityCreated.casaId, 702);
  assert.equal(ctx.validityCreated.principalInicial, '0.00');
  assert.equal(ctx.validityCreated.principalConfirmado, '0.00');
  assert.equal(ctx.validityCreated.fechaBase, '2027-01-10');
  assert.deepEqual(ctx.queue, [], 'no reprogramar otros TAGs al crear la vigencia');
  assert.equal(ctx.writes.length, 0, 'usuario ya presente y autorizado no requiere PUTDATA');
  assert.match(ctx.casa.controles, /5108833/);
});

test('TAG ya presente sin userauthorize: restituir solo permiso físico', async t => {
  const ctx = setup(t, { alreadyAuthorized: false });
  const result = await direct.createTagForHouse(702, {
    numeroTarjeta: '5108833', fechaInicio: '2026-10-08', fechaFin: '2027-01-10'
  });
  assert.equal(result.vigenciaCreada, true);
  assert.equal(result.puertasAutorizadas, 3);
  assert.deepEqual(ctx.writes.map(w => w.table), ['userauthorize']);
  assert.equal(ctx.writes[0].fields.AuthorizeDoorId, 3);
});

test('TAG físico con vencimiento anterior: actualizar fecha por TCP y verificar', async t => {
  const ctx = setup(t, { physicalEnd: '2026-09-10' });
  const result = await direct.createTagForHouse(702, {
    numeroTarjeta: '5108833', fechaInicio: '2026-10-08', fechaFin: '2027-01-10'
  });
  assert.equal(result.vigenciaCreada, true);
  assert.deepEqual(ctx.writes.map(w => w.table), ['user']);
  assert.equal(ctx.users[0].EndTime, 20270110);
  assert.equal(ctx.auth[0].AuthorizeDoorId, '3');
});

test('TAG físicamente nuevo: crear user + userauthorize y confirmar ambos', async t => {
  const ctx = setup(t, { physicalTagExists: false });
  const result = await direct.createTagForHouse(702, {
    numeroTarjeta: '5108833', fechaInicio: '2026-10-08', fechaFin: '2027-01-10'
  });
  assert.equal(result.vigenciaCreada, true);
  assert.deepEqual(ctx.writes.map(w => w.table), ['user', 'userauthorize']);
  assert.equal(ctx.auth[0].AuthorizeDoorId, 3);
  assert.equal(ctx.users[0].CardNo, '5108833');
});

test('si ya existe vigencia, no crea duplicado y hereda la fecha real', async t => {
  const ctx = setup(t, { existingValidity: true });
  const result = await direct.createTagForHouse(702, {
    numeroTarjeta: '5108833', fechaInicio: '2026-10-08', fechaFin: '2099-12-31'
  });
  assert.equal(result.vigenciaCreada, false);
  assert.equal(result.vigenciaMantenimiento, '2027-01-10');
  assert.equal(result.fechaFin, '2027-01-10');
  assert.equal(ctx.validityCreated, null);
  assert.deepEqual(ctx.queue, [702]);
});

test('sin vigencia, fecha no acreditable rechazada ANTES de tocar el C3', async t => {
  const ctx = setup(t);
  await assert.rejects(direct.createTagForHouse(702, {
    numeroTarjeta: '5108833', fechaFin: '2099-12-31'
  }), /Selecciona una FECHA FINAL real con día 10/);
  assert.equal(ctx.writes.length, 0);
  assert.equal(ctx.validityCreated, null);
});

test('casa_id inexistente: no crea domicilio ni TAG huérfano', async t => {
  const ctx = setup(t, { houseExists: false });
  await assert.rejects(direct.createTagForHouse(702, {
    numeroTarjeta: '5108833', fechaFin: '2027-01-10'
  }), /Vivienda no encontrada/);
  assert.equal(ctx.writes.length, 0);
  assert.equal(ctx.validityCreated, null);
});
