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
   PAGOS_BANK_FORWARD_FROM_ADDRESS:'avisos@banco.example',
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


test('Titan admite etiqueta alternativa y rastreo en la línea siguiente sin inventar IDs',()=>{
 const parseo=require('../src/services/banco-correo.service');
 const message={
  id:'titan:formatted',subject:'Notificación Banco Azteca',
  receivedDateTime:new Date().toISOString(),
  from:{emailAddress:{address:'admin@ejemplo.test'}},
  body:{content:'Recibiste de otro banco $350 16/Nov/2026, 19:26:00 A tu cuenta ****4409\n'+
   'Número de referencia\n00910260\nClave de rastreo\nMBAN01002610260078204229'}
 };
 const aviso=parseo.datosAviso(message,{PAGOS_BANK_FORWARD_FROM_ADDRESS:'admin@ejemplo.test',
  PAGOS_BANK_MAIL_SUBJECT:'Notificación Banco Azteca',PAGOS_BANK_MAIL_MAX_DIAS:7});
 assert.equal(aviso.referencia,'00910260');
 assert.equal(aviso.tracking,'MBAN01002610260078204229');
 assert.equal(aviso.monto,350);
 assert.equal(aviso.cuenta,'4409');
 assert.equal(parseo.rastreoEtiquetado('CUENTA DESTINO 123456789012345678'),'');
 assert.equal(parseo.rastreoEtiquetado('CLAVE DE RASTREO 123456789012\nCLAVE DE RASTREO 111111111111'),'');
});


test('comparación flexible usa vivienda explícita con importe, fecha y cuenta exactos',()=>{
 const correo=require('../src/services/banco-correo.service');
 const pago={casa:{calle:'Jardines',numero:'319'},
  monto:350,fechaOperacion:'2026-11-16',horaOperacion:'19:26:00',
  folioOperacion:'SINREF-PRUEBA319',textoOcr:''};
 const aviso={id:'titan-j319',autorizado:true,reciente:true,concepto:'Jardines 319',
  monto:350,fecha:'2026-11-16',cuenta:'4409',tracking:'',referencia:'',folio:''};
 const config={PAGOS_DESTINO_ULTIMOS4:'4409'};
 assert.equal(correo.corresponde(pago,aviso,config),true);
 for(const otro of [
  {...aviso,concepto:'Jardines 318'},
  {...aviso,monto:300},{...aviso,fecha:'2026-11-15'},
  {...aviso,cuenta:'8844'},{...aviso,autorizado:false},
  {...aviso,concepto:''}
 ])assert.equal(correo.corresponde(pago,otro,config),false);
 // Si hay una referencia rotulada de igual tipo pero contradictoria,
 // la similitud del concepto no permite atribuirse otro movimiento.
 const conReferencia={...pago,identificadoresVerificados:{
  version:2,origen:'OCR_SERVIDOR',tipo:'referencia',referencia:'112233',claveRastreo:'',folio:''}};
 assert.equal(correo.corresponde(conReferencia,{...aviso,referencia:'445566'},config),false);
});


test('CEP numérico OCR 190057077496 coincide con rastreo Titan CPO190057077496',()=>{
 const p={folioOperacion:'190057077496',textoOcr:'Comprobante bancario\\n190057077496',
  identificadoresVerificados:{version:2,origen:'OCR_SERVIDOR',tipo:'candidato',
   claveRastreo:'',referencia:'',folio:'',candidatos:['190057077496']}};
 assert.equal(ids.coinciden(p,{tracking:'CPO190057077496',referencia:'7077496'}),true);
 assert.equal(ids.coinciden(p,{tracking:'CPO190057077497',referencia:'7077496'}),false);
 assert.equal(ids.coinciden(p,{tracking:'OTRO190057077496',referencia:'7077496'}),false);
 assert.equal(ids.coinciden({...p,textoOcr:'',identificadoresVerificados:null},
  {tracking:'CPO190057077496',referencia:'7077496'}),false);
});
