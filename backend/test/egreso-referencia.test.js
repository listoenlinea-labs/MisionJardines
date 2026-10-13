'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { referenciaEgreso } = require('../src/services/egreso-referencia.service');

test('Referencia automática basada en fecha e ID persistido', () => {
  assert.equal(referenciaEgreso('2026-10-13', 125), 'EGR-20261013-000125');
  assert.equal(referenciaEgreso('2026-10-13', 126), 'EGR-20261013-000126');
  assert.equal(referenciaEgreso('2026-10-14', 125), 'EGR-20261014-000125');
  assert.notEqual(referenciaEgreso('2026-10-13', 125), referenciaEgreso('2026-10-13', 126));
  assert.equal(referenciaEgreso('2026-10-13', 1234567), 'EGR-20261013-1234567');
});
test('Rechaza identificadores inválidos', () => {
  assert.throws(() => referenciaEgreso('2026-10-13', 0));
  assert.throws(() => referenciaEgreso('13/10/2026', 1));
  assert.throws(() => referenciaEgreso('2026-10-13', Number.NaN));
});
