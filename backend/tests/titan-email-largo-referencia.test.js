'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseMessage}=require('../src/services/correo-bancario-mail.service');
const {datosAviso,corresponde}=require('../src/services/banco-correo.service');
const ids=require('../src/services/identificadores-bancarios.service');
const diagnostico=require('../src/services/banco-diagnostico.service');

function correoHTML({estilos=80000,referencia='910260'}={}){
 const html='<html><style>'+('a'.repeat(estilos))+'</style>'+
 '<div>Recibiste de otro banco $10 26/Oct/2026, 18:42:09 A tu cuenta ***409</div>'+
 '<div><span>Concepto</span><span>casa TEST-001</span></div>'+
 '<div><span>Referencia</span><span>'+referencia+'</span></div>'+
 '<div><span>Clave de rastreo</span><span>MBAN01002610260078204229</span></div></html>';
 return [
  'From: Banco Azteca <avisos@banco.example>',
  'Subject: Notificación Banco Azteca',
  'Date: '+new Date().toUTCString(),
  'Message-ID: <test-unique-002@banco.example>',
  'Authentication-Results: titan-auth.example; dkim=pass header.d=banco.example; dmarc=pass header.from=banco.example;',
  'Content-Type: text/html; charset=UTF-8', '', html
 ].join('\r\n');
}
function cargarAviso(){
 const old=process.env.PAGOS_IMAP_AUTH_SERVER;
 process.env.PAGOS_IMAP_AUTH_SERVER='titan-auth.example';
 try{
  const msg=parseMessage({uid:27,source:Buffer.from(correoHTML(),'utf8')});
  const notice=datosAviso(msg,{
   PAGOS_BANK_FROM_ADDRESS:'avisos@banco.example',
   PAGOS_BANK_MAIL_SUBJECT:'Notificación Banco Azteca',
   PAGOS_BANK_MAIL_MAX_DIAS:'14'
  });
  return {notice,htmlLength:msg.body.content.length};
 }finally{
  if(old===undefined)delete process.env.PAGOS_IMAP_AUTH_SERVER;
  else process.env.PAGOS_IMAP_AUTH_SERVER=old;
 }
}
const payment=()=>({
 id:28,fechaOperacion:'2026-10-23',horaOperacion:'18:41:00',monto:10,
 casa:{calle:'Prueba',numero:'TEST-001'},folioOperacion:'0910260',
 textoOcr:'Transferencia exitosa\nMonto transferido\n$10.00\nReferencia\n0910260\nFolio de operación\n1769715857\nFecha de operación\n26 oct 2026, 18:41 h.'
});
test('Titan: cuerpo HTML extenso no se trunca antes de referencia y rastreo',()=>{
 const {notice,htmlLength}=cargarAviso();
 assert.ok(htmlLength>80000);
 assert.equal(notice.autorizado,true);
 assert.equal(notice.referencia,'910260');
 assert.equal(notice.tracking,'MBAN01002610260078204229');
 assert.equal(notice.monto,10);
 assert.equal(notice.cuenta,'409');
 assert.equal(notice.concepto,'CASA TEST-001');
});
test('BBVA 0910260 y Titan 910260 concilian sin inventar coincidencias',()=>{
 const {notice}=cargarAviso();
 assert.equal(ids.identificadoresPago(payment()).referencia,'910260');
 assert.equal(corresponde(payment(),notice,{PAGOS_DESTINO_ULTIMOS4:'4409'}),true);
 assert.equal(diagnostico.evaluar(payment(),[notice],[notice]).etapa,'COINCIDENCIA_VERIFICADA');
});
test('No confundir 0921060 con 910260 ni folio con referencia',()=>{
 const {notice}=cargarAviso();
 assert.equal(ids.coinciden({...payment(),textoOcr:'Referencia\n0921060'},notice),false);
 assert.equal(ids.coinciden({...payment(),textoOcr:'Folio de operación\n910260'},notice),false);
});
test('Si no coinciden, explica tipos vistos sin publicar sus valores',()=>{
 const {notice}=cargarAviso();
 const d=diagnostico.evaluar({...payment(),textoOcr:'Referencia\n0921060'},[notice],[notice]);
 assert.equal(d.etapa,'SIN_COINCIDENCIA');
 assert.match(d.detalle,/ambas fuentes contienen referencia/i);
 assert.deepEqual(d.tiposComprobante,['referencia']);
 assert.ok(d.tiposAviso.includes('referencia'));
 assert.ok(!d.detalle.includes('910260'));
});
