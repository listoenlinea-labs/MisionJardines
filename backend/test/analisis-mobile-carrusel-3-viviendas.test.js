'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.resolve(__dirname,'../../',name),'utf8');
const html=read('docs/analisis-cuotas.html');
const js=read('docs/assets/js/analisis-cuotas.js');
const css=read('docs/assets/css/analisis-cuotas.css');

test('el tamaño de página depende del ancho del celular, en los tres conceptos',()=>{
 assert.match(js,/matchMedia\('\(max-width: 700px\)'\)/);
 assert.match(js,/HOUSE_PAGE_SIZE_PHONE=3/);
 assert.match(js,/HOUSE_PAGE_SIZE_DESKTOP=12/);
 // renderHouses es compartido entre mantenimiento, extraordinarias y Casa Club.
 const section=js.slice(js.indexOf('function renderHouses(){'),js.indexOf('let activePaymentHouse=',js.indexOf('function renderHouses(){')));
 assert.match(section,/data\.viviendas\.filter/);
 assert.match(section,/const pageSize=housePageSize\(\)/);
 assert.doesNotMatch(section,/HOUSE_PAGE_SIZE=12/);
 const calc=section.match(/const pageSize=housePageSize\(\);[\s\S]*?const visible=filtered\.slice\(\(housePage-1\)\*pageSize,housePage\*pageSize\);/);
 assert.ok(calc,'se encontraron el tamaño dinámico y la selección de filas');
 const paginate=new Function('filtered','housePage','housePageSize',calc[0]+';return {totalPages,housePage,visible};');
 const data=Array.from({length:231},(_,i)=>i+1);
 assert.deepEqual(paginate(data,1,()=>3),{totalPages:77,housePage:1,visible:[1,2,3]});
 assert.deepEqual(paginate(data,2,()=>3),{totalPages:77,housePage:2,visible:[4,5,6]});
 assert.deepEqual(paginate(data,77,()=>3),{totalPages:77,housePage:77,visible:[229,230,231]});
 assert.deepEqual(paginate(data,1,()=>12),{totalPages:20,housePage:1,visible:data.slice(0,12)});
 assert.deepEqual(paginate(data,25,()=>12),{totalPages:20,housePage:20,visible:data.slice(228,231)});
});

test('redimensionar conserva la posición aproximada de las viviendas',()=>{
 const m=js.match(/const updateHousePageSize=\(\)=>\{[\s\S]*?\n \};/);
 assert.ok(m);
 const change=new Function('housePage','previousHousePageSize','housePageSize','renderHouses',
  m[0]+';updateHousePageSize();return {housePage,previousHousePageSize};');
 let rerenders=0;
 assert.deepEqual(change(2,12,()=>3,()=>{rerenders++;}),
  {housePage:5,previousHousePageSize:3});
 assert.deepEqual(change(5,3,()=>12,()=>{rerenders++;}),
  {housePage:2,previousHousePageSize:12});
 assert.equal(rerenders,2);
 assert.match(js,/if\(resetPage\)housePage=1/);
});

test('solo móvil: scroll obligatorio, una gráfica completa y botones de acceso',()=>{
 assert.match(html,/id="financeMonthlyColumns"/);
 const ids=['financeIncomeCard','financeBalanceCard','financeExpenseCard'];
 const positions=ids.map(id=>html.indexOf('id="'+id+'"'));
 assert.ok(positions.every(n=>n>0));
 assert.ok(positions[0]<positions[1]&&positions[1]<positions[2]);
 for(let i=0;i<3;i++)assert.match(html,new RegExp('data-finance-slide="'+i+'"'));
 assert.match(css,/\.finance-monthly-pagination\{display:none\}/);
 assert.match(css,/@media\(max-width:700px\)\{/);
 assert.match(css,/scroll-snap-type:x mandatory/);
 assert.match(css,/scroll-snap-align:center/);
 assert.match(css,/scroll-snap-stop:always/);
 assert.match(css,/flex:0 0 100%!important/);
 assert.match(js,/slider\.scrollTo\(\{left:activeSlide\*slider\.clientWidth/);
 assert.match(js,/const observer=new ResizeObserver\(updateHeight\)/);
});

test('se retira solo la oración solicitada, conservando explicación de anticipos',()=>{
 assert.doesNotMatch(html,/Cuotas de mantenimiento que corresponden al mes y año seleccionados\./);
 assert.match(html,/Los pagos anticipados se distribuyen por cada mensualidad cubierta/);
 assert.match(js,/Cuotas pagadas de/);
 assert.match(html,/analisis-cuotas\.css\?v=20261109-mobile-3-snap-v1/);
 assert.match(html,/analisis-cuotas\.js\?v=20261109-mobile-3-snap-v1/);
});
