'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const read=filename=>fs.readFileSync(path.resolve(__dirname,'../../'+filename),'utf8');
const html=read('docs/analisis-cuotas.html');
const css=read('docs/assets/css/analisis-cuotas.css');

const mobileRule=css.slice(css.lastIndexOf('/* iPhone / móviles: filtros de egresos en filas completas.'));

test('Los cinco filtros y Limpiar filtros se conservan, en el mismo orden',()=>{
 const begin=html.indexOf('<div class="expense-filters"');
 const end=html.indexOf('</div>',begin);
 assert.ok(begin>=0&&end>begin);
 const fragment=html.slice(begin,end);
 const ids=[
   'expenseFilterConcept','expenseFilterCategory','expenseFilterFrom',
   'expenseFilterTo','expenseSort','expenseClearFilters'
 ];
 let cursor=0;
 for(const id of ids){
   const pos=fragment.indexOf('id="'+id+'"');
   assert.ok(pos>=cursor,'Campo visible y en orden: '+id);
   cursor=pos+id.length;
 }
});

test('La cuadrícula de filtros es de una columna en todo el rango móvil',()=>{
 assert.match(mobileRule,/^\/\* iPhone \/ móviles:/);
 assert.match(mobileRule,/@media\(max-width:700px\)/);
 assert.match(mobileRule,/body\.page-analisis \.expense-filters\{/);
 assert.match(mobileRule,/grid-template-columns:minmax\(0,1fr\)!important/);
 assert.match(mobileRule,/grid-auto-flow:row!important/);
 assert.match(mobileRule,/grid-auto-rows:max-content!important/);
 assert.doesNotMatch(mobileRule,/grid-template-columns:repeat\(2/);
});

test('Cada campo usa toda la fila y no puede superponerse al vecino',()=>{
 assert.match(mobileRule,/\.expense-filters>label,\s*body\.page-analisis \.expense-filters>button\{/);
 assert.match(mobileRule,/grid-column:1\/-1!important/);
 assert.match(mobileRule,/grid-row:auto!important/);
 assert.match(mobileRule,/max-width:100%!important/);
 assert.match(mobileRule,/min-width:0!important/);
 assert.match(mobileRule,/\.expense-filters :is\(input,select\)/);
 assert.match(mobileRule,/box-sizing:border-box!important/);
 assert.match(mobileRule,/width:100%!important/);
});

test('Los controles de fechas Safari pueden reducirse sin invadir otros campos',()=>{
 assert.match(mobileRule,/\.expense-filters input\[type="date"\]/);
 assert.match(mobileRule,/-webkit-min-logical-width:0/);
 assert.match(mobileRule,/padding-inline:11px!important/);
 assert.match(mobileRule,/font-size:16px!important/);
 assert.match(mobileRule,/min-height:44px!important/);
});

test('Las reglas son móviles y se mantienen los estilos de escritorio',()=>{
 const desktop=css.slice(0,css.indexOf('/* iPhone / móviles: filtros de egresos en filas completas.'));
 assert.match(desktop,/\.expense-filters\{display:grid;grid-template-columns:minmax\(150px,1\.35fr\)/);
 assert.match(desktop,/@media\(max-width:1250px\)\{\.expense-filters/);
 assert.match(html,/analisis-cuotas\.css\?v=20261015-filtros-egresos-iphone/);
});
