'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {egresosDelAmbito,categoriaDeProyecto}=require('../../docs/assets/js/finanzas-egresos-ambito.js');
const read=p=>fs.readFileSync(path.resolve(__dirname,'../..',p),'utf8');

const fixture={
 egresos:[
  {id:1,ambito:'MANTENIMIENTO',categoria:'CFE',monto:400},
  {id:2,ambito:'MANTENIMIENTO',categoria:'SERVICIOS',monto:800},
  {id:3,ambito:'CASA_CLUB',categoria:'LIMPIEZA',monto:350},
  {id:4,ambito:'EXTRAORDINARIO',categoria:'PROYECTO',proyectoId:10,monto:150},
  {id:5,ambito:'MANTENIMIENTO',categoria:'PROYECTO',monto:1000},
  {id:6,ambito:'MANTENIMIENTO',categoria:'PROYECTOS',monto:3000},
  {id:7,ambito:'MANTENIMIENTO',categoria:'OTROS',proyectoId:20,monto:900},
 ],
 proyectosExtraordinarios:[
  {id:10,nombre:'Pluma',totalEsperado:10000,gastosConceptos:[
   {id:21,concepto:'Soldadura',monto:600},
   {id:22,concepto:'Pintura',monto:200}
  ]},
  {id:20,nombre:'Calle',totalEsperado:50000,gastosConceptos:[
   {id:23,concepto:'Material',monto:2500}
  ]}
 ]
};

test('Mantenimiento conserva sus gastos reales sin mezclar proyectos ni Casa Club',()=>{
 const result=egresosDelAmbito(fixture,'MANTENIMIENTO',10);
 assert.deepEqual(result.egresos.map(e=>e.id),[1,2]);
 assert.equal(result.proyecto,null);
 assert.equal(categoriaDeProyecto('PROYECTOS'),true);
 assert.equal(categoriaDeProyecto('CUOTA_EXTRAORDINARIA'),true);
});

test('Cada proyecto presenta únicamente sus conceptos de gastos, no el presupuesto',()=>{
 const a=egresosDelAmbito(fixture,'EXTRAORDINARIO',10);
 const b=egresosDelAmbito(fixture,'EXTRAORDINARIO',20);
 assert.deepEqual(a.egresos.map(e=>e.id),[21,22]);
 assert.deepEqual(b.egresos.map(e=>e.id),[23]);
 assert.equal(a.egresos.every(e=>e.proyectoId===10&&e.ambito==='EXTRAORDINARIO'),true);
 assert.equal(a.egresos.reduce((sum,e)=>sum+e.monto,0),800);
 assert.equal(a.proyecto.totalEsperado,10000);
 assert.deepEqual(egresosDelAmbito(fixture,'EXTRAORDINARIO',null).egresos,[]);
});

test('Casa Club no toma mantenimiento ni conceptos de proyectos',()=>{
 const club=egresosDelAmbito(fixture,'CASA_CLUB',null);
 assert.deepEqual(club.egresos.map(e=>e.id),[3]);
 assert.deepEqual(egresosDelAmbito(fixture,'DESCONOCIDO',null).egresos,[]);
});

test('Registro a la izquierda, filtros a la derecha y tabla debajo, con título contextual',()=>{
 const html=read('docs/analisis-cuotas.html');
 const left=html.indexOf('class="finance-expense-panel finance-expense-register-panel"');
 const right=html.indexOf('class="finance-expense-panel finance-expense-filter-panel"');
 const table=html.indexOf('id="financeExpenseRows"');
 assert.ok(left>0&&right>left&&table>right);
 assert.ok(html.indexOf('id="newExpense"')>left&&html.indexOf('id="newExpense"')<right);
 assert.ok(html.indexOf('id="expenseFilterConcept"')>right&&html.indexOf('id="expenseFilterConcept"')<table);
 for(const id of ['financeExpenseRegisterHeading','financeExpenseFiltersHeading','expenseHistoryTitle','expenseHistoryScope'])
  assert.ok(html.includes('id="'+id+'"'));
});

test('Ambas tarjetas presentan total al pie y las calles tienen divisores en móvil',()=>{
 const html=read('docs/analisis-cuotas.html'),css=read('docs/assets/css/analisis-cuotas.css');
 const view=read('docs/assets/js/finanzas-ambitos-vista.js');
 for(const id of ['financeIncomeFooterTotal','financeExpenseFooterTotal'])assert.ok(html.includes('id="'+id+'"'));
 assert.ok(html.indexOf('id="financeIncomeFooter"')>html.indexOf('id="financeCashChart"'));
 assert.ok(html.indexOf('id="financeExpenseFooter"')>html.indexOf('id="financeExpenseChart"'));
 assert.match(view,/incomeFooter=Number\(project\.recaudado\|\|0\)/);
 assert.match(view,/expenseFooter=spent/);
 assert.match(view,/expenseFooter=Number\(out\.mes\|\|0\)/);
 assert.match(css,/#financeCashChart > \.bar-row/);
 assert.match(css,/border-bottom:1px solid #dce6ec!important/);
 assert.match(css,/\.finance-expense-layout\{grid-template-columns:minmax\(0,1fr\)/);
});


test('El alta de conceptos ahora solo aparece en un modal, abierta por + Concepto',()=>{
 const html=read('docs/analisis-cuotas.html');
 const card=html.indexOf('id="financeExpenseCard"');
 const trigger=html.indexOf('id="financeProjectExpenseOpen"');
 const modal=html.indexOf('id="financeProjectExpenseModal"');
 const form=html.indexOf('id="financeProjectExpenseForm"');
 const nav=html.indexOf('id="financeMonthlyPagination"');
 assert.ok(card>=0&&trigger>card&&modal>trigger&&form>modal&&nav>form);
 for(const id of ['financeProjectExpenseOpen','financeProjectExpenseModal',
  'financeProjectExpenseForm','financeProjectExpenseName','financeProjectExpenseAmount',
  'financeProjectExpenseDate','financeProjectExpenseProof','financeProjectExpenseSave',
  'financeProjectExpenseClose','financeProjectExpenseCancel']){
  assert.equal(html.split('id="'+id+'"').length-1,1,id+' debe existir una sola vez');
 }
 assert.match(html,/aria-haspopup="dialog"/);
 assert.match(html,/aria-modal="true"/);
 assert.match(html,/role="dialog"/);
 assert.match(html,/\+<\/span> Concepto/);
});
test('Cerrar modal no registra gastos y la acción de guardar conserva el backend',()=>{
 const js=read('docs/assets/js/analisis-cuotas.js');
 const css=read('docs/assets/css/analisis-cuotas.css');
 assert.match(js,/projectExpenseTrigger\.addEventListener\('click',openProjectExpenseModal\)/);
 assert.match(js,/financeProjectExpenseClose'\)\.addEventListener/);
 assert.match(js,/financeProjectExpenseCancel'\)\.addEventListener/);
 assert.match(js,/e\.key==='Escape'/);
 assert.match(js,/projectExpensePreviousFocus\.focus\(\)/);
 assert.match(js,/projectExpenseModal\.dataset\.proyectoId/);
 assert.match(js,/await request\('\/egresos',body\)/);
 assert.match(js,/closeProjectExpenseModal\(\{force:true\}\)/);
 assert.match(css,/\.finance-project-concept-trigger/);
 assert.match(css,/\.finance-project-expense-modal/);
 assert.match(css,/@media\(max-width:700px\)/);
});


test('Mantenimiento permite consultar Proyectos solo al elegir ese filtro',()=>{
 const normal=egresosDelAmbito(fixture,'MANTENIMIENTO',null);
 const consulta=egresosDelAmbito(fixture,'MANTENIMIENTO',null,'PROYECTO');
 assert.deepEqual(normal.egresos.map(e=>e.id),[1,2]);
 assert.deepEqual(consulta.egresos.map(e=>e.id),[4,5,6,7]);
 assert.equal(consulta.proyecto,null);
 // La consulta no reasigna ámbitos, modifica ingresos ni duplica gastos.
 assert.equal(fixture.egresos[3].ambito,'EXTRAORDINARIO');
 assert.deepEqual(egresosDelAmbito(fixture,'MANTENIMIENTO',null,'CFE').egresos.map(e=>e.id),[1,2]);
 assert.deepEqual(egresosDelAmbito(fixture,'CASA_CLUB',null,'PROYECTO').egresos.map(e=>e.id),[3]);
});

test('El filtro Proyectos reconoce categorías heredadas, egresos reales e ID del proyecto',()=>{
 const {esMovimientoDeProyecto}=require('../../docs/assets/js/finanzas-egresos-ambito.js');
 for(const e of [
  {categoria:'PROYECTO',ambito:'EXTRAORDINARIO'},
  {categoria:'PROYECTOS',ambito:'EXTRAORDINARIO'},
  {categoria:'CUOTA_EXTRAORDINARIA',ambito:'EXTRAORDINARIO'},
  {categoria:'SERVICIOS',ambito:'EXTRAORDINARIO'},
  {categoria:'OTROS',ambito:'MANTENIMIENTO',proyectoId:9}
 ])assert.equal(esMovimientoDeProyecto(e),true);
 assert.equal(esMovimientoDeProyecto({categoria:'CFE',ambito:'MANTENIMIENTO'}),false);
 assert.equal(esMovimientoDeProyecto({categoria:'OTROS',ambito:'CASA_CLUB'}),false);
});

test('Proyectos se habilita en Mantenimiento solo para consulta del período',()=>{
 const html=read('docs/analisis-cuotas.html');
 const js=read('docs/assets/js/analisis-cuotas.js');
 const filter=html.slice(html.indexOf('id="expenseFilterCategory"'),html.indexOf('id="expenseFilterFrom"'));
 const register=html.slice(html.indexOf('id="expenseCategory"'),html.indexOf('id="expenseScope"'));
 assert.match(filter,/<option value="PROYECTO">Proyectos<\/option>/);
 assert.match(register,/<option value="PROYECTO">Proyecto<\/option>/);
 assert.match(js,/consultaProyectos=activeConcept==='MANTENIMIENTO'&&category==='PROYECTO'/);
 assert.match(js,/!consultaProyectos&&!e\.esAjusteMensual/);
 assert.match(js,/No se incluyen en los ingresos, egresos ni balance de mantenimiento/);
 assert.match(js,/concepto==='MANTENIMIENTO'\|\|option\.value!=='PROYECTO'/);
 assert.match(js,/matchMedia\('\(max-width:700px\)'\)\.matches\?3:10/);
});
