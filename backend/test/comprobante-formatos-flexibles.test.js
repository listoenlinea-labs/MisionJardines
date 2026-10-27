'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const server = require('../src/services/comprobante-parser');
const browser = require('../../docs/assets/js/comprobante-parser');
// Datos ficticios: se prueba la estructura sin publicar comprobantes personales.
const receipt = [
  'Transferencia exitosa', 'Enviaste $825.50 a PERSONA DE PRUEBA',
  '26 de octubre de 2026, 18:04:43 h', 'Desde', 'Cuenta *9876',
  'Cuenta Destino', 'PERSONA DE PRUEBA *1234', 'Concepto', 'Pago vivienda',
  'Referencia', '123456', 'Folio', '876543210'
].join('\n');
for (const [name, p] of [['servidor', server], ['navegador', browser]]) {
  test(name + ': formato de envío con fecha sin etiqueta y destino independiente', () => {
    assert.deepEqual(p.extract(receipt), { folio:'876543210', claveRastreo:'', referencia:'123456', amount:'825.50', date:'2026-10-26', time:'18:04:43' });
    assert.equal(p.verifyDestination(receipt, 'PERSONA DE PRUEBA', '1234').ok, true);
    assert.equal(p.verifyDestination(receipt, 'OTRA PERSONA', '1234').ok, false);
  });
  test(name + ': expresiones y símbolo monetario con comisión y saldo aparte', () => {
    for (const expression of ['Enviaste', 'Transferiste', 'Transferencia por']) {
      for (const value of ['$825.50', '825.50 MXN', '\n$825.50']) {
        assert.equal(p.extract(expression + ' ' + value + '\nComisión $15.00\nSaldo $9800.00').amount, '825.50');
      }
    }
    assert.equal(p.extract('Transferencia exitosa\n$1,250.50\nComisión\n$15.00\nSaldo\n$9800.00').amount, '1250.50');
    assert.equal(p.extract('Transferencia exitosa\n$1.250,50').amount, '1250.50');
    assert.equal(p.extract('Comisión $15.00\nSaldo $9800.00').amount, '');
    for (const field of ['Cuenta', 'CLABE', 'Concepto', 'Referencia', 'Folio', 'Comisión', 'Retención', 'Retenciones', 'IVA', 'Saldo']) {
      assert.equal(p.extract(field + '\n$1200.00').amount, '', field);
    }
    assert.equal(p.extract('$300.00\n$600.00').amount, '');
    assert.equal(p.extract('Comisión total: $25.00\nRetención total: $30.00').amount, '');
    assert.equal(p.extract('$825.50\nComisión $15.00\nRetención\n$30.00').amount, '825.50');
    assert.equal(p.extract('Retención Enviaste $30.00').amount, '');
    assert.equal(p.extract('Enviaste $300.00\nTransferiste $600.00').amount, '');
    assert.equal(p.extract('Enviaste $300.00\nComisión $600.00').amount, '300.00');
  });
  test(name + ': doce meses completos, abreviados y separados con diagonales/guiones', () => {
    const months = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    months.forEach((month, i) => {
      for (const row of ['08 de '+month+' de 2026', '08/'+month+'/2026', '08-'+month.slice(0,3)+'-26', '08/'+String(i+1)+'/2026']) {
        const fields = p.extract(row + ', 12:34:56 h');
        assert.equal(fields.date, '2026-'+String(i+1).padStart(2,'0')+'-08', row);
        assert.equal(fields.time, '12:34:56', row);
      }
    });
    assert.equal(p.extract('2026-10-08\n18:04:43').time, '18:04:43');
    assert.equal(p.extract('08/10/26').date, '2026-10-08');
    assert.equal(p.extract('08-SET-2026').date, '2026-09-08');
  });
  test(name + ': no inventa fechas ni selecciona fechas/horas ambiguas', () => {
    for (const row of ['31/feb/2026','29/feb/2026','10/13/2026','10/oct','octubre','Saldo 2026-10-08','Disponible hasta 08/oct/2026', 'Referencia 08/10/2026']) {
      assert.equal(p.extract(row).date, '', row);
    }
    assert.equal(p.extract('29/feb/2028').date, '2028-02-29');
    assert.equal(p.extract('08/oct/2026\n09/oct/2026').date, '');
    assert.equal(p.extract('08/oct/2026\n18:04:43\n18:05:43').time, '');
    assert.equal(p.extract('Vencimiento\n08/oct/2026').date, '');
    assert.equal(p.extract('Fecha de operación 08/oct/2026 12:34:56\n09/oct/2026').date, '2026-10-08');
    const conflict = p.extract('Enviaste $300\n08/oct/2026' + p.OCR_PASS_MARKER + 'Enviaste $600\n09/oct/2026');
    assert.equal(conflict.amount, ''); assert.equal(conflict.date, '');
  });
}
test('el parser desplegado en navegador es idéntico al del servidor', () => {
  assert.equal(fs.readFileSync(require.resolve('../src/services/comprobante-parser'), 'utf8'), fs.readFileSync(require.resolve('../../docs/assets/js/comprobante-parser'), 'utf8'));
});
