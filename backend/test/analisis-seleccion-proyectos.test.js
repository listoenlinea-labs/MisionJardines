'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.resolve(__dirname,'../..',p),'utf8');

const js=read('docs/assets/js/analisis-cuotas.js');
const css=read('docs/assets/css/analisis-cuotas.css');
const html=read('docs/analisis-cuotas.html');

test('selección en Mantenimiento y Extraordinarias comparte el mismo naranja pastel',()=>{
 const shared=':is(.maintenance-receipt-active,.extraordinary-receipt-active)';
 for(const rule of [
  '>tr[data-receipt-row]{cursor:pointer}',
  '>tr[data-receipt-row]:focus-visible{outline:3px solid #b4753b;outline-offset:-3px}',
  '>tr.house-receipt-selected{background:#f5d0a7}',
  '>tr.house-receipt-selected>td{background:#f5d0a7;border-bottom-color:#daa576}',
  '>tr.house-receipt-selected>td:first-child{box-shadow:none}'
 ])assert.ok(css.includes(shared+' .houses-scroll #financeHouseRows'+rule),'Falta estilo '+rule);
 assert.match(css,/body\.page-analisis\.mj-shared-sidebar-enabled \.houses-scroll #financeHouseRows>tr\.house-receipt-selected/);
});

test('solo Mantenimiento y Extraordinarias con proyecto admiten seleccionar fila',()=>{
 assert.match(js,/classList\.toggle\('maintenance-receipt-active',concepto==='MANTENIMIENTO'\)/);
 assert.match(js,/classList\.toggle\('extraordinary-receipt-active',concepto==='EXTRAORDINARIO'&&!!seleccionado\)/);
 assert.match(js,/selectionAvailable=activeConcept==='MANTENIMIENTO'\|\|\(activeConcept==='EXTRAORDINARIO'&&!!activeProyectoId\)/);
 assert.match(js,/Number\(h\.casaId\)===selectedReceiptHouseId\?'house-receipt-selected'/);
 assert.match(js,/tabindex="0" aria-selected="/);
});

test('clic y Enter o Espacio seleccionan la fila sin impedir los botones de pago',()=>{
 assert.match(js,/event\.target\.closest\('\[data-paid-history\]'\)/);
 assert.match(js,/event\.target\.closest\('\[data-tags-house\]'\)/);
 assert.match(js,/event\.target\.closest\('\[data-pay-house\]'\)/);
 assert.match(js,/if\(event\.target\.closest\('input,button,a,select,label'\)\)return/);
 assert.match(js,/selectedReceiptHouseId=Number\(row\.dataset\.receiptRow\);renderHouses\(\)/);
 assert.match(js,/\['Enter',' '\]\.includes\(event\.key\)/);
 assert.match(js,/event\.preventDefault\(\);\s*selectedReceiptHouseId=Number\(row\.dataset\.receiptRow\)/);
});

test('cambiar de pestaña o proyecto limpia la selección anterior; refrescar no',()=>{
 assert.match(js,/let receiptSelectionScope=null/);
 assert.match(js,/const nextSelectionScope=concepto==='EXTRAORDINARIO'/);
 assert.match(js,/'EXTRAORDINARIO:'\+String\(activeProyectoId\|\|''\):concepto/);
 assert.match(js,/if\(receiptSelectionScope!==nextSelectionScope\)selectedReceiptHouseId=null/);
 assert.match(js,/receiptSelectionScope=nextSelectionScope/);
 assert.match(js,/if\(!selectionAvailable\|\|!visible\.some\(h=>Number\(h\.casaId\)===selectedReceiptHouseId\)\)selectedReceiptHouseId=null/);
});

test('versiones de CSS/JS actualizadas y sintaxis correcta',()=>{
 assert.match(html,/analisis-cuotas\.js\?v=\d{8}-[a-z0-9-]+/);
 assert.match(html,/analisis-cuotas\.css\?v=\d{8}-[a-z0-9-]+/);
 assert.doesNotThrow(()=>new Function(js));
});
