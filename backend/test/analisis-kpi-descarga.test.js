'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.resolve(__dirname,'../../',file),'utf8');

test('cada una de las cuatro tarjetas muestra un icono de descarga decorativo sin cambiar el tipo de Excel',()=>{
 const src=read('docs/assets/js/analisis-cuotas.js');
 const from=src.indexOf(' const financeDownloadIcon=');
 const to=src.indexOf(' function render()',from);
 assert.ok(from>=0&&to>from,'existe el constructor de tarjeta');
 const renderCard=new Function('esc',src.slice(from,to)+'; return downloadableFinancialCard;')(s=>String(s));
 for(const tipo of ['padron','pagadas','pendientes','historicas']){
  const html=renderCard('Prueba',231,tipo);
  assert.match(html,new RegExp('data-finance-export="'+tipo+'"'));
  assert.match(html,/<button type="button"[^>]*class="metric finance-export-card"/);
  assert.match(html,/<small>Prueba<span class="finance-export-icon" aria-hidden="true"><svg/);
  assert.match(html,/<strong>231<\/strong><\/button>/);
  assert.match(html,/aria-label="Descargar Excel de Prueba"/);
 }
 assert.match(src,/financialCards\.slice\(0,4\)/);
 assert.match(src,/MJFinanceExport\.descargarReporte\(data,card\.dataset\.financeExport,window\.ExcelJS\)/);
});

test('el indicador usa estilo discreto y versiones nuevas para evitar caché',()=>{
 const css=read('docs/assets/css/analisis-cuotas.css');
 const html=read('docs/analisis-cuotas.html');
 assert.match(css,/\.finance-export-icon\{/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/button\.finance-export-card:focus-visible/);
 assert.match(html,/analisis-cuotas\.css\?v=20261022-kpi-descarga-suave/);
 assert.match(html,/analisis-cuotas\.js\?v=20261022-kpi-descarga-suave/);
});
