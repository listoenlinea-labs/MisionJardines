'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.resolve(__dirname,'../..',file),'utf8');

test('El portal comparte la sesión solo para la misma vivienda y token',()=>{
 const shell=read('docs/assets/js/app-shell.js'),access=read('docs/assets/js/page-access.js');
 assert.match(shell,/MJShellVerifiedSession/);
 assert.match(shell,/prefetchRoute/);
 assert.match(access,/current\.token === token/);
 assert.match(access,/Number\(current\.user\?\.casaId\)/);
 assert.match(access,/Date\.now\(\) - current\.verifiedAt < 60000/);
 assert.match(access,/MJPermissions\.canAccess\(role,page\)/);
});
test('OCR y PDF se cargan solo cuando se necesita procesar un archivo',()=>{
 const loader=read('docs/assets/js/comprobante-tools-loader.js');
 for(const page of ['docs/pagos.html','docs/casa-club.html']){
  const html=read(page);
  assert.match(html,/comprobante-tools-loader\.js/);
  assert.doesNotMatch(html,/<script[^>]*src="https:\/\/cdn\.jsdelivr\.net\/npm\/tesseract\.js@5/);
  assert.doesNotMatch(html,/<script[^>]*src="assets\/js\/pagos-pdf\.js/);
 }
 assert.match(loader,/let ocrTask=null,pdfTask=null/);
 assert.match(loader,/import\('\.\/pagos-pdf\.js/);
 for(const js of ['docs/assets/js/pagos.js','docs/assets/js/casa-club-publico-comprobante.js']){
  assert.match(read(js),/await window\.MJComprobanteTools\.ocr\(\)/);
  assert.match(read(js),/await window\.MJComprobanteTools\.pdf\(\)/);
 }
});
test('Casa Club no consulta Google Sheets para el contador de pendientes',()=>{
 const controller=read('backend/src/controllers/casa-club.controller.js'),js=read('docs/assets/js/casa-club.js');
 const start=controller.indexOf('async function pendientesResumen(');
 const end=controller.indexOf('async function mensajeWhatsApp(',start);
 assert.ok(start>0&&end>start);
 assert.doesNotMatch(controller.slice(start,end),/await googleCasaClub\.sync\(/);
 assert.match(controller,/force:req\.query\.actualizarGoogle==='1'/);
 assert.match(js,/\?actualizarGoogle=1/);
 assert.match(js,/adminList\(true\)/);
});
test('Adjuntar comprobantes de egresos existentes no recalcula todo el análisis',()=>{
 const js=read('docs/assets/js/analisis-cuotas.js'),club=read('docs/assets/js/finanzas-casa-club-conceptos.js');
 const begin=js.indexOf("$('expenseAttachmentsForm').addEventListener('submit'");
 const end=js.indexOf('// Visor seguro de comprobantes de proyectos:',begin);
 assert.ok(begin>0&&end>begin);
 assert.doesNotMatch(js.slice(begin,end),/await load\(\)/);
 assert.match(js.slice(begin,end),/renderExpenses\(\)/);
 assert.match(club,/if\(!source\|\|changed\)/);
});
test('Logs de rendimiento no exponen parámetros ni comprobantes',()=>{
 const monitor=read('backend/src/services/api-slow-monitor.service.js');
 assert.match(monitor,/elapsed<1500/);
 assert.match(monitor,/req\.route\?\.path/);
 assert.doesNotMatch(monitor,/req\.originalUrl|req\.headers\.authorization|req\.body/);
 assert.match(read('backend/src/controllers/finanzas.controller.js'),/const historicalGoogle = anio===2026/);
});
