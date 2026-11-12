'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const avisos=require('../src/services/casa-club-avisos.service');
const root=path.join(__dirname,'../..');
const leer=p=>fs.readFileSync(path.join(root,p),'utf8');
test('la reserva pública no necesita variables de Meta, WhatsApp ni SMTP',()=>{
 const config=avisos.configuracion({
  PAGOS_BANCO:'BANCO DE PRUEBA',PAGOS_TITULAR:'TITULAR PRUEBA',
  PAGOS_CUENTA:'00000000000002440',CASA_CLUB_PLAZO_DIAS:'3'
 });
 assert.equal(config.dias,3);
 assert.equal(config.cuenta,'00000000000002440');
 assert.equal(config.telefonoId,undefined);
});
test('no se exige aceptación de WhatsApp en las solicitudes',()=>{
 const controller=leer('backend/src/controllers/casa-club.controller.js');
 assert.doesNotMatch(controller,/body\.aceptaWhatsApp/);
 const avisosCode=leer('backend/src/services/casa-club-avisos.service.js');
 assert.match(avisosCode,/Promise\.resolve\(false\).*No enviar instrucciones al WhatsApp/);
});
test('formulario público mantiene el enlace de comprobante en la misma página',()=>{
 const html=leer('docs/casa-club.html'),js=leer('docs/assets/js/casa-club.js');
 assert.match(html,/id="clubPaymentInstructionsDialog"/);
 assert.match(html,/id="clubInstructionsOpen">Instrucciones de pago/);
 assert.match(html,/id="clubProofInstructionsOpen">Instrucciones de pago/);
 assert.match(html,/id="clubPublicProofForm"/);
 assert.doesNotMatch(html,/id="clubOptIn"/);
 assert.match(js,/MJClubPublicProof\.open\(p\.enlaceCarga\)/);
 assert.match(js,/paymentDialog\.showModal\(\)/);
});
test('diseño móvil de reserva usa una sola columna y campos con altura estable',()=>{
 const css=leer('docs/assets/css/casa-club.css');
 assert.match(css,/#clubForm \.form-grid\{grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/#clubForm \.form-grid input:not\(\[type=checkbox\]\)/);
});
