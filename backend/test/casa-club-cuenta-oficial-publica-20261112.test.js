'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const cuenta=require('../src/services/pagos-cuenta-oficial.service');
const leer=p=>fs.readFileSync(path.resolve(__dirname,'../../',p),'utf8');

test('Pagos y Casa Club comparten banco, titular, cuenta, CLABE y tarjeta oficiales',()=>{
 const config=cuenta.obtener({
  PAGOS_BANCO:'BANCO DE PRUEBA',
  PAGOS_TITULAR:'TITULAR DE PRUEBA',
  PAGOS_CUENTA:'00000001234567',
  PAGOS_CLABE:'000000012345678901',
  PAGOS_TARJETA:'0000000000123456',
  PAGOS_DESTINO_ULTIMOS4:'8901'
 });
 assert.equal(config.banco,'BANCO DE PRUEBA');
 assert.equal(config.cuenta,'00000001234567');
 assert.equal(config.clabe,'000000012345678901');
 assert.equal(config.tarjeta,'0000000000123456');
 assert.equal(config.destinoUltimos4,'8901');
 const pago=leer('backend/src/controllers/pagos.controller.js');
 const club=leer('backend/src/services/casa-club-avisos.service.js');
 assert.match(pago,/\.\.\.cuentaOficial\.obtener\(\)/);
 assert.match(club,/cuentaOficial\.obtener\(env\)/);
 assert.doesNotMatch(club,/CASA_CLUB_BANCO|CASA_CLUB_CUENTA|CASA_CLUB_TITULAR/);
});

test('concepto exacto por vivienda del padrón; ninguna dirección se prellena',()=>{
 assert.equal(cuenta.conceptoVivienda({calleCorrecta:'Misión Gardenias',numero:'5'}),'GARDENIAS 5');
 assert.equal(cuenta.conceptoVivienda({calle:'Rosas',numero:'18'}),'ROSAS 18');
 assert.equal(cuenta.conceptoVivienda({calle:'Magnolias',numero:''}),'');
 assert.equal(cuenta.conceptoVivienda(null),'');
 const backend=leer('backend/src/controllers/casa-club.controller.js');
 assert.match(backend,/casaTransferencia=casa/);
 assert.match(backend,/casa:casaTransferencia/);
 assert.match(backend,/conceptoTransferencia/);
});

test('cuenta pública accesible antes de iniciar sesión, sin identidades privadas',()=>{
 const ruta=leer('backend/src/routes/casa-club.routes.js');
 const controller=leer('backend/src/controllers/casa-club-publico-comprobante.controller.js');
 assert.ok(ruta.indexOf("'/publico/cuenta'")<ruta.indexOf('router.use(autenticarToken)'));
 assert.match(ruta,/router\.get\('\/publico\/cuenta',comprobante\.cuenta\)/);
 assert.match(controller,/data:cuentaOficial\.obtener\(\)/);
 assert.match(controller,/conceptoTransferencia:cuentaOficial\.conceptoVivienda\(vivienda\)/);
});

test('formulario público no se autocompleta y conserva LOV de calle y número',()=>{
 const html=leer('docs/casa-club.html');
 const js=leer('docs/assets/js/casa-club.js');
 const proof=leer('docs/assets/js/casa-club-publico-comprobante.js');
 const lov=leer('docs/assets/js/casa-club-domicilios.js');
 for(const id of ['clubTransferHelp','clubProofBankDetails','clubStreetOptions','clubNumberOptions'])
  assert.ok(html.includes('id="'+id+'"'),id);
 assert.match(html,/<form id="clubForm" autocomplete="off">/);
 assert.match(html,/id="clubPhone"[^>]+autocomplete="off"/);
 assert.match(html,/id="clubEmail"[^>]+autocomplete="off"/);
 assert.match(html,/id="clubName"[^>]+autocomplete="off"/);
 assert.match(js,/api\('\/publico\/cuenta'\)/);
 assert.match(js,/conceptoTransferencia:concepto/);
 assert.match(js,/location\.hash\)\?null/);
 assert.match(lov,/input\.dispatchEvent\(new Event\('change'/);
 assert.doesNotMatch(proof,/sessionStorage\.getItem\('mjCasaClubComprobante'\)/);
 assert.doesNotMatch(proof,/sessionStorage\.setItem\('mjCasaClubComprobante'/);
});

test('enlace de comprobante muestra los datos oficiales y la instrucción de concepto',()=>{
 const html=leer('docs/casa-club.html');
 const proof=leer('docs/assets/js/casa-club-publico-comprobante.js');
 const bank=leer('docs/assets/js/casa-club-cuenta-oficial.js');
 const avisos=leer('backend/src/services/casa-club-avisos.service.js');
 assert.match(proof,/MJClubCuenta\?\.render\('clubProofBankDetails'/);
 for(const etiqueta of ['Banco','Titular','Cuenta','CLABE','Tarjeta','Concepto de transferencia'])
  assert.ok(bank.includes("'"+etiqueta+"'"),etiqueta);
 assert.match(bank,/No realices el depósito|Primero elige tu fecha/);
 assert.match(bank,/navigator\.clipboard\.writeText/);
 assert.match(avisos,/CONCEPTO OBLIGATORIO/);
 assert.match(avisos,/Concepto de transferencia/);
 assert.match(html,/casa-club-cuenta-oficial\.js/);
});
