'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const html = fs.readFileSync(path.resolve(__dirname, '../../docs/analisis-cuotas.html'), 'utf8');
const js = fs.readFileSync(path.resolve(__dirname, '../../docs/assets/js/analisis-cuotas.js'), 'utf8');
const controller = fs.readFileSync(path.resolve(__dirname, '../src/controllers/finanzas.controller.js'), 'utf8');

test('Filtros de egresos: concepto, categoría, fecha, importe y orden', () => {
  for(const id of ['expenseFilterConcept','expenseFilterCategory','expenseFilterFrom','expenseFilterTo','expenseSort','expenseClearFilters','expenseResultCount']) {
    assert.match(html, new RegExp('id="'+id+'"'));
    assert.match(js, new RegExp(id));
  }
  assert.match(js, /Number\(a\.monto\)-Number\(b\.monto\)/);
  assert.match(js, /Number\(b\.monto\)-Number\(a\.monto\)/);
  assert.match(js, /String\(a\.fecha\)\.localeCompare/);
  assert.match(js, /String\(b\.fecha\)\.localeCompare/);
});

test('Registro genera referencia en backend después de guardar ID, sin alterar históricos', () => {
  assert.doesNotMatch(html, /id="expenseReference"/);
  assert.doesNotMatch(js, /\$\('expenseReference'\)/);
  assert.match(controller, /sequelize\.transaction\(async transaction/);
  assert.match(controller, /referenciaEgreso\(fecha,row\.id\)/);
  assert.match(controller, /await row\.update\(\{referencia\},\{transaction\}\)/);
  assert.match(js, /saved\.referencia/);
});

test('Calendarios de egresos abren al hacer clic en toda el área y tienen acceso por teclado', () => {
  assert.match(js, /function openExpenseDatePicker\(input\)/);
  assert.match(js, /input\.showPicker\(\)/);
  assert.match(js, /input\.focus\(\)/);
  assert.match(js, /input\.addEventListener\('click',\(\)=>openExpenseDatePicker\(input\)\)/);
  assert.match(js, /event\.key==='Enter'\|\|event\.key===' '/);
  assert.match(html, /analisis-cuotas\.js\?v=20261103-egresos-filtros-fecha/);
});

test('Fecha desde y hasta filtran ante input o change sin modificar egresos', () => {
  assert.match(js, /\(!from\|\|String\(e\.fecha\)>=from\)/);
  assert.match(js, /\(!to\|\|String\(e\.fecha\)<=to\)/);
  assert.match(js, /for\(const id of \['expenseFilterFrom','expenseFilterTo'\]\)\s*\$\(id\)\.addEventListener\('input',renderExpenses\)/);
  assert.match(js, /for\(const id of \['expenseFilterCategory','expenseFilterFrom','expenseFilterTo','expenseSort'\]\)\s*\$\(id\)\.addEventListener\('change',renderExpenses\)/);
});
