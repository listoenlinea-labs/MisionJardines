'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.resolve(__dirname,'../../'+p),'utf8');
const part=(source,begin,end)=>{
 const a=source.indexOf(begin),b=source.indexOf(end,a+begin.length);
 assert.ok(a!==-1&&b>a,'El bloque existe: '+begin);
 return source.slice(a,b);
};

test('TAGs con discrepancia usan un botón pastel sin agregar subtítulo visible',()=>{
 const ui=read('docs/assets/js/analisis-cuotas.js');
 const cell=part(ui,'function renderHouseTagCell(h){','let openedTagsHouse=null;');
 assert.match(cell,/const alert=tagMismatch\(h,v\)/);
 assert.match(cell,/class="house-tags-button'\+\(alert\?' is-warning':''\)/);
 assert.match(cell,/data-tags-house/);
 assert.match(cell,/aria-label/);
 assert.doesNotMatch(cell,/tags-cell-meta|tags-cell-alert|Sin controles/);
 const css=read('docs/assets/css/analisis-cuotas.css');
 assert.match(css,/\.house-tags-button\.is-warning\{/);
 assert.match(css,/background:linear-gradient\(120deg,#fff0e8,#ffe4e2\)/);
});

test('El modal destaca en rojo el texto exacto Revisar pero preserva el resumen',()=>{
 const ui=read('docs/assets/js/analisis-cuotas.js');
 const modal=part(ui,'function renderTagsModal(){','async function verifyHouseTags(){');
 assert.match(modal,/tagMismatch\(h,v\)/);
 assert.match(modal,/const warning=document\.createElement\('strong'\)/);
 assert.match(modal,/warning\.className='tags-summary-alert'/);
 assert.match(modal,/warning\.textContent=mismatch/);
 assert.match(modal,/summary\.append\(' · ',warning\)/);
 const css=read('docs/assets/css/analisis-cuotas.css');
 assert.match(css,/\.tags-summary-alert\{/);
 assert.match(css,/color:#ab3543/);
 assert.match(ui,/diagnostico\/viviendas\//);
});

test('Viviendas tienen nueve campos y una selección extra solo para mantenimiento',()=>{
 const ui=read('docs/assets/js/analisis-cuotas.js');
 const houses=part(ui,'function renderHouses(){','let activePaymentHouse=null;');
 assert.match(houses,/const houseCell=\(label,value\)=>/);
 assert.equal((houses.match(/houseCell\('/g)||[]).length,10);
 for(const name of ['Calle','Casa','Residente','Estado','Pagado','Último mes pagado','Saldo pendiente','TAGs','Pago']){
   assert.match(houses,new RegExp("houseCell\\('"+name+"'"));
 }
 assert.match(houses,/renderHouseTagCell\(h\)/);
 assert.match(houses,/h\.ultimoMesPagado/);
 assert.match(houses,/house-amount/);
 assert.match(houses,/selectionAvailable\?10:9/);
});

test('Egresos tienen seis parejas etiqueta-valor, incluyendo cobro de proyectos',()=>{
 const ui=read('docs/assets/js/analisis-cuotas.js');
 const expenses=part(ui,'function renderExpenses(){','// Resumen ligero desde MySQL');
 assert.match(expenses,/const expenseCell=\(label,value\)=>/);
 assert.equal((expenses.match(/expenseCell\('/g)||[]).length,6);
 for(const name of ['Fecha','Categoría','Concepto','Referencia','Monto','Cobro']){
   assert.match(expenses,new RegExp("expenseCell\\('"+name+"'"));
 }
 assert.match(expenses,/esc\(e\.concepto\)/);
 assert.match(expenses,/esc\(fmt\(e\.monto\)\)/);
});

test('Móvil usa una columna de fichas, etiqueta izquierda y valor derecha',()=>{
 const mobile=read('docs/assets/css/mobile-operativo.css');
 const section=mobile.slice(mobile.indexOf('/* Análisis de cuotas: fichas móviles con una sola estructura por campo.'));
 assert.match(section,/@media\(max-width:700px\)/);
 assert.match(section,/#financeHouseRows>tr:not\(:has\(td\[colspan\]\)\)/);
 assert.match(section,/#financeExpenseRows>tr:not\(:has\(td\[colspan\]\)\)/);
 assert.match(section,/grid-template-columns:minmax\(0,1fr\)!important/);
 assert.match(section,/grid-template-columns:minmax\(0,41%\) minmax\(0,1fr\)!important/);
 assert.match(section,/\.house-field-value/);
 assert.match(section,/\.expense-field-value/);
 assert.match(section,/content:attr\(data-label\)!important/);
 assert.doesNotMatch(section,/grid-template-areas:"calle casa"/);
});

test('Caché actualizada y controles operativos intactos',()=>{
 const html=read('docs/analisis-cuotas.html');
 const sidebar=read('docs/assets/js/site-sidebar.js');
 const ui=read('docs/assets/js/analisis-cuotas.js');
 assert.match(html,/analisis-cuotas\.css\?v=20261020-recibos-mantenimiento/);
 assert.match(html,/analisis-cuotas\.js\?v=20261020-recibos-mantenimiento/);
 assert.match(sidebar,/mobile-operativo\.css\?v=20261015-safari-fechas-compactas/);
 for(const action of ['houseTagsEdit','houseTagsRefresh']){
   assert.match(html,new RegExp('id="'+action+'"'));
 }
 assert.match(ui,/openHousePayment\(btn\.dataset\.payHouse\)/);
 assert.match(ui,/URLSearchParams\(\{casaId:/);
});
