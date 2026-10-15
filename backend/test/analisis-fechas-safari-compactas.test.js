'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const read=p=>fs.readFileSync(path.resolve(__dirname,'../../'+p),'utf8');
const html=read('docs/analisis-cuotas.html');
const js=read('docs/assets/js/analisis-cuotas.js');
const mobile=read('docs/assets/css/mobile-operativo.css');
const desktop=read('docs/assets/css/analisis-cuotas.css');
const sidebar=read('docs/assets/js/site-sidebar.js');

test('Las tres fechas siguen siendo inputs date dentro de un contenedor accesible',()=>{
 for(const id of ['expenseDate','expenseFilterFrom','expenseFilterTo']){
  const match=html.match(new RegExp('<div class="mj-date-control"><span class="mj-date-display" aria-hidden="true">[^<]+</span><input[^>]*id="'+id+'"[^>]*>'));
  assert.ok(match,'Input original de fecha y lectura decorativa: '+id);
  assert.match(match[0],/type="date"/);
 }
 assert.match(html,/<label>Fecha<div class="mj-date-control">/);
 assert.match(html,/<label>Fecha desde<div class="mj-date-control">/);
 assert.match(html,/<label>Fecha hasta<div class="mj-date-control">/);
});

test('Safari móvil solo pinta el control de 44px y recorta el date picker nativo',()=>{
 const css=mobile.slice(mobile.indexOf('/* Safari iOS: input[type=date] puede declarar'));
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/\.mj-date-control\{[\s\S]*?position:relative!important/);
 assert.match(css,/height:44px!important/);
 assert.match(css,/max-height:44px!important/);
 assert.match(css,/overflow:hidden!important/);
 assert.match(css,/\.mj-date-control>input\[type="date"\]\{/);
 assert.match(css,/position:absolute!important/);
 assert.match(css,/inset:0!important/);
 assert.match(css,/opacity:0!important/);
 assert.match(css,/cursor:pointer!important/);
 assert.match(css,/:focus-within/);
 assert.match(css,/\.mj-date-display/);
});

test('En escritorio los inputs siguen siendo nativos y la lectura está oculta',()=>{
 assert.match(desktop,/\.mj-date-control\{display:contents\}/);
 assert.match(desktop,/\.mj-date-control>\.mj-date-display\{display:none\}/);
 const rule=mobile.slice(mobile.indexOf('/* Safari iOS: input[type=date] puede declarar'));
 assert.doesNotMatch(rule,/@media\(min-width/);
});

test('La fecha se muestra abreviada, sin modificar el valor original del input',()=>{
 const begin=js.indexOf('const MONTHS_ABBR=');
 const end=js.indexOf('const expenseDateInputs=',begin);
 assert.ok(begin>=0&&end>begin);
 const src=js.slice(begin,end);
 const fn=new Function(src+'; return syncExpenseDateDisplay;')();
 const makeInput=value=>{
  const readout={classList:{contains:n=>n==='mj-date-display',toggle(n,val){this.empty=val}},textContent:''};
  return {value,previousElementSibling:readout};
 };
 for(const [iso,label] of [['2026-10-14','14 oct 2026'],['2027-01-11','11 ene 2027'],['','Elegir fecha']]){
  const input=makeInput(iso);
  fn(input);
  assert.equal(input.previousElementSibling.textContent,label);
  assert.equal(input.value,iso);
 }
});

test('Cambiar fecha actualiza el texto y limpiar filtros muestra Elegir fecha',()=>{
 assert.match(js,/expenseDateInputs\.forEach\(input=>\{/);
 assert.match(js,/input\.addEventListener\('input',\(\)=>syncExpenseDateDisplay\(input\)\)/);
 assert.match(js,/input\.addEventListener\('change',\(\)=>syncExpenseDateDisplay\(input\)\)/);
 const occurrences=js.match(/expenseDateInputs\.forEach\(syncExpenseDateDisplay\)/g)||[];
 assert.equal(occurrences.length,2,'Limpiar filtros y registrar gasto');
 assert.match(js,/fecha:\$\('expenseDate'\)\.value/);
 assert.match(js,/const from=\$\('expenseFilterFrom'\)\.value,to=\$\('expenseFilterTo'\)\.value/);
});

test('El HTML y sidebar renuevan versiones de caché',()=>{
 assert.match(html,/analisis-cuotas\.css\?v=20261015-fechas-safari-compactas/);
 assert.match(html,/analisis-cuotas\.js\?v=20261015-fechas-safari-compactas/);
 assert.match(html,/site-sidebar\.js\?v=20261015-fechas-safari-compactas/);
 assert.match(sidebar,/mobile-operativo\.css\?v=20261015-safari-fechas-compactas/);
});
