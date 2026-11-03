'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=file=>fs.readFileSync(path.resolve(__dirname,'../../',file),'utf8');
const html=root('docs/analisis-cuotas.html');
const css=root('docs/assets/css/analisis-cuotas.css');
const js=root('docs/assets/js/analisis-cuotas.js');

test('cuatro botones visibles en una sola barra, sin recuadro adicional de recibos',()=>{
 const start=html.indexOf('<div class="finance-export-tools finance-actions-row"');
 const end=html.indexOf('<div id="financeHousePanel"',start);
 assert.ok(start>=0&&end>start,'bloque de acciones encontrado');
 const section=html.slice(start,end);
 for(const id of [
  'financeDownloadAllReceipts','financeDriveConnect',
  'financeDriveBackup','financeGenerateReceipt'
 ]){
  assert.equal(section.split('id="'+id+'"').length-1,1,id+' existe una sola vez');
 }
 const ids=['financeDownloadAllReceipts','financeDriveConnect','financeDriveBackup','financeGenerateReceipt'];
 assert.deepEqual(ids,[...section.matchAll(/id="(finance(?:DownloadAllReceipts|DriveConnect|DriveBackup|GenerateReceipt))"/g)].map(x=>x[1]));
 assert.match(section,/<div id="financeReceiptToolbar" class="finance-receipt-toolbar finance-receipt-inline">/);
 assert.match(section,/id="financeGenerateReceipt"[^>]*disabled/);
 assert.match(section,/id="financeReceiptSelection" class="finance-visually-hidden" role="status"/);
 assert.doesNotMatch(section,/finance-receipt-toolbar"><span/);
});

test('barra horizontal evita saltos, es desplazable en móvil y se adapta al contenido',()=>{
 assert.match(css,/\.finance-export-tools\.finance-actions-row\s*\{[\s\S]*?display:flex!important/);
 assert.match(css,/\.finance-export-tools\.finance-actions-row\s*\{[\s\S]*?flex-wrap:nowrap!important/);
 assert.match(css,/\.finance-export-tools\.finance-actions-row\s*\{[\s\S]*?overflow-x:auto/);
 assert.match(css,/\.finance-actions-row \.finance-receipt-inline\s*\{\s*display:contents/);
 assert.match(css,/\.finance-actions-row \.finance-receipt-inline\[hidden\]\s*\{\s*display:none!important/);
 assert.match(js,/\$\('financeReceiptToolbar'\)\.hidden=concepto!=='MANTENIMIENTO'/);
 assert.match(js,/\$\('financeGenerateReceipt'\)\.disabled=!selected/);
 assert.match(js,/\$\('financeGenerateReceipt'\)\.title=selected/);
 assert.match(js,/\$\('financeGenerateReceipt'\)\.addEventListener\('click'/);
});

test('las barras de ambas gráficas son más compactas y tienen separador',()=>{
 assert.match(css,/\.finance-chart-card \.money-bars\s*\{\s*display:grid;\s*gap:0;/);
 assert.match(css,/\.finance-chart-card \.finance-income-select,\s*\.finance-monthly-columns \.finance-chart-card \.finance-expense-select\s*\{[\s\S]*?min-height:37px/);
 assert.match(css,/\.finance-chart-card \.money-bars > button:not\(:first-child\)::before\s*\{[\s\S]*?background:#e7eaf0/);
 assert.match(css,/\.finance-chart-card \.bar-row \.track\s*\{\s*height:13px/);
 assert.match(css,/\.finance-chart-card \.finance-income-select:hover/);
 assert.match(css,/\.finance-chart-card \.finance-expense-select:hover/);
 assert.match(js,/data-income-street/);
 assert.match(js,/data-expense-concept/);
 assert.match(html,/id="financeCashChart"/);
 assert.match(html,/id="financeExpenseChart"/);
});

test('orden visual e instrucción de folio se retiran sin desactivar funciones',()=>{
 assert.doesNotMatch(html,/Orden: Calle, ascendente\. Presiona un encabezado/);
 assert.match(html,/<p id="financeSortStatus" class="finance-visually-hidden" role="status" aria-live="polite"/);
 assert.match(js,/\$\('financeSortStatus'\)\.textContent=/);
 assert.doesNotMatch(html,/class="expense-reference-note"/);
 assert.doesNotMatch(html,/Al guardar, el sistema genera un folio único para este egreso/);
 assert.match(html,/<label class="expense-concept-field">Concepto<input id="expenseConcept"/);
 assert.match(css,/\.expense-form > \.expense-concept-field\s*\{\s*grid-column:span 2/);
 assert.match(html,/id="saveExpense" class="primary">Registrar egreso/);
 assert.match(js,/\$\('newExpense'\)\.addEventListener\('submit'/);
});

test('se actualizan versiones de JS, CSS y shell sin modificar rutas',()=>{
 const app=root('docs/app.html'),shell=root('docs/assets/js/app-shell.js');
 assert.match(html,/analisis-cuotas\.js\?v=20261103-proyectos-extraordinarios/);
 assert.match(html,/analisis-cuotas\.css\?v=20261103-proyectos-extraordinarios/);
 assert.match(shell,/_mjVersion.*proyectos-extraordinarios-20261103/);
 assert.match(app,/app-shell\.js\?v=20261103-proyectos-extraordinarios/);
 assert.match(html,/id="financeTabMaintenance"/);
 assert.match(html,/id="financeTabExtra"/);
 assert.match(html,/id="financeTabClub"/);
});
