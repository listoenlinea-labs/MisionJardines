'use strict';
// Regresiones: el concepto del banco no debe depender de puntuación que la app bancaria rechaza.
// Ejecutar desde la raíz del repositorio: node --test backend/tests/pagos-ios-concepto-fecha.test.js
const test = require('node:test');
const assert = require('node:assert/strict');
const banco = require('../src/services/banco-correo.service');
const { validarOperacion } = require('../src/services/mensualidades-mantenimiento');

const pago = { casa: { calle: 'Prueba', numero: 'TEST-001' }, monto:10,
  fechaOperacion:'2026-10-26', textoOcr:'Referencia 1234567' };
for (const concepto of ['PRUEBA TEST 001', 'Prueba Test001', 'GARDENIAS 6']) {
  test('el concepto es informativo: '+concepto, () => {
    const aviso={id:'sintetico',autorizado:true,reciente:true,monto:10,
      fecha:'2026-10-26',cuenta:'409',referencia:'1234567',concepto};
    assert.equal(banco.corresponde(pago,aviso,{PAGOS_DESTINO_ULTIMOS4:'4409'}),true);
  });
}
test('el cálculo de recargos no se adelanta a fechas futuras, aunque el reporte pueda conservarlas', () => {
  assert.throws(() => validarOperacion('2026-10-26', '2026-10-23'), /futura/i);
  assert.equal(validarOperacion('2026-10-23', '2026-10-23'), '2026-10-23');
  assert.throws(() => validarOperacion('2026-09-30', '2026-10-23'));
});
