const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizarTelefono, buscarUsuariosPorTelefono } = require('../src/services/telefono-cuenta.service');
test('normaliza un teléfono mexicano y rechaza números ambiguos o vacíos', () => {
  for (const value of ['3312345678', '+52 (33) 1234-5678', '+5213312345678']) assert.equal(normalizarTelefono(value), '523312345678');
  for (const value of ['', '333', '3312345678/3398765432', 'tel 3312345678', '3312345678 ext 2']) assert.equal(normalizarTelefono(value), null);
});
test('consulta teléfono por expresión ORM parametrizada, califica Usuario.telefono y limita ambigüedades', async () => {
  let options;
  const model = { name: 'Usuario', async findAll(value) { options = value; return []; } };
  await buscarUsuariosPorTelefono(model, '3312345678', { attributes: ['id'] });
  const encoded = JSON.stringify(options.where);
  assert.match(encoded, /Usuario.telefono/); assert.equal(options.limit, 2);
  await assert.rejects(buscarUsuariosPorTelefono(model, 'abc'), { status: 400 });
});
