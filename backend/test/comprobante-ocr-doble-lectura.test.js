'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const server = require('../src/services/comprobante-parser');
const browser = require('../../docs/assets/js/comprobante-parser');

const primary = [
  'Transferencia exitosa',
  'Monto transferido', '$10.00',
  'Origen Cuenta 9669',
  'Destino MARIA DEL ROCIO BAHENA',
  'JUAREZ 4409 Cuenta Azteca',
  'Concepto PRUEBA TEST 001'
].join('\n');

const details = [
  'Referencia 0910260',
  'Tipo de operacion Transferencia a otros bancos',
  'Folio de operacion 2026001234',
  'Fecha de operacion 26 oct 2026, 17:53 h.',
  'Clave de rastreo MBANO1002610260094909',
  '773'
].join('\n');

for (const [name, parser] of [['servidor', server], ['navegador', browser]]) {
  test(name + ': recupera datos en dos lecturas independientes del mismo comprobante', () => {
    const text = primary + parser.OCR_PASS_MARKER + details;
    assert.equal(parser.verifyDestination(text, 'MARIA DEL ROCIO BAHENA JUAREZ', '4409').ok, true);
    assert.deepEqual(parser.extract(text), {
      folio: '2026001234',
      claveRastreo: 'MBANO1002610260094909773',
      referencia: '0910260',
      amount: '10.00',
      date: '2026-10-26',
      time: '17:53:00'
    });
  });
  test(name + ': no mezcla destino y terminacion de cuentas entre lecturas', () => {
    const text = 'Destino MARIA DEL ROCIO BAHENA JUAREZ 1234' +
      parser.OCR_PASS_MARKER + 'Destino OTRA PERSONA 4409';
    assert.equal(parser.verifyDestination(text, 'MARIA DEL ROCIO BAHENA JUAREZ', '4409').ok, false);
  });
  test(name + ': discrepancias de fecha, importe o folio no eligen un valor arbitrario', () => {
    const conflicts = [
      'Monto transferido\\n$10.00\\nFolio de operacion 2026001234\\nFecha de operacion 26 oct 2026, 17:53 h.',
      'Monto transferido\\n$20.00\\nFolio de operacion 2026005678\\nFecha de operacion 25 oct 2026, 17:53 h.'
    ].map(s => s.replace(/\\n/g, '\n'));
    const extracted = parser.extract(conflicts.join(parser.OCR_PASS_MARKER));
    assert.equal(extracted.amount, '');
    assert.equal(extracted.folio, '');
    assert.equal(extracted.date, '');
    assert.equal(extracted.time, '17:53:00');
  });
}
