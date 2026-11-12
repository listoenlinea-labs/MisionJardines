'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'../..',p),'utf8');
const html=read('docs/casa-club.html'),script=read('docs/assets/js/casa-club-publico-comprobante.js'),
 css=read('docs/assets/css/casa-club.css'),main=read('docs/assets/js/casa-club.js');
test('el comprobante está dentro del panel izquierdo, después del calendario',()=>{
 const begin=html.indexOf('id="clubCalendarHint"');
 const finish=html.indexOf('</article>',begin);
 const intro=html.indexOf('id="clubProofIntro"');
 const proof=html.indexOf('id="clubPublicProofFlow"');
 assert.ok(begin>=0&&intro>begin&&proof>intro&&proof<finish);
 assert.equal(html.slice(0,html.indexOf('id="tab-reservar"')).includes('id="clubPublicProofFlow"'),false);
});
test('carga protegida visible solo tras generar el enlace de reserva',()=>{
 assert.match(html,/id="clubProofIntro"[^>]*>/);
 assert.match(html,/id="clubPublicProofFlow"[^>]*hidden>/);
 assert.match(html,/id="clubProofFile"[^>]*type="file"/);
 assert.match(html,/id="clubProofSubmit"[^>]*disabled/);
 assert.match(script,/if\(!parsed\)return;/);
 assert.match(script,/\$\('clubProofIntro'\)\.hidden=true;/);
 assert.match(script,/\$\('clubPublicProofFlow'\)\.hidden=false;/);
 assert.match(main,/MJClubPublicProof\.open\(p\.enlaceCarga\)/);
});
test('OCR, estado Titan y diseño móvil permanecen accesibles',()=>{
 for(const id of ['clubProofFolio','clubProofAmount','clubProofDate','clubProofTime','clubProofRead','clubProofRefresh','clubProofRetry','clubProofReceipt','clubProofInstructionsOpen'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(css,/#tab-reservar \.club-public-proof-form\{grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/#tab-reservar \.club-proof-fields\{grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/#tab-reservar \.club-proof-actions\{grid-template-columns:minmax\(0,1fr\)/);
});
