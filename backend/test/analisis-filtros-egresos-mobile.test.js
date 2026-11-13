'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.resolve(__dirname,'../../'+name),'utf8');
const html=read('docs/analisis-cuotas.html');
const css=read('docs/assets/css/analisis-cuotas.css');
const mobile=read('docs/assets/css/mobile-operativo.css');

test('los filtros mantienen concepto, categoría, fechas, orden y limpieza',()=>{
 const section=html.slice(html.indexOf('<div class="expense-filters"'),html.indexOf('<p id="expenseResultCount"'));
 for(const id of ['expenseFilterConcept','expenseFilterCategory','expenseFilterFrom',
   'expenseFilterTo','expenseSort','expenseClearFilters'])assert.ok(section.includes('id="'+id+'"'));
});

test('nuevo diseño móvil mantiene dos columnas sin desbordamiento y controles legibles',()=>{
 const updated=css.slice(css.lastIndexOf('/* 2026-11-13:'));
 assert.match(updated,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
 assert.match(updated,/\.expense-filters>label/);
 assert.match(updated,/grid-column:auto!important/);
 assert.match(updated,/min-width:0!important/);
 assert.match(updated,/max-width:100%!important/);
});

test('reglas tardías de la barra lateral respetan posición y campos ocultos',()=>{
 const updated=mobile.slice(mobile.lastIndexOf('/* Ajuste 2026-11-13:'));
 assert.match(updated,/#newExpense\.expense-form>label\[hidden\]/);
 assert.match(updated,/#newExpense\.expense-form>label\.expense-concept-field/);
 assert.match(updated,/#newExpense\.expense-form>#saveExpense/);
 assert.match(updated,/grid-row:5!important/);
});
