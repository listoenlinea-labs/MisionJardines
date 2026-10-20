'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = p => fs.readFileSync(path.resolve(__dirname,'../../'+p),'utf8');
const html = read('docs/analisis-cuotas.html');
const js = read('docs/assets/js/analisis-cuotas.js');
const css = read('docs/assets/css/analisis-cuotas.css');
const mobile = read('docs/assets/css/mobile-operativo.css');
function between(full,a,b) {
 const start=full.indexOf(a),end=full.indexOf(b,start+a.length);
 assert.ok(start>=0&&end>start,'Existe el bloque '+a);
 return full.slice(start,end);
}

test('La tabla conserva nueve columnas sin radio y solo Mantenimiento selecciona por fila',()=>{
 const headers=between(html,'<div class="table-scroll houses-scroll">','<tbody id="financeHouseRows">');
 assert.deepEqual([...headers.matchAll(/<th[^>]*>([^<]+)<\/th>/g)].map(m=>m[1]),[
  'Calle','Casa','Residente registrado','Estado','Pagado',
  'Último mes pagado','Saldo pendiente','TAGs','Pago'
 ]);
 const render=between(js,'function renderHouses(){','let activePaymentHouse=null;');
 assert.equal((render.match(/houseCell\('/g)||[]).length,9);
 assert.doesNotMatch(render,/house-receipt-selection-cell|receiptHouseSelection/);
 assert.match(render,/tabindex="0" aria-selected=/);
 assert.match(render,/houseCell\('TAGs',renderHouseTagCell\(h\)\)\+\s*houseCell\('Pago',renderHousePayCell\(h\)\)/);
 assert.match(render,/colspan="9"/);
 assert.match(js,/if\(concepto!=='MANTENIMIENTO'\)selectedReceiptHouseId=null/);
 assert.doesNotMatch(html,/financeReceiptSelectHeader/);
});

test('Registrar pago enlaza el casaId exacto de la fila y conserva accesibilidad',()=>{
 const button=between(js,'function renderHousePayCell(h){','let openedTagsHouse=null;');
 assert.match(button,/type="button"/);
 assert.match(button,/class="house-pay-button"/);
 assert.match(button,/data-pay-house=/);
 assert.match(button,/Number\(h\.casaId\)/);
 assert.match(button,/aria-label="Registrar pago para/);
 assert.match(button,/esc\(houseName\)/);
 const click=between(js,"$('financeHouseRows').addEventListener('click'","$('housePaymentClose').addEventListener");
 assert.match(click,/event\.target\.closest\('\[data-tags-house\]'\)/);
 assert.match(click,/openHouseTags\(tagButton\.dataset\.tagsHouse\)/);
 assert.match(click,/event\.target\.closest\('\[data-pay-house\]'\)/);
 assert.match(click,/openHousePayment\(btn\.dataset\.payHouse\)/);
});

test('Modal de TAGs ya no ofrece cobro y conserva acciones C3 y edición',()=>{
 const modal=between(html,'<section id="houseTagsModal"','<section id="housePaymentModal"');
 assert.doesNotMatch(modal,/Registrar pago|houseTagsPay/);
 for(const id of ['houseTagsRefresh','houseTagsEdit','houseTagsClose','houseTagsRows'])
   assert.match(modal,new RegExp('id="'+id+'"'));
 assert.doesNotMatch(js,/houseTagsPay/);
 const payment=between(html,'<section id="housePaymentModal"','</main>');
 assert.match(payment,/id="housePaymentForm"/);
 assert.match(payment,/id="housePaymentSubmit"/);
 const submit=between(js,'async function submitHousePayment(event)',"$('financeHouseRows').addEventListener");
 assert.match(submit,/request\('\/pagos-vivienda',payload\)/);
 assert.match(submit,/closeHousePayment\(\)/);
});

test('Pago usa el mismo formulario, cotización, periodo y confirmación ya existentes',()=>{
 const opener=between(js,'function openHousePayment(casaId){','function closeHousePayment(){');
 assert.match(opener,/data\?\.viviendas\?\.find\(h=>Number\(h\.casaId\)===Number\(casaId\)\)/);
 assert.match(opener,/activePaymentHouse=house/);
 assert.match(opener,/paymentModal\.hidden=false/);
 assert.match(opener,/switchPaymentType\(\)/);
 assert.match(js,/if\(!other\)\{\$\('housePaymentAmount'\)\.readOnly=false;void quoteHousePayment\(\)/);
 assert.match(opener,/housePaymentMonth'\)\.focus\(\)/);
});

test('Botón compacto para escritorio/móvil y sin cambios a estilos del modal de pago',()=>{
 assert.match(css,/\.houses-scroll table\{min-width:1240px\}/);
 assert.match(css,/\.house-pay-button\{/);
 assert.match(css,/\.house-pay-button:hover,\.house-pay-button:focus-visible\{/);
 assert.match(css,/\.tags-modal-footer\{justify-content:flex-end\}/);
 assert.match(css,/@media\(max-width:700px\)\{\s*\.houses-scroll \.house-pay-button\{/);
 assert.match(mobile,/#financeHouseRows>tr>td\[data-label\]::before/);
 assert.match(mobile,/content:attr\(data-label\)!important/);
 assert.match(html,/analisis-cuotas\.css\?v=20261020-recibo-fila-telefono/);
 assert.match(html,/analisis-cuotas\.js\?v=20261020-recibo-fila-telefono/);
});

test('El importe Pagado mantiene el ajuste al contenido como estilo base para móvil',()=>{
 const cssRule=css.match(/\.house-paid-history\{([^}]+)\}/)?.[1]||'';
 assert.match(cssRule,/display:inline-flex/);
 assert.match(cssRule,/width:max-content/);
 assert.match(cssRule,/min-width:0/);
 assert.match(cssRule,/max-width:100%/);
 assert.match(cssRule,/white-space:nowrap/);
 assert.doesNotMatch(cssRule,/(?:^|;)min-width:100px|(?:^|;)width:100%/);
 const pagado=between(js,"houseCell('Pagado'","houseCell('Último mes pagado'");
 assert.match(pagado,/data-paid-history/);
 assert.doesNotMatch(pagado,/Ver historial<\/span>/);
});
test('Solo escritorio iguala los anchos de Estado y Pagado en las tres pestañas',()=>{
 const desktop=css.slice(css.indexOf('/* Solo escritorio: mismo ancho visual'));
 assert.match(desktop,/@media\s*\(min-width:\s*1024px\)/);
 assert.match(desktop,/\.house-field-value\s*>\s*:is\(\.status-paid,\s*\.status-pending,\s*\.status-neutral\)/);
 assert.match(desktop,/\.house-paid-history/);
 assert.match(desktop,/width:\s*128px/);
 assert.match(desktop,/min-width:\s*128px/);
 assert.match(desktop,/max-width:\s*128px/);
 assert.match(desktop,/justify-content:\s*center/);
 assert.match(js,/houseCell\('Estado'/);
 assert.match(js,/houseCell\('Pagado'/);
});
test('Pagado usa el mismo tono pastel de Estado para pendientes y sin cargos',()=>{
 const pagado=between(js,"houseCell('Pagado'","houseCell('Último mes pagado'");
 assert.match(pagado,/is-pending/);
 assert.match(pagado,/is-neutral/);
 assert.match(pagado,/String\(h\.estatus\|\|''\)\.toUpperCase\(\)==='PAGADO'/);
 assert.match(css,/\.house-paid-history\.is-pending\{[^}]*background:#fff0e4;color:#ad6a31/);
 assert.match(css,/\.house-paid-history\.is-neutral\{[^}]*background:#f0f3f8;color:#6e7b91/);
 assert.match(css,/\.house-paid-history\.is-pending:hover,\.house-paid-history\.is-pending:focus-visible/);
});
