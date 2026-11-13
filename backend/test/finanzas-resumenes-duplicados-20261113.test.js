'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=relative=>fs.readFileSync(path.resolve(__dirname,'../..',relative),'utf8');

test('No quedan los tres recuadros de resumen repetido en las tarjetas financieras',()=>{
 const html=read('docs/analisis-cuotas.html');
 const renderer=read('docs/assets/js/finanzas-ambitos-vista.js');
 for(const id of ['financeIncomeTotals','financeBalanceTotals','financeExpenseTotals']){
  assert.doesNotMatch(html,new RegExp('id="'+id+'"'));
  assert.doesNotMatch(renderer,new RegExp(id));
 }
 assert.doesNotMatch(html,/class="finance-period-summary"/);
});

test('Se conservan importes detallados y diferencia de la tarjeta central',()=>{
 const html=read('docs/analisis-cuotas.html');
 const renderer=read('docs/assets/js/finanzas-ambitos-vista.js');
 for(const id of ['financeBalanceIncome','financeBalanceExpense','financeBalanceDifference',
  'financeBalanceStatus','financeBalanceIncomeBar','financeBalanceExpenseBar']){
  assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(renderer,new RegExp(id));
 }
 assert.match(renderer,/root\.MJFinanceBalance\?\.mensual\(data\)/);
 assert.match(renderer,/root\.MJFinanceBalance\?\.proyecto\(project\)/);
 assert.match(renderer,/root\.MJFinanceBalance\?\.casaClub/);
});

test('Los totales inferiores siguen visibles y conectados a sus cifras originales',()=>{
 const html=read('docs/analisis-cuotas.html');
 const renderer=read('docs/assets/js/finanzas-ambitos-vista.js');
 for(const id of ['financeIncomeFooterTotal','financeExpenseFooterTotal']){
  assert.match(html,new RegExp('id="'+id+'"'));
  assert.match(renderer,new RegExp(id));
 }
 assert.match(renderer,/incomeFooter=Number\(project\.recaudado\|\|0\)/);
 assert.match(renderer,/expenseFooter=spent/);
 assert.match(renderer,/incomeFooter=Number\(income\.mes\|\|0\)/);
 assert.match(renderer,/expenseFooter=Number\(out\.mes\|\|0\)/);
 assert.match(renderer,/Costo total presupuestado/);
 assert.match(renderer,/project\.gastosConceptos/);
});

test('La UI informa cuando falta un proyecto o datos sin reconstruir tarjetas redundantes',()=>{
 const renderer=read('docs/assets/js/finanzas-ambitos-vista.js');
 assert.match(renderer,/Selecciona un proyecto para consultar sus aportaciones/);
 assert.match(renderer,/Selecciona un proyecto para consultar sus gastos/);
 assert.match(renderer,/No hay datos de ingresos disponibles/);
 assert.match(renderer,/No hay datos de egresos disponibles/);
});


test('Ingresos por proyecto se ven como filas de escritorio, no apretadas como móvil',()=>{
 const css=read('docs/assets/css/analisis-cuotas.css');
 const html=read('docs/analisis-cuotas.html');
 const script=read('docs/assets/js/finanzas-ambitos-vista.js');
 // Los proyectos y Casa Club generan renglones directos; mantenimiento genera botones.
 assert.match(script,/ordered\.map\(\(\[name,value\]\)=>bar\(name,value,max,false,fmt\(value\)\)\)/);
 assert.match(script,/finance-income-select/);
 assert.match(css,/@media\s*\(min-width:701px\)\s*\{/);
 assert.match(css,/#financeCashChart\s*>\s*\.bar-row\s*\{/);
 assert.match(css,/min-height:44px/);
 assert.match(css,/border-bottom:1px solid #e7eaf0/);
 assert.match(css,/#financeCashChart\s*>\s*\.bar-row strong/);
 assert.match(css,/#financeCashChart\s*>\s*\.bar-row b/);
 assert.match(html,/analisis-cuotas\.css\?v=20261113-ingresos-escritorio-alineados/);
});
