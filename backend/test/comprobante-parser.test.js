const test = require('node:test');
const assert = require('node:assert/strict');
const { extract, verifyDestination } = require('../src/services/comprobante-parser');

const bank = [
  'Transferencia exitosa',
  'Monto transferido',
  '$300.00',
  'Origen Cuenta -9669',
  'Destino MARIA DEL ROCIO BAHENA',
  'JUAREZ -4409 Cuenta',
  'Azteca',
  'Comision $ 0.00',
  'Concepto Gardenias 5',
  'Referencia 2309260',
  'Tipo de operacion Transferencia a otros bancos',
  'Folio de operacion 0452579754',
  'Fecha de operacion 08 oct 2026, 12:49 h.',
  'Clave de rastreo MBANO1002610080082507654'
].join('\n');

test('Bank proof: operation folio wins over reference, keeps leading zeros and reads Spanish operation date', () => {
  assert.deepEqual(extract(bank), {
    folio: '0452579754', amount: '300.00', date: '2026-10-08', time: '12:49:00'
  });
});

test('Only beneficiary and last four digits inside the Destino section pass', () => {
  assert.equal(verifyDestination(bank, 'MARÍA DEL ROCÍO BAHENA JUÁREZ', '4409').ok, true);
  assert.equal(verifyDestination(bank.replace('-4409', '-5511'), 'MARIA DEL ROCIO BAHENA JUAREZ', '4409').ok, false);
  assert.equal(verifyDestination(bank.replace('MARIA DEL ROCIO BAHENA', 'JUAN PEREZ'), 'MARIA DEL ROCIO BAHENA JUAREZ', '4409').ok, false);
  assert.equal(verifyDestination('Origen MARIA DEL ROCIO BAHENA JUAREZ -4409\nDestino JUAN PEREZ -1234', 'MARIA DEL ROCIO BAHENA JUAREZ', '4409').ok, false);
});

test('Amount, date and folio recognize other bank layouts, including thousands', () => {
  assert.deepEqual(extract('Monto transferido: $1,200.00\nFolio de operación: 0000234567\nFecha de operación: 9 de octubre de 2026 10:23 h.'), {
    folio: '0000234567', amount: '1200.00', date: '2026-10-09', time: '10:23:00'
  });
});
