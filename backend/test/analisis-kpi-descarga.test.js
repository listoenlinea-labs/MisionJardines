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
  assert.match(html,/<small><span class="finance-export-icon" aria-hidden="true"><svg[\s\S]*?<\/svg><\/span><span class="finance-export-label">Prueba<\/span><\/small>/);
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
 assert.match(css,/button\.finance-export-card small\{display:flex;align-items:center;gap:6px/);
 assert.match(css,/flex:0 0 auto/);
 assert.match(css,/prefers-reduced-motion:reduce/);
 assert.match(css,/button\.finance-export-card:focus-visible/);
 assert.match(html,/analisis-cuotas\.css\?v=20261029-kpis-legibles-mobile/);
 assert.match(html,/analisis-cuotas\.js\?v=20261029-kpis-legibles-mobile/);
});

test('KPI móvil: los títulos largos usan toda la línea y el número queda debajo',()=>{
 const src=read('docs/assets/js/analisis-cuotas.js');
 const css=read('docs/assets/css/analisis-cuotas.css');
 const from=src.indexOf(' const financeDownloadIcon=');
 const to=src.indexOf(' function render()',from);
 const renderCard=new Function('esc',src.slice(from,to)+'; return downloadableFinancialCard;')(s=>String(s));
 const scenarios=[
  ['Casas en padrón','232','padron'],
  ['Con pago registrado','201 · 86.64%','pagadas'],
  ['Sin pago completo','31 · 13%','pendientes'],
  ['Cuotas históricas registradas','$60,700','historicas']
 ];
 for(const [title,value,key] of scenarios){
  const output=renderCard(title,value,key);
  assert.match(output,/<span class="finance-export-label">/);
  assert.ok(output.includes('>'+title+'</span>'));
  assert.ok(output.includes('<strong>'+value+'</strong>'));
  assert.ok(output.includes('data-finance-export="'+key+'"'));
 }
 const mobile=css.slice(css.lastIndexOf('/* Resumen financiero móvil:'));
 assert.ok(mobile.startsWith('/* Resumen financiero móvil:'));
 assert.match(mobile,/@media\(max-width:700px\)/);
 assert.match(mobile, /#financialSummary > button\.finance-export-card\{[^}]*display:flex!important;[^}]*flex-direction:column!important;/);
 assert.match(mobile, /#financialSummary > button\.finance-export-card > small\{[^}]*white-space:normal!important;[^}]*word-break:normal!important;[^}]*overflow-wrap:normal!important;/);
 assert.match(mobile, /#financialSummary \.finance-export-label\{[^}]*white-space:normal!important;[^}]*word-break:normal!important;[^}]*overflow-wrap:normal!important;/);
 assert.match(mobile, /#financialSummary > button\.finance-export-card > strong\{[^}]*white-space:nowrap!important;/);
 assert.doesNotMatch(mobile, /#financialSecondary/);
});
