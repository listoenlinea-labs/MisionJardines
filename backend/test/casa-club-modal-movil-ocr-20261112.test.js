'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');
const server=require('../src/services/comprobante-parser');
const browser=require('../../docs/assets/js/comprobante-parser');
const owner='MARIA DEL ROCIO BAHENA JUAREZ';
const endings=['4409','4884','2440'];

test('solo en teléfonos el formulario de reserva aparece en un modal único',()=>{
 const html=read('docs/casa-club.html');
 const ui=read('docs/assets/js/casa-club.js');
 const css=read('docs/assets/css/casa-club.css');
 assert.match(html,/id="clubReservationCard"/);
 assert.match(html,/id="clubMobileReservationDialog"/);
 assert.match(html,/id="clubMobileReservationClose"/);
 assert.match(html,/id="clubMobileSubmitError"/);
 assert.equal((html.match(/id="clubForm"/g)||[]).length,1);
 assert.match(ui,/matchMedia\('\(max-width: 700px\)'\)/);
 assert.match(ui,/mobileReservationDialog\.appendChild\(reservationCard\)/);
 assert.match(ui,/reservationAnchor\.parentNode\.insertBefore\(reservationCard/);
 assert.match(ui,/btn\.addEventListener\('click',[\s\S]*?abrirSolicitudMovil\(\)/);
 assert.match(ui,/mobileReservationDialog\.showModal\(\)/);
 assert.match(ui,/mobileReservationDialog\.close\(\)/);
 assert.match(ui,/if\(mobileReservationDialog\.open\)mobileReservationDialog\.close\(\);[\s\S]*?notify\(/);
 assert.match(ui,/textContent='Guardar'/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/#clubMobileReservationDialog #clubSubmit\{position:sticky/);
});

for(const [scope,parser] of [['servidor',server],['navegador',browser]]){
 for(const [kind,ending,number] of [
  ['clabe','4409','127320021284124409'],
  ['tarjeta','4884','4027666123124884'],
  ['cuenta','2440','00002128412440']
 ])test(scope+' verifica '+kind+' completa y nombre dentro del destino',()=>{
  const proof='Transferencia realizada\nPara: MARIA DEL ROCIO BAHENA JUAREZ\nCuenta receptora '+number+'\nReferencia: 0000321678';
  const result=parser.verifyDestination(proof,owner,endings);
  assert.equal(result.ok,true);assert.equal(result.matchedSuffix,ending);
 });
 test(scope+' admite palabras separadas en un bloque bancario sin mezclar origen',()=>{
  const valid='Transferiste a MARIA ROCIO BAHENA\nCuenta destino -2440';
  assert.equal(parser.verifyDestination(valid,owner,endings).ok,true);
  const wrong='Origen MARIA ROCIO BAHENA JUAREZ\nCuenta 4027666123124884\nDestino JUAN PEREZ\nCuenta destino -2440';
  assert.equal(parser.verifyDestination(wrong,owner,endings).ok,false);
  assert.equal(parser.verifyDestination('Destino JUAN PEREZ\nCuenta destino 00002128412440',owner,endings).ok,false);
 });
}

test('Casa Club utiliza relectura, contraste, HEIC y controles bancarios existentes',()=>{
 const ui=read('docs/assets/js/casa-club-publico-comprobante.js');
 const worker=read('backend/src/services/comprobante-ocr.worker.js');
 const pago=read('backend/src/controllers/pagos.controller.js');
 assert.match(ui,/SPARSE_TEXT/);
 assert.match(ui,/SINGLE_BLOCK/);
 assert.match(ui,/mejorarContraste/);
 assert.match(ui,/image\/heic/);
 assert.match(ui,/Tesseract\.createWorker\('eng'/);
 assert.match(worker,/PSM\.SINGLE_BLOCK/);
 assert.match(worker,/destinosUltimos4/);
 assert.match(pago,/idsBanco\.almacenarVerificados/);
 assert.match(pago,/comprobarDestino\(/);
 assert.match(pago,/PENDIENTE_VALIDACION/);
});
