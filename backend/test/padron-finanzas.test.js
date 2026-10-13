'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { normalizarCalle, seleccionarPadronAnalisis } =
  require('../src/services/padron-finanzas.service');

const casas = [
  { id: 1, calle: 'Atotonilco', numero: '752' },
  { id: 2, calle: 'Av. Atotonilco', numero: '728' },
  { id: 3, calleCorrecta: 'Avenida Atotonilco', calle: 'Atotonilco', numero: '331' },
  { id: 4, calle: 'Guadalajara', numero: '789' },
  { id: 5, calle: 'Av. Guadalajara', numero: '707' },
  { id: 6, calle: 'Avenida Guadalajara', numero: '88.5' },
  { id: 7, calle: 'Valle de México', numero: '3614' },
  { id: 8, calle: 'Av. Valle de Mexico', numero: '88.5' },
  { id: 9, calle: 'Prueba', numero: 'TEST-001' },
  { id: 10, calle: 'Gardenias', numero: '1' },
  { id: 11, calle: 'Rosas', numero: '27' },
  { id: 12, calle: 'Jardines', numero: '142' }
];

test('Normaliza prefijos de avenida y acentos sin confundir otros nombres', () => {
  assert.equal(normalizarCalle(' Av. Valle de México '), 'valle de mexico');
  assert.equal(normalizarCalle('Avenida Guadalajara'), 'guadalajara');
  assert.equal(normalizarCalle('AV. Atotonilco'), 'atotonilco');
  assert.equal(normalizarCalle('Gardenias'), 'gardenias');
});

test('Cada avenida aporta solo su vivienda oficial y se excluye Prueba', () => {
  const snapshot = JSON.stringify(casas);
  const r = seleccionarPadronAnalisis(casas, []);
  assert.deepEqual(r.casas.map(c => c.id).sort((a,b)=>a-b), [1,4,7,10,11,12]);
  assert.equal(r.excluidas, 6);
  assert.equal(r.duplicadas, 0);
  assert.equal(JSON.stringify(casas), snapshot, 'no modifica los objetos originales');
});

test('Avenidas oficiales con variantes de escritura nunca duplican el denominador', () => {
  const variantes = [...casas, { id: 20, calle: 'Avenida Guadalajara', numero: '789' }];
  const cuotas = [{ casaId: 20, estatusPago: 'PAGADO', montoPagado: 300 }];
  const r = seleccionarPadronAnalisis(variantes, cuotas);
  const guadalajara = r.casas.filter(c => normalizarCalle(c.calle) === 'guadalajara');
  assert.equal(guadalajara.length, 1);
  assert.equal(guadalajara[0].id, 20, 'prioriza la cuota existente sin borrar la otra dirección');
  assert.equal(r.duplicadas, 1);
  assert.equal(r.excluidas, 7);
});

test('Una casa oficial pendiente sigue contando como vivienda; un pago ajeno no se traslada', () => {
  const r = seleccionarPadronAnalisis(casas, [
    { casaId: 1, estatusPago: 'PENDIENTE', montoPagado: 0 },
    { casaId: 2, estatusPago: 'PAGADO', montoPagado: 300 },
    { casaId: 7, estatusPago: 'PAGADO', montoPagado: 150 }
  ]);
  assert.ok(r.casas.find(c => c.id === 1));
  assert.ok(!r.casas.find(c => c.id === 2));
  assert.ok(r.casas.find(c => c.id === 7));
});
