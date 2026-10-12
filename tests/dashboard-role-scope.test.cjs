'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

Object.assign(process.env, {
  DB_HOST: 'localhost',
  DB_PORT: '3306',
  DB_NAME: 'mision_jardines_test',
  DB_USER: 'test',
  DB_PASSWORD: 'test'
});

const sequelize = require('../backend/src/config/database');
const { obtenerDashboard } = require('../backend/src/controllers/dashboard.controller');

function responseCapture() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return body; }
  };
}

test('CONDOMINO consulta únicamente los datos de su casa', async () => {
  const queries = [];
  sequelize.query = async (sql, options) => {
    queries.push({ sql: String(sql).replace(/\s+/g, ' ').trim(), replacements: options.replacements });
    return [];
  };

  const response = responseCapture();
  await obtenerDashboard({ usuario: { rol: 'CONDOMINO', casaId: 77 } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.ok(queries.length > 0);
  const privateQueries = queries.filter(query => /FROM (cuotas|visitas_programadas|accesos_seguridad|condominos)/.test(query.sql));
  assert.ok(privateQueries.length >= 8);
  for (const query of privateQueries) {
    assert.equal(query.replacements.casaId, 77);
    assert.match(query.sql, /casa_id = :casaId|direccion_id = :casaId/);
  }
});

test('SEGURIDAD no ejecuta consultas financieras', async () => {
  const queries = [];
  sequelize.query = async (sql) => {
    queries.push(String(sql).replace(/\s+/g, ' ').trim());
    return [];
  };

  const response = responseCapture();
  await obtenerDashboard({ usuario: { rol: 'SEGURIDAD', casaId: 1 } }, response);

  assert.equal(response.statusCode, 200);
  assert.equal(response.body.ok, true);
  assert.equal(queries.some(sql => /FROM cuotas/.test(sql)), false);
  assert.equal('recaudacion' in response.body, false);
  assert.equal('eventos' in response.body, false);
});
