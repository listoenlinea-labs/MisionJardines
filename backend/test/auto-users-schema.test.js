const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
test('migration preserves existing acceptance and credentials, supports null email and runs idempotently', async () => {
  const columns = { correo: { allowNull: false } }, indexes = [], events = [];
  const qi = {
    describeTable: async () => columns,
    addColumn: async (table, field, definition) => { columns[field] = definition; events.push(['add', field]); },
    changeColumn: async (table, field, definition) => { columns[field] = definition; events.push(['change', field]); },
    showIndex: async () => indexes,
    addIndex: async (table, fields, options) => { indexes.push({ unique: true, fields: [{ attribute: fields[0] }] }); events.push(['index', fields[0]]); }
  };
  const sandbox = { require: name => name === 'sequelize' ? require('sequelize') : name === '../config/database' ? { getQueryInterface: () => qi } : { sync: async () => {} }, module: { exports: {} } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/services/auto-users-schema.service.js'), 'utf8'), sandbox);
  await sandbox.module.exports.asegurarAutoUsers();
  assert.equal(columns.cuenta_aceptada.defaultValue, true);
  assert.equal(columns.condomino_id.references.model, 'condominos'); assert.equal(columns.condomino_id.onDelete, 'RESTRICT');
  assert.equal(columns.correo.allowNull, true); assert.equal(indexes.length, 2);
  assert.ok(!events.some(e => ['estatus', 'contrasena_hash'].includes(e[1])));
  const length = events.length; await sandbox.module.exports.asegurarAutoUsers(); assert.equal(events.length, length);
});
