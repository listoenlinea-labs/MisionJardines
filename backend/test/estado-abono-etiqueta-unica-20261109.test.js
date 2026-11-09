'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const js = fs.readFileSync(path.resolve(__dirname, '../../docs/assets/js/analisis-cuotas.js'), 'utf8');

function celdaEstado(h, activeConcept='MANTENIMIENTO', activeProyectoId=null) {
  const start = js.indexOf("houseCell('Estado',");
  const end = js.indexOf("houseCell('Pagado',", start);
  assert.ok(start !== -1 && end > start, 'No se encontró la plantilla de Estado');
  const expression = js.slice(start, end).trim().replace(/\+\s*$/, '');
  const esc = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return Function('h', 'activeConcept', 'activeProyectoId', 'houseCell', 'esc', 'isProjectNoAplica',
    'return ' + expression + ';')(
      h, activeConcept, activeProyectoId,
      (_label, value) => '<td>' + value + '</td>',
      esc, house => house.estatus === 'NO_APLICA'
    );
}

test('Un deudor con abono solo muestra una etiqueta, manteniendo su estatus interno', () => {
  const casa = { estatus: 'PENDIENTE', abonoConAdeudo: true, saldoPendiente: 3500 };
  const html = celdaEstado(casa);
  assert.match(html, /Abono con adeudo/);
  assert.equal((html.match(/Abono con adeudo/g) || []).length, 1);
  assert.doesNotMatch(html, />PENDIENTE</);
  assert.equal(casa.estatus, 'PENDIENTE'); // No cambia la lógica de deuda.
});

test('Deudores sin abono siguen mostrando Pendiente', () => {
  assert.match(celdaEstado({ estatus: 'PENDIENTE', abonoConAdeudo: false, saldoPendiente: 3800 }), />PENDIENTE</);
});

test('Un abono ya regularizado no altera la etiqueta Pagado', () => {
  assert.match(celdaEstado({ estatus: 'PAGADO', abonoConAdeudo: true, saldoPendiente: 0 }), />PAGADO</);
});

test('Otros conceptos conservan la etiqueta de estado original', () => {
  const html = celdaEstado({ estatus: 'PENDIENTE', abonoConAdeudo: true, saldoPendiente: 300 }, 'EXTRAORDINARIO', 8);
  assert.match(html, />SIN APORTES</);
  assert.doesNotMatch(html, /Abono con adeudo/);
});

test('La vista sigue respetando el rojo de morosidad y el filtro real del backend', () => {
  assert.match(js, /house-row-overdue/);
  assert.match(js, /if\(status==='ABONO_CON_ADEUDO'\)/);
  assert.doesNotThrow(() => new vm.Script(js));
});
