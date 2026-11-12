'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const backend=require('../src/services/comprobante-parser');
const browser=require('../../docs/assets/js/comprobante-parser');
const owner='MARIA DEL ROCIO BAHENA JUAREZ';
const ends=['4409','4884','2440'];
const mercado=`Comprobante de transferencia
mercado pago WALLET
Comprobante de transferencia
12/noviembre/2026 a las 12:59.
$ 350 MXN
Concepto: JARDINES 319
Origen y destino
Cesar Camacho
Mercado Pago Wallet
CLABE: ****6260
MARIA DEL ROCIO BAHENA JUAREZ
AZTECA
Número de tarjeta: ****4884
Comprobante
#188198047943`;
for(const [name,p] of [['servidor',backend],['navegador',browser]]){
 test(name+' identifica el comprobante de Mercado Pago presentado por el usuario',()=>{
  const fields=p.extract(mercado);
  assert.deepEqual(fields,{
   folio:'188198047943',claveRastreo:'',referencia:'',
   amount:'350.00',date:'2026-11-12',time:'12:59:00'
  });
  const result=p.verifyDestination(mercado,owner,ends);
  assert.equal(result.ok,true);
  assert.equal(result.matchedSuffix,'4884');
 });
 test(name+' funciona sin OCR del logo y no inventa emisor ni receptora',()=>{
  const noLogo=mercado.replace('mercado pago WALLET','WALLET');
  assert.equal(p.extract(noLogo).folio,'188198047943');
  assert.equal(p.verifyDestination(noLogo,owner,ends).ok,true);
  assert.equal(p.verifyDestination(mercado.replace('MARIA DEL ROCIO BAHENA JUAREZ','PERSONA AJENA'),owner,ends).ok,false);
  const reverse=mercado.replace('Cesar Camacho','MARIA DEL ROCIO BAHENA JUAREZ')
   .replace('MARIA DEL ROCIO BAHENA JUAREZ\nAZTECA','PERSONA AJENA\nAZTECA');
  assert.equal(p.verifyDestination(reverse,owner,ends).ok,false);
  assert.equal(p.extract(mercado.replace('$ 350 MXN','Sin importe')).amount,'');
 });
}
test('el parser del backend es idéntico al de navegador en Pagos y Casa Club',()=>{
 assert.equal(read('backend/src/services/comprobante-parser.js'),read('docs/assets/js/comprobante-parser.js'));
});
test('la liga general NO muestra la carga; solo el enlace del correo la habilita',()=>{
 const html=read('docs/casa-club.html');
 const proof=read('docs/assets/js/casa-club-publico-comprobante.js');
 const booking=read('docs/assets/js/casa-club.js');
 assert.match(html,/id="clubPrivateReservationSummary"[^>]*hidden/);
 assert.match(html,/id="clubPublicProofFlow"[^>]*hidden/);
 assert.match(proof,/if\(parse\(location\.hash\)\)open\(location\.hash\)/);
 assert.match(proof,/else\{\s*acceso=null;[\s\S]*?\$\('clubPublicProofFlow'\)\.hidden=true;/);
 assert.match(proof,/document\.body\.classList\.add\('club-private-reservation-view'\)/);
 assert.doesNotMatch(booking,/await proof\.sendPrepared\(\)/);
 assert.doesNotMatch(booking,/MJClubPublicProof\.open\(p\.enlaceCarga\)/);
});
test('reglamento sigue visible en pantalla principal del celular, sin duplicar formulario',()=>{
 const html=read('docs/casa-club.html'),booking=read('docs/assets/js/casa-club.js');
 const css=read('docs/assets/css/casa-club.css');
 assert.equal((html.match(/id="clubRegulationsAcceptance"/g)||[]).length,1);
 assert.equal((html.match(/id="clubForm"/g)||[]).length,1);
 assert.match(booking,/clubCalendarHint'\)\.insertAdjacentElement\('afterend',rulesCard\)/);
 assert.match(booking,/rulesAnchor\.parentNode\.insertBefore\(rulesCard,rulesAnchor\.nextSibling\)/);
 assert.match(booking,/mobileReservationDialog\.showModal\(\)/);
 assert.match(booking,/id="clubOpenRules"|\$\('clubOpenRules'\)/);
 assert.match(css,/#tab-reservar #clubRegulationsAcceptance\{display:grid/);
});
test('tres modos OCR y código compartido en los tres tipos de pago',()=>{
 const pagos=read('docs/assets/js/pagos.js');
 const proof=read('docs/assets/js/casa-club-publico-comprobante.js');
 const worker=read('backend/src/services/comprobante-ocr.worker.js');
 const controller=read('backend/src/controllers/pagos.controller.js');
 for(const code of [pagos,proof]){
  assert.match(code,/SPARSE_TEXT/);
  assert.match(code,/SINGLE_BLOCK/);
  assert.match(code,/createWorker\('eng'/);
 }
 assert.match(worker,/cuentaOficial\.obtener\(\)/);
 assert.match(controller,/\['MANTENIMIENTO', 'EXTRAORDINARIO', 'CASA_CLUB'\]/);
 assert.match(controller,/comprobarDestino\(/);
});
test('la carga privada conserva asociación obligatoria a reserva y control Titan',()=>{
 const proof=read('docs/assets/js/casa-club-publico-comprobante.js');
 const backendController=read('backend/src/controllers/casa-club-publico-comprobante.controller.js');
 assert.match(proof,/async function enviarComprobante\(\)/);
 assert.match(proof,/if\(enProceso\|\|!validadoOcr\|\|!acceso\)/);
 assert.match(proof,/async function refresh\(\)/);
 assert.match(backendController,/req\.reservaPublica=reserva/);
 assert.match(backendController,/reservaCasaClubId:reserva\.id/);
});
