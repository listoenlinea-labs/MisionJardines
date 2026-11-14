'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.resolve(__dirname,'../..',p),'utf8');

test('Los conceptos extraordinarios son seleccionables tengan o no comprobante',()=>{
 const ui=read('docs/assets/js/finanzas-ambitos-vista.js');
 assert.match(ui,/data-project-expense-detail/);
 assert.match(ui,/aria-haspopup="dialog"/);
 assert.match(ui,/financeProjectProofModal/);
 assert.match(ui,/e\.comprobanteDisponible\?'Ver recibo':'Sin recibo'/);
 assert.match(ui,/data-expense-edit/);
});

test('Modal informa explícitamente si no hay comprobante visual',()=>{
 const html=read('docs/analisis-cuotas.html');
 const js=read('docs/assets/js/analisis-cuotas.js');
 const start=js.indexOf('async function openProjectProofModal');
 const end=js.indexOf("$('financeProjectProofClose').addEventListener",start);
 const open=js.slice(start,end);
 assert.ok(start>0&&end>start);
 assert.match(open,/Este egreso no tiene recibo o comprobante visual adjunto/);
 assert.match(open,/if\(!expense\.comprobanteDisponible\)return/);
 for(const id of ['financeProjectProofModal','financeProjectProofStatus','financeProjectProofPreview',
  'financeProjectProofDownload','financeProjectProofProject','financeProjectProofConcept',
  'financeProjectProofAmount','financeProjectProofDate','financeProjectProofReference']){
  assert.equal(html.split('id="'+id+'"').length-1,1,id);
 }
 assert.match(html,/aria-modal="true"/);
});

test('La vista previa descarga PDF o imagen autenticados, libera recursos al cerrar',()=>{
 const js=read('docs/assets/js/analisis-cuotas.js');
 assert.match(js,/\/finanzas\/egresos\/['"]\+Number\(expense\.id\)\+['"]\/comprobante/);
 assert.match(js,/Authorization:'Bearer '\+token/);
 assert.match(js,/blob\.type==='application\/pdf'\?document\.createElement\('iframe'\):document\.createElement\('img'\)/);
 assert.match(js,/URL\.createObjectURL\(blob\)/);
 assert.match(js,/URL\.revokeObjectURL\(projectProofUrl\)/);
 assert.match(js,/projectProofAbort\?\.abort\(\)/);
 assert.match(js,/projectProofMime==='image\/png'\?'\.png'/);
 assert.match(js,/projectProofSequence/);
});

test('Visor no impide doble clic para editar importe del concepto',()=>{
 const js=read('docs/assets/js/analisis-cuotas.js');
 assert.match(js,/setTimeout\(\(\)=>\{/);
 assert.match(js,/projectProofClickTimer\)clearTimeout\(projectProofClickTimer\)/);
 assert.match(js,/financeExpenseChart'\)\.addEventListener\('dblclick',handleExpenseDblclick\)/);
 assert.match(js,/financeExpenseChart'\)\.addEventListener\('keydown'/);
 assert.match(js,/if\(event\.key==='Escape'\)/);
});

test('Modal es responsivo y no altera endpoints de egresos',()=>{
 const css=read('docs/assets/css/analisis-cuotas.css');
 const backend=read('backend/src/routes/finanzas.routes.js');
 assert.match(css,/finance-project-proof-modal/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/finance-project-proof-preview iframe/);
 assert.match(backend,/router\.get\('\/egresos\/:id\/comprobante',controller\.comprobanteEgreso\)/);
});
