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
