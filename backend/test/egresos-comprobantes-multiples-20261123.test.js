'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('Los cuatro formularios de egresos aceptan varios comprobantes',()=>{
 const html=read('docs/analisis-cuotas.html');
 for(const id of ['expenseFiles','expenseAttachmentsFiles','financeProjectExpenseProof',
  'financeProjectProofUploadFile','financeClubExpenseFile']){
  assert.match(html,new RegExp('<input[^>]*id="'+id+'"[^>]*multiple|<input[^>]*multiple[^>]*id="'+id+'"'));
 }
 const js=read('docs/assets/js/analisis-cuotas.js');
 assert.match(js,/data-expense-attachments/);
 assert.match(js,/async function openExpenseAttachments/);
 assert.match(js,/comprobantesGasto=/);
 assert.match(js,/financeProjectExpenseProof/);
 assert.match(read('docs/assets/js/finanzas-casa-club-conceptos.js'),/financeClubExpenseFile/);
});

test('Conserva comprobantes anteriores, consulta independiente y sin acreditar pagos bancarios',()=>{
 const routes=read('backend/src/routes/finanzas.routes.js');
 const proof=read('backend/src/controllers/comprobantes-egresos-multiples.controller.js');
 assert.match(routes,/router\.post\('\/egresos\/:id\/comprobantes'/);
 assert.match(routes,/router\.get\('\/egresos\/:id\/comprobantes\/:comprobanteId'/);
 assert.match(proof,/Adjunto\.create/);
 assert.match(proof,/existing\.some\(x=>x\.hash===hash\)/);
 assert.match(proof,/Se permiten hasta 12 comprobantes nuevos por gasto/);
 assert.match(proof,/e\.comprobanteArchivo\?/);
 assert.doesNotMatch(proof,/PagoReportado\.create|Cuota\.update|ReservaCasaClub\.update/);
 assert.match(routes,/router\.use\(autenticarToken,autorizarRoles\('SUPER_ADMIN','ADMINISTRADOR'\)\)/);
});
