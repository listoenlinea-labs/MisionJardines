'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.resolve(__dirname,'../..',p),'utf8');

test('presupuesto base y costo total abren un modal de desglose con tabla y editor',()=>{
 const html=read('docs/analisis-cuotas.html');
 const view=read('docs/assets/js/finanzas-ambitos-vista.js');
 const js=read('docs/assets/js/analisis-cuotas.js');
 for(const id of ['financeProjectBreakdownModal','financeProjectBreakdownRows',
  'financeProjectBreakdownTotals','financeProjectBreakdownStatus','financeProjectBreakdownClose',
  'financeProjectBreakdownDone']){
  assert.equal(html.split('id="'+id+'"').length-1,1,id);
 }
 assert.match(view,/data-project-budget/);
 assert.match(view,/finance-project-breakdown-trigger/);
 assert.match(view,/summaryTrigger\.setAttribute\('aria-controls','financeProjectBreakdownModal'\)/);
 assert.match(js,/function openProjectBreakdown/);
 assert.match(js,/financeBalanceExpense/);
 assert.match(js,/financeExpenseFooter/);
});

test('el desglose distingue presupuesto, gastos incluidos, adicionales y costo total',()=>{
 const js=read('docs/assets/js/analisis-cuotas.js');
 assert.match(js,/function renderProjectBreakdown/);
 assert.match(js,/const additional=Math\.round/);
 assert.match(js,/const total=budget\+additional/);
 assert.match(js,/Incluido/);
 assert.match(js,/Adicional/);
 assert.match(js,/Presupuesto base/);
 assert.match(js,/Costo total comprometido/);
 assert.match(js,/Gastos registrados/);
});

test('Editar es explícito y no exige doble clic en conceptos extraordinarios',()=>{
 const view=read('docs/assets/js/finanzas-ambitos-vista.js');
 const js=read('docs/assets/js/analisis-cuotas.js');
 assert.match(js,/data-breakdown-edit/);
 assert.match(js,/data-breakdown-save/);
 assert.match(js,/data-breakdown-cancel/);
 assert.doesNotMatch(view,/Doble clic para editar presupuesto/);
 assert.doesNotMatch(view,/Doble clic para editar importe/);
 assert.doesNotMatch(js,/financeExpenseChart'\)\.addEventListener\('dblclick',handleExpenseDblclick\)/);
 assert.match(js,/activeConcept!=='MANTENIMIENTO'/);
});

test('la edición de concepto se guarda usando monto anterior con confirmación',()=>{
 const js=read('docs/assets/js/analisis-cuotas.js');
 assert.match(js,/egresos\/'.*?\/monto/);
 assert.match(js,/proyectos-extraordinarios\/'.*?\/presupuesto/);
 assert.match(js,/montoAnterior:old/);
 assert.match(js,/montoAnterior:base/);
 assert.match(js,/const newBase=kind==='total'\?amount-additional:amount/);
 assert.match(js,/window\.confirm\(message\)/);
 assert.match(js,/await load\(\)/);
});

test('modal adapta dimensiones en celular y conserva el visor de comprobantes',()=>{
 const css=read('docs/assets/css/analisis-cuotas.css');
 const html=read('docs/analisis-cuotas.html');
 const js=read('docs/assets/js/analisis-cuotas.js');
 assert.match(css,/finance-project-breakdown-dialog/);
 assert.match(css,/finance-project-breakdown-scroll/);
 assert.match(css,/max-height:52dvh/);
 assert.match(html,/id="financeProjectProofModal"/);
 assert.match(js,/openProjectProofModal/);
});
