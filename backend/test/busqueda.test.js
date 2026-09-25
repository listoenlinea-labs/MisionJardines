const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
Object.assign(process.env, { DB_HOST: '127.0.0.1', DB_PORT: '3306', DB_NAME: 'search_test', DB_USER: 'test', DB_PASSWORD: 'unused', JWT_SECRET: 'search-test-secret' });
const models = require('../src/models');
const router = require('../src/routes/busqueda.routes');
const app = express();
app.use('/api/busqueda', router);

async function request(path, role, casaId) {
  const server = app.listen(0);
  try {
    const token = jwt.sign({ rol: role, casaId, usuarioId: 1 }, process.env.JWT_SECRET);
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    return { status: response.status, body: await response.json() };
  } finally { await new Promise(resolve => server.close(resolve)); }
}

test('el guardia busca domicilios y residentes sin consultar cuotas', async t => {
  const searchModels = [models.Casa, models.Condomino, models.Cuota, models.Visita, models.Acceso, models.Evento, models.PagoReportado];
  const originals = searchModels.map(m => m.findAll);
  t.after(() => searchModels.forEach((m, i) => { m.findAll = originals[i]; }));
  let financialQueries = 0;
  models.Casa.findAll = async () => [{ id: 9, calle: 'Jardines', numero: '12' }];
  models.Condomino.findAll = async () => [{ id: 4, nombreCompleto: 'Ana Test', casa: { calle: 'Jardines', numero: '12' } }];
  models.Cuota.findAll = async () => { financialQueries++; return []; };
  models.Visita.findAll = async () => [];
  models.Acceso.findAll = async () => [{ id: 12, nombre: 'Visitante' }];
  models.Evento.findAll = async () => [];
  models.PagoReportado.findAll = async () => { financialQueries++; return []; };
  const { status, body } = await request('/api/busqueda?q=Jardines', 'SEGURIDAD');
  assert.equal(status, 200);
  assert.equal(body.casas[0].numero, '12');
  assert.equal(body.residentes[0].nombreCompleto, 'Ana Test');
  assert.equal(body.accesos[0].nombre, 'Visitante');
  assert.equal(financialQueries, 0);
});

test('la búsqueda financiera del residente queda limitada a su casa', async t => {
  const oldQuota = models.Cuota.findAll;
  const oldVisit = models.Visita.findAll;
  const oldPayment = models.PagoReportado.findAll;
  const oldEvent = models.Evento.findAll;
  t.after(() => { models.Cuota.findAll = oldQuota; models.Visita.findAll = oldVisit; models.PagoReportado.findAll = oldPayment; models.Evento.findAll = oldEvent; });
  const scopes = [];
  models.Cuota.findAll = async options => { scopes.push(options.where.casaId); return []; };
  models.Visita.findAll = async options => { scopes.push(options.where.casaId); return []; };
  models.PagoReportado.findAll = async options => { scopes.push(options.where.casaId); return []; };
  let eventWhere;
  models.Evento.findAll = async options => { eventWhere = options.where; return []; };
  const { status } = await request('/api/busqueda?q=Jardines', 'CONDOMINO', 17);
  assert.equal(status, 200);
  assert.deepEqual(scopes.sort(), [17, 17, 17]);
  assert.equal(eventWhere[Op.and][0][Op.or][1].casaId, 17);
});

test('el conmutador rechaza accesos sin permiso y limita resultados', async t => {
  const old = models.Casa.findAll;
  t.after(() => { models.Casa.findAll = old; });
  let options;
  models.Casa.findAll = async value => { options = value; return []; };
  assert.equal((await request('/api/busqueda/conmutador?calle=Jardines', 'CONDOMINO', 17)).status, 403);
  const { status } = await request('/api/busqueda/conmutador?calle=Jardines&numero=12', 'SEGURIDAD');
  assert.equal(status, 200);
  assert.equal(options.limit, 40);
  assert.equal(options.include[0].where.activo, true);
  assert.ok(options.where.calle[Op.like].includes('Jardines'));
  assert.ok(!options.attributes.includes('telefono'));
  assert.equal((await request('/api/busqueda/conmutador/opciones', 'CONDOMINO', 17)).status, 403);
  assert.equal((await request('/api/busqueda/conmutador/opciones', 'SEGURIDAD')).status, 200);
});

test('el enlace a un pago conserva el filtro de vivienda del usuario', async t => {
  const original = models.PagoReportado.findAll;
  t.after(() => { models.PagoReportado.findAll = original; });
  let options;
  models.PagoReportado.findAll = async value => { options = value; return []; };
  const { listarMisPagos } = require('../src/controllers/pagos.controller');
  let payload;
  await listarMisPagos({ usuario: { casaId: 17 }, query: { folio: 'MJ-2026-42' } }, { json(value) { payload = value; return this; } });
  assert.equal(payload.ok, true);
  assert.deepEqual(options.where, { casaId: 17, folioReporte: 'MJ-2026-42' });
});
