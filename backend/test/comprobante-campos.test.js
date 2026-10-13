const test = require('node:test');
const assert = require('node:assert/strict');
const { validarCamposExtraidos } = require('../src/services/comprobante-lector.service');
const read = { folio: '0000098765', date: '2026-10-12', time: '12:49:23', amount: '300.00' };
const data = { folioOperacion: read.folio, fechaOperacion: read.date, horaOperacion: read.time, monto: 300 };

test('servidor: acepta los cuatro valores del comprobante sin alteraciones', () => {
  assert.doesNotThrow(() => validarCamposExtraidos(data, read, true));
});
test('servidor: rechaza datos enviados si falta cualquiera de los campos en el OCR independiente', () => {
  for (const field of Object.keys(read)) {
    assert.throws(() => validarCamposExtraidos(data, { ...read, [field]: '' }, true), { status: 422 });
  }
});
test('servidor: rechaza alteración de folio, monto, fecha y hora incluso segundos', () => {
  for (const [field, value] of [['folioOperacion', '0000098766'], ['fechaOperacion', '2026-10-09'], ['horaOperacion', '12:49:24'], ['monto', 350]]) {
    assert.throws(() => validarCamposExtraidos({ ...data, [field]: value }, read, true), { status: 422 });
  }
  assert.doesNotThrow(() => validarCamposExtraidos({ ...data, horaOperacion: '12:49' }, { ...read, time: '12:49:00' }, true));
});
test('administración conserva captura manual cuando falta un campo, pero no puede contradecir datos detectados', () => {
  assert.doesNotThrow(() => validarCamposExtraidos(data, { ...read, amount: '' }, false));
  assert.throws(() => validarCamposExtraidos({ ...data, monto: 350 }, read, false), { status: 422 });
});
