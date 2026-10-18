'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.resolve(__dirname,'../../'+p),'utf8');
const ui=read('docs/assets/js/analisis-cuotas.js');
const html=read('docs/analisis-cuotas.html');
const css=read('docs/assets/css/analisis-cuotas.css');
const controller=read('backend/src/controllers/finanzas.controller.js');
const service=read('backend/src/services/adeudo-vivienda-analisis.service.js');

function pureFilters(){
 const start=ui.indexOf('function indiceUltimoMesPagado(ultimo){');
 const end=ui.indexOf('function renderHouses(){',start);
 assert.ok(start>=0&&end>start,'Existe la lógica del nuevo filtro');
 const code=ui.slice(start,end);
 const months=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
 const elements={
  financeLastPaidYear:{value:'',innerHTML:''},
 };
 const $=id=>elements[id];
 const moment=new Date('2026-10-15T18:00:00Z');
 const funcs=new Function('monthsES','$','moment','data',
   code+'; return {indiceUltimoMesPagado,actualizarAniosUltimoPago,cumpleUltimoPago};');
 return {funcs,months,elements,$,moment};
}
const house=(mes,anio)=>({ultimoMesPagado:mes?{mes,anio}:null});
test('Filtro presenta mes y año, sin día, con opciones completas y sin filtro por defecto',()=>{
 const filter=html.match(/<fieldset class="paid-through-filter">([\s\S]*?)<\/fieldset>/);
 assert.ok(filter,'Aparece el LOV');
 assert.match(filter[1],/<legend>Último mes pagado<\/legend>/);
 assert.match(filter[1],/id="financeLastPaidMonth"/);
 assert.match(filter[1],/id="financeLastPaidYear"/);
 assert.equal((filter[1].match(/<option value="(?:[1-9]|1[012])">/g)||[]).length,12);
 assert.match(filter[1],/<option value="">Todos los meses<\/option>/);
 assert.doesNotMatch(filter[1],/type="date"|type="month"|Día/);
});
test('Pagado hasta diciembre 2026 incluye diciembre, enero 2027 y febrero 2027, no noviembre',()=>{
 const {funcs,months,$,moment}=pureFilters();
 const {cumpleUltimoPago}=funcs(months,$,moment,{viviendas:[]});
 assert.equal(cumpleUltimoPago(house('NOVIEMBRE',2026),12,2026),false);
 assert.equal(cumpleUltimoPago(house('DICIEMBRE',2026),12,2026),true);
 assert.equal(cumpleUltimoPago(house('ENERO',2027),12,2026),true);
 assert.equal(cumpleUltimoPago(house('FEBRERO',2027),12,2026),true);
 assert.equal(cumpleUltimoPago(house(null),12,2026),false);
});
test('Enero 2027 exige enero 2027 o posterior, incluso cruzando años',()=>{
 const {funcs,months,$,moment}=pureFilters();
 const {cumpleUltimoPago,indiceUltimoMesPagado}=funcs(months,$,moment,{viviendas:[]});
 assert.equal(cumpleUltimoPago(house('DICIEMBRE',2026),1,2027),false);
 assert.equal(cumpleUltimoPago(house('ENERO',2027),1,2027),true);
 assert.equal(cumpleUltimoPago(house('FEBRERO',2027),1,2027),true);
 assert.equal(cumpleUltimoPago(house('ENERO',2028),1,2027),true);
 assert.equal(cumpleUltimoPago(house('AGOSTO',2026),0,2027),true);
 assert.equal(cumpleUltimoPago(house(null),0,2027),true);
 assert.equal(indiceUltimoMesPagado({mes:'DESCONOCIDO',anio:2027}),null);
});
test('La LOV de año incluye el siguiente año y anticipos futuros, conserva selección',()=>{
 const {funcs,months,$,moment,elements}=pureFilters();
 const data={viviendas:[house('ENERO',2027),house('FEBRERO',2031),house(null)]};
 const {actualizarAniosUltimoPago}=funcs(months,$,moment,data);
 actualizarAniosUltimoPago();
 assert.match(elements.financeLastPaidYear.innerHTML,/<option value="2026">2026<\/option>/);
 assert.match(elements.financeLastPaidYear.innerHTML,/<option value="2027">2027<\/option>/);
 assert.match(elements.financeLastPaidYear.innerHTML,/<option value="2031">2031<\/option>/);
 assert.equal(elements.financeLastPaidYear.value,'2026');
 elements.financeLastPaidYear.value='2027';
 actualizarAniosUltimoPago();
 assert.equal(elements.financeLastPaidYear.value,'2027');
});
test('El filtro combina calle, estado y búsqueda, reinicia página y puede limpiarse',()=>{
 const code=ui.slice(ui.indexOf('function renderHouses(){'),ui.indexOf('let activePaymentHouse=null;'));
 assert.match(code,/cumpleUltimoPago\(h,ultimoMes,ultimoAnio\)/);
 assert.match(code,/houseMatchesStatus\(h,status\)/);
 assert.match(code,/!street\|\|h\.calle===street/);
 assert.match(code,/!query\|\|hay\.includes\(query\)/);
 assert.match(code,/filtered\.slice\(\(housePage-1\)\*HOUSE_PAGE_SIZE/);
 const changes=ui.slice(ui.indexOf("for(const id of ['financeSearch'"),ui.indexOf("$('newExpense').addEventListener"));
 assert.match(changes,/financeLastPaidMonth','financeLastPaidYear/);
 assert.match(changes,/housePage=1;renderHouses\(\)/);
 assert.match(changes,/\['financeSearch','financeStreet','financeStatus','financeLastPaidMonth'\]/);
 assert.match(changes,/financeLastPaidYear'\)\.value=String\(moment\.getFullYear\(\)\)/);
});
test('El backend lee todos los años para último pago pero no adelanta deudas ni cambia finanzas',()=>{
 assert.match(controller,/Cuota\.findAll\(\{attributes:\['casaId','anio','mes','estatusPago'/);
 assert.doesNotMatch(controller,/where:\{anio:\{\[Op\.lte\]:anio\}\}/);
 assert.match(service,/const ultimo = siguienteDelUltimo\(cuotas, 2100, 12\)/);
 assert.match(service,/const limite = Math\.min\(fin,/);
 assert.match(service,/for \(let n = INICIO; n <= limite; n\+\+\)/);
 assert.match(controller,/const adeudo=calcularAdeudoVivienda\(historiales\.get\(String\(h\.id\)\)\|\|\[\],\{anio,mes\}\)/);
});
test('Responsive: LOV compacta en escritorio y en móvil, caché actualizada',()=>{
 assert.match(css,/\.residences-filter \.paid-through-controls\{/);
 assert.match(css,/grid-template-columns:minmax\(0,1\.45fr\) minmax\(0,\.8fr\)/);
 assert.match(css,/body\.page-analisis\.mj-shared-sidebar-enabled \.residences-filter/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\)!important/);
 assert.match(html,/analisis-cuotas\.css\?v=20261018-tres-conceptos/);
 assert.match(html,/analisis-cuotas\.js\?v=20261018-tres-conceptos/);
});
