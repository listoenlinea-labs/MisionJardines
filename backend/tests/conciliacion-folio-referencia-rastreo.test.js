'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const parser=require('../src/services/comprobante-parser');
const banco=require('../src/services/banco-correo.service');
const ids=require('../src/services/identificadores-bancarios.service');
const {validarCamposExtraidos}=require('../src/services/comprobante-lector.service');
const {verificarPosibilidad}=require('../src/services/verificar-comprobante-identificadores.service');

const textoInicial=[
 'Transferencia exitosa','Monto transferido','$10.00',
 'Destino','MARIA DEL ROCIO BAHENA JUAREZ 4409 Cuenta Azteca',
 'Referencia','0910260','Folio de operación','1769715857',
 'Fecha de operación','26 oct 2026, 18:41 h.'
].join('\n');
const textoDetalle=[
 'Detalle de movimiento','Importe','$ -10.00',
 'Cuenta (CLABE, celular o tarjeta)','000000000000004409',
 'Nombre del emisor','EMISOR PRUEBA','Banco origen','BBVA',
 'Cuenta de retiro','000000000000009669',
 'Nombre del beneficiario','MARIA DEL ROCIO BAHENA','JUAREZ',
 'Referencia numérica','910260','Clave de rastreo',
 'MBAN010026102600','78204229','Folio de operación','0078204229',
 'Fecha de operación','23 octubre 2026',
 'Hora de operación','18:41:55 h.',
 'Hora de aplicación','18:42:04 h.'
].join('\n');
const avisoOriginal={
 id:'imap:prueba',from:{emailAddress:{address:'avisos@banco.example'}},
 subject:'Notificación Banco Azteca',receivedDateTime:new Date().toISOString(),
 internetMessageHeaders:[{name:'Authentication-Results',value:'mail.example; dkim=pass header.d=banco.example; dmarc=pass header.from=banco.example;'}],
 body:{content:'Recibiste de otro banco $10 26/Oct/2026, 18:42:09 A tu cuenta ***409\nConcepto\ncasa TEST-001\nReferencia\n910260\nClave de rastreo\nMBAN01002610260078204229'}
};
const cfg={PAGOS_BANK_FORWARD_FROM_ADDRESS:'avisos@banco.example',PAGOS_BANK_MAIL_SUBJECT:'Notificación Banco Azteca',PAGOS_DESTINO_ULTIMOS4:'4409',PAGOS_BANK_MAIL_MAX_DIAS:'7'};
test('BBVA inicial: referencia 0910260, folio y monto sin clave',()=>{
 const data=parser.extract(textoInicial);
 assert.equal(data.folio,'1769715857');
 assert.equal(data.referencia,'0910260');
 assert.equal(data.amount,'10.00');
 assert.equal(data.date,'2026-10-26');
 assert.equal(data.time,'18:41:00');
 assert.equal(parser.verifyDestination(textoInicial,'MARIA DEL ROCIO BAHENA JUAREZ','4409').ok,true);
});
test('detalle de movimiento BBVA: cargo -10, CLABE receptora, clave partida y hora real',()=>{
 const data=parser.extract(textoDetalle);
 assert.equal(data.amount,'10.00');
 assert.equal(data.referencia,'910260');
 assert.equal(data.claveRastreo,'MBAN01002610260078204229');
 assert.equal(data.time,'18:41:55');
 assert.equal(data.date,'2026-10-23');
 assert.equal(parser.verifyDestination(textoDetalle,'MARIA DEL ROCIO BAHENA JUAREZ','4409').ok,true);
});
test('referencia bancaria ignora solo ceros iniciales, nunca cruza tipos',()=>{
 assert.equal(ids.referencia('0910260'),ids.referencia('910260'));
 assert.equal(ids.referencia('910261')===ids.referencia('0910260'),false);
 assert.equal(ids.coinciden({textoOcr:'Folio de operación\n910260'},{referencia:'910260'}),false);
 assert.equal(ids.coinciden({textoOcr:'Referencia\n0910260'},{referencia:'910260'}),true);
});
test('email autenticado aporta referencia y clave, pero no folio',()=>{
 const aviso=banco.datosAviso(avisoOriginal,cfg);
 assert.equal(aviso.autorizado,true);
 assert.equal(aviso.referencia,'910260');
 assert.equal(aviso.tracking,'MBAN01002610260078204229');
 assert.equal(aviso.folio,'');
 assert.equal(aviso.monto,10);
 const pago={textoOcr:textoInicial,casa:{calle:'Prueba',numero:'TEST-001'},folioOperacion:'0910260',
  fechaOperacion:'2026-10-26',horaOperacion:'18:41:00',monto:10};
 assert.equal(banco.corresponde(pago,aviso,cfg),true);
 assert.equal(banco.corresponde({...pago,textoOcr:'Folio de operación\n1769715857'},aviso,cfg),false);
 assert.equal(banco.corresponde({...pago,casa:{calle:'Gardenias',numero:'TEST-001'}},aviso,cfg),true);
 assert.equal(banco.corresponde(pago,{...aviso,autorizado:false},cfg),false);
 assert.equal(banco.corresponde(pago,{...aviso,monto:100},cfg),false);
 assert.equal(banco.corresponde(pago,{...aviso,cuenta:'999'},cfg),false);
});
test('servidor valida valores OCR por tipo e importe',()=>{
 assert.doesNotThrow(()=>validarCamposExtraidos({
  folioOperacion:'0910260',fechaOperacion:'2026-10-26',horaOperacion:'18:41:00',monto:10
 },parser.extract(textoInicial),true));
 assert.throws(()=>validarCamposExtraidos({
  folioOperacion:'1769715857',fechaOperacion:'2026-10-26',horaOperacion:'18:41:00',monto:10
 },parser.extract(textoInicial),true),/identificador/i);
 assert.throws(()=>validarCamposExtraidos({
  folioOperacion:'0910260',fechaOperacion:'2026-10-26',horaOperacion:'18:41:00',monto:20
 },parser.extract(textoInicial),true),/monto/i);
});
test('si falta identificador devuelve campos necesarios para modal',async()=>{
 await assert.rejects(
  verificarPosibilidad({textoOcr:'Folio de operación\n1769715857',casa:{calle:'Prueba',numero:'TEST-001'},monto:10,fechaOperacion:'2026-10-26',horaOperacion:'18:41:00'}),
  error=>error.status===422&&error.code==='FOLIO_SIN_RESPALDO_BANCARIO'&&error.camposFaltantes.includes('Referencia bancaria')
 );
 await assert.rejects(verificarPosibilidad({textoOcr:'Sin identificador'}),error=>error.status===422&&error.camposFaltantes.includes('Clave de rastreo'));
 assert.deepEqual(await verificarPosibilidad({textoOcr:'Referencia\n0910260'}),{metodo:'CLAVE_O_REFERENCIA'});
});
