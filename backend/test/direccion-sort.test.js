'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { ordenarDirecciones, ordenarCalles } = require('../src/services/direccion-sort.service');

test('ordena calles alfabéticamente y casas numéricamente', () => {
  const original = [
    { id: 10, calleCorrecta: 'Jardines', numero: '10' },
    { id: 9, calleCorrecta: 'Gardenias', numero: '11' },
    { id: 7, calleCorrecta: 'Jardines', numero: '2' },
    { id: 3, calleCorrecta: 'Gardenias', numero: '2' },
    { id: 5, calleCorrecta: 'Valle de México', numero: '3614' }
  ];
  const sorted = ordenarDirecciones(original);
  assert.deepEqual(sorted.map(v => v.id), [3, 9, 7, 10, 5]);
  assert.deepEqual(original.map(v => v.id), [10, 9, 7, 3, 5]);
});

test('no altera datos ni pierde ceros a la izquierda', () => {
  const houses = [{ calle: 'Lirios', numero: '10' }, { calle: 'Lirios', numero: '07' }, { calle: 'Lirios', numero: '2' }];
  assert.deepEqual(ordenarDirecciones(houses).map(v => v.numero), ['2', '07', '10']);
  assert.equal(houses[1].numero, '07');
});

test('ordena calles con acentos y números de manera natural', () => {
  assert.deepEqual(ordenarCalles(['Jardines 10', 'Álamos', 'Jardines 2']), ['Álamos', 'Jardines 2', 'Jardines 10']);
});
