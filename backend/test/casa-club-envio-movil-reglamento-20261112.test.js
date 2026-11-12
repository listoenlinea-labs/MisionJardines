'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'../..',p),'utf8');

test('CTA de envío móvil existe una sola vez, empieza oculto y fuera del modal',()=>{
 const html=read('docs/casa-club.html');
 assert.equal((html.match(/id="clubMobileSendRequest"/g)||[]).length,1);
 assert.equal((html.match(/id="clubForm"/g)||[]).length,1);
 assert.match(html,/<div id="clubMobileSubmitArea" class="club-mobile-submit-area" hidden>/);
 assert.match(html,/<button type="button" id="clubMobileSendRequest"[^>]*disabled>Enviar solicitud de reservación<\/button>/);
 const mainButton=html.indexOf('id="clubMobileSendRequest"');
 const modal=html.indexOf('id="clubMobileReservationDialog"');
 assert.ok(mainButton<modal,'el CTA debe vivir en pantalla principal, no dentro del modal');
});

test('la aceptación del reglamento determina la visibilidad, y la fecha habilita el CTA',()=>{
 const js=read('docs/assets/js/casa-club.js');
 const css=read('docs/assets/css/casa-club.css');
 assert.match(js,/area\.hidden=!rulesAccepted/);
 assert.match(js,/send\.disabled=!rulesAccepted\|\|!canSubmit\(\)/);
 assert.match(js,/rulesAccepted=true;actualizarAceptacionReglamento\(\)/);
 assert.match(css,/\.club-mobile-submit-area\{display:none\}/);
 assert.match(css,/\.club-mobile-submit-area:not\(\[hidden\]\)/);
 assert.match(css,/body\.club-private-reservation-view \.club-mobile-submit-area\{display:none!important\}/);
});

test('Guardar no envía solicitud; el botón externo es el único envío móvil',()=>{
 const js=read('docs/assets/js/casa-club.js');
 assert.match(js,/mobileReservationDialog\.appendChild\(reservationCard\);\s*\$\('clubSubmit'\)\.type='button'/);
 assert.match(js,/\$\('clubSubmit'\)\.type='submit'/);
 assert.match(js,/\$\('clubSubmit'\)\.addEventListener\('click',[\s\S]*?validarSolicitud\(\{omitirReglamento:true\}\)[\s\S]*?mobileDetailsSaved=true/);
 assert.match(js,/\$\('clubMobileSendRequest'\)\.addEventListener\('click',[\s\S]*?if\(!mobileDetailsSaved\)[\s\S]*?\$\('clubForm'\)\.requestSubmit\(\)/);
 assert.match(js,/if\(!omitirReglamento&&!rulesAccepted\)invalid\('reglamento'/);
 assert.match(js,/mobileDetailsSaved=false;[\s\S]*?\$\('clubMobileSavedStatus'\)/);
});

test('escritorio conserva envío de formulario y el éxito oculta de nuevo el CTA',()=>{
 const js=read('docs/assets/js/casa-club.js');
 assert.match(js,/rulesAnchor\.parentNode\.insertBefore\(rulesCard,rulesAnchor\.nextSibling\);\s*\$\('clubSubmit'\)\.type='submit'/);
 assert.match(js,/\$\('clubForm'\)\.addEventListener\('submit',async e=>/);
 assert.match(js,/fillProfile\(\);rulesAccepted=false;actualizarAceptacionReglamento\(\)/);
});
