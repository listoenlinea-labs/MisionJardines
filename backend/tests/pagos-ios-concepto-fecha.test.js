'use strict';
// Regresiones: el concepto del banco no debe depender de puntuación que la app bancaria rechaza.
// Ejecutar desde la raíz del repositorio: node --test backend/tests/pagos-ios-concepto-fecha.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const banco = require('../src/services/banco-correo.service');
const { validarOperacion } = require('../src/services/mensualidades-mantenimiento');

const casa = { casa: { calle: 'Prueba', numero: 'TEST-001' } };
test('concepto sin caracteres especiales corresponde a la vivienda de prueba', () => {
  assert.equal(banco.perteneceAVivienda(casa, { concepto: 'PRUEBA TEST 001' }), true);
  assert.equal(banco.perteneceAVivienda(casa, { concepto: 'Prueba Test001' }), true);
  assert.equal(banco.perteneceAVivienda(casa, { concepto: 'Prueba Casa TEST-001' }), true);
});
test('concepto no acepta otra vivienda ni otra calle', () => {
  assert.equal(banco.perteneceAVivienda(casa, { concepto: 'PRUEBA TEST 002' }), false);
  assert.equal(banco.perteneceAVivienda(casa, { concepto: 'GARDENIAS TEST 001' }), false);
  assert.equal(banco.perteneceAVivienda({ casa: { calle: 'Gardenias', numero: '5' } }, { concepto: 'GARDENIAS 6' }), false);
});
test('conceptos normales siguen correspondiendo a sus viviendas', () => {
  assert.equal(banco.perteneceAVivienda({ casa: { calle: 'Gardenias', numero: '5' } }, { concepto: 'GARDENIAS 5' }), true);
});
test('el cálculo de recargos no se adelanta a fechas futuras, aunque el reporte pueda conservarlas', () => {
  assert.throws(() => validarOperacion('2026-10-26', '2026-10-23'), /futura/i);
  assert.equal(validarOperacion('2026-10-23', '2026-10-23'), '2026-10-23');
  assert.throws(() => validarOperacion('2026-09-30', '2026-10-23'));
});
