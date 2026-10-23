'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const parser=require('../src/services/comprobante-parser');
const browserParser=require('../../docs/assets/js/comprobante-parser');
const banco=require('../src/services/banco-correo.service');
const read=p=>fs.readFileSync(path.resolve(__dirname,'../../',p),'utf8');

test('OCR detecta clave de rastreo etiquetada, en cualquier línea y partida en dos',()=>{
 for(const p of [parser,browserParser]){
  assert.equal(p.extract('Folio de operación: 0452579754\nClave de rastreo\nMBAN01002610080082507\n654\nFecha de operación 08 oct 2026').claveRastreo,
   'MBAN01002610080082507654');
  assert.equal(p.extract('Clave de rastreo: 2026101940014BMOVP020442456580').claveRastreo,'2026101940014BMOVP020442456580');
  assert.equal(p.extract('Referencia 1234567\nFolio de operación 0452579754\nCuenta destino ****4409').claveRastreo,'');
  assert.equal(p.extract('Clave de rastreo: 12345678').claveRastreo,'');
 }
});

const config={
 PAGOS_BANK_FROM_ADDRESS:'avisos@azteca.example',
 PAGOS_BANK_MAIL_SUBJECT:'Notificación Banco Azteca',
 PAGOS_DESTINO_ULTIMOS4:'4409',PAGOS_BANK_MAIL_MAX_DIAS:'7'
};
const msg=(changes={})=>({
 id:'IMAP-HOSTINGER-1',receivedDateTime:new Date().toISOString(),
 subject:'Notificación Banco Azteca',from:{emailAddress:{address:'avisos@azteca.example'}},
 internetMessageHeaders:[{name:'Authentication-Results',value:'spf=pass dkim=pass dmarc=pass header.from=azteca.example'}],
 body:{content:'Recibiste de otro banco $300 22/Oct/2026, 12:49:00 A tu cuenta ****4409\nConcepto: Gardenias 5\nClave de rastreo: MBAN01002610080082507654'},
 ...changes
});
const pago={
 folioOperacion:'MBAN01002610080082507654',fechaOperacion:'2026-10-22',monto:300,
 casa:{calle:'Gardenias',numero:'5'}
};
test('notificación válida exige correo autenticado y coincidencia de 5 datos + vivienda',()=>{
 const aviso=banco.datosAviso(msg(),config);
 assert.equal(aviso.autorizado,true);
 assert.equal(aviso.concepto,'GARDENIAS 5');
 assert.equal(banco.corresponde(pago,aviso,config),true);
 assert.equal(banco.corresponde({...pago,casa:{calle:'Gardenias',numero:'6'}},aviso,config),false);
 assert.equal(banco.corresponde({...pago,monto:600},aviso,config),false);
 assert.equal(banco.corresponde({...pago,folioOperacion:'OTRA-CLAVE'},aviso,config),false);
 assert.equal(banco.corresponde({...pago,fechaOperacion:'2026-10-21'},aviso,config),false);
 assert.equal(banco.corresponde(pago,{...aviso,cuenta:'8844'},config),false);
});
test('no basta un remitente visible ni asunto cuando falla DMARC o falta clave',()=>{
 const forged=banco.datosAviso(msg({internetMessageHeaders:[]}),config);
 assert.equal(forged.autorizado,false);
 assert.equal(banco.corresponde(pago,forged,config),false);
 const sinClave=banco.datosAviso(msg({body:{content:'Recibiste de otro banco $300 22/Oct/2026, 12:49:00 A tu cuenta ****4409\nConcepto: Gardenias 5'}}),config);
 assert.equal(banco.corresponde(pago,sinClave,config),false);
 const otraCuenta=banco.datosAviso(msg({body:{content:'Recibiste de otro banco $300 22/Oct/2026 A tu cuenta ****8844\nConcepto: Gardenias 5\nClave de rastreo: MBAN01002610080082507654'}}),config);
 assert.equal(banco.corresponde(pago,otraCuenta,config),false);
 const ajeno=banco.datosAviso(msg({from:{emailAddress:{address:'phishing@example.com'}}}),config);
 assert.equal(ajeno.autorizado,false);
});
test('lector del buzón de correo: mensaje plano y mensaje codificado en base64 sin adjuntos',()=>{
 const {parseMessage,decodeHeader}=require('../src/services/correo-bancario-mail.service');
 assert.equal(decodeHeader('=?UTF-8?Q?Notificaci=C3=B3n_Banco_Azteca?='),'Notificación Banco Azteca');
 const headers=[
  'From: Banco Azteca <avisos@azteca.example>',
  'Subject: Notificación Banco Azteca',
  'Date: Thu, 22 Oct 2026 12:49:00 -0600',
  'Message-ID: <bank-abc@example>',
  'Authentication-Results: mx.hostinger.com; dkim=pass header.i=@azteca.example; dmarc=pass header.from=azteca.example'
 ].join('\r\n');
 const text='Recibiste de otro banco $300 22/Oct/2026 A tu cuenta ****4409\nConcepto: Gardenias 5\nClave de rastreo: MBAN01002610080082507654';
 const plain=parseMessage({uid:51,source:Buffer.from(headers+'\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n'+text)});
 assert.equal(plain.from.emailAddress.address,'avisos@azteca.example');
 assert.match(plain.body.content,/MBAN01002610080082507654/);
 assert.equal(banco.corresponde(pago,banco.datosAviso(plain,config),config),true);
 const encoded=parseMessage({uid:52,source:Buffer.from(headers+
  '\r\nContent-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: base64\r\n\r\n'+
  Buffer.from(text).toString('base64'))});
 assert.equal(banco.corresponde(pago,banco.datosAviso(encoded,config),config),true);
 const forged=parseMessage({uid:53,source:Buffer.from(headers.replace('mx.hostinger.com; dkim=pass header.i=@azteca.example; dmarc=pass','mx.hostinger.com; dkim=fail header.i=@azteca.example; dmarc=fail')+'\r\n\r\n'+text)});
 assert.equal(banco.corresponde(pago,banco.datosAviso(forged,config),config),false);
});

test('conexión IMAP genérica requiere variables de Hostinger y autorización explícita',()=>{
 const desactivada={
  PAGOS_IMAP_HOST:'imap.hostinger.com',PAGOS_IMAP_PORT:'993',
  PAGOS_IMAP_MAILBOX:'soluciones@listoenlinea.com',PAGOS_IMAP_PASSWORD:'EJEMPLO-NO-REAL',
  PAGOS_BANK_FROM_ADDRESS:'avisos@azteca.example',PAGOS_DESTINO_ULTIMOS4:'4409',
  PAGOS_BANK_AUTO_VALIDATE:'false'
 };
 assert.equal(banco.configurado(desactivada),false);
 assert.equal(banco.configurado({...desactivada,PAGOS_BANK_AUTO_VALIDATE:'true'}),true);
 assert.equal(banco.configurado({...desactivada,PAGOS_IMAP_PASSWORD:'',PAGOS_BANK_AUTO_VALIDATE:'true'}),false);
 const {parseMessage}=require('../src/services/correo-bancario-mail.service');
 const msg=Buffer.from([
  'From: Banco Azteca <avisos@azteca.example>',
  'Subject: Notificación Banco Azteca',
  'Date: Thu, 22 Oct 2026 12:49:00 -0600',
  'Message-ID: <bank-hostinger@example>',
  'Authentication-Results: mx.hostinger.com; dkim=pass header.i=@azteca.example; dmarc=pass header.from=azteca.example',
  'Content-Type: text/plain; charset=utf-8','','Recibiste de otro banco $300 22/Oct/2026 A tu cuenta ****4409',
  'Concepto: Gardenias 5','Clave de rastreo: MBAN01002610080082507654'
 ].join('\r\n'));
 const parsed=parseMessage({uid:51,source:msg});
 assert.equal(parsed.internetMessageHeaders.length,1);
 assert.equal(banco.corresponde(pago,banco.datosAviso(parsed,config),config),true);
 const fake=Buffer.from(msg.toString('utf8').replace('mx.hostinger.com;','falso.example;'));
 assert.equal(banco.datosAviso(parseMessage({uid:52,source:fake}),config).autorizado,false);
});

test('UI mantiene pago en revisión y no abre comprobante de validado antes de tiempo',()=>{
 const client=read('docs/assets/js/pagos.js');
 const html=read('docs/pagos.html');
 assert.match(client,/PENDIENTE_VALIDACION:'En revisión'/);
 assert.match(client,/extracted\.claveRastreo \|\| extracted\.folio/);
 assert.match(client,/p\.estatus==='PENDIENTE_VALIDACION'/);
 assert.match(client,/loadReceipts\(\)/);
 assert.match(html,/comprobante-parser\.js\?v=20261022-clave-rastreo/);
});
test('lógica de recargos/TAGs queda en aprobación transaccional; no se procesa a partir del OCR',()=>{
 const ctl=read('backend/src/controllers/pagos.controller.js');
 const worker=read('backend/src/services/banco-correo-worker.service.js');
 const schema=read('backend/src/services/pagos-schema.service.js');
 assert.match(ctl,/async function resolverRevisionPago/);
 assert.match(ctl,/async function confirmarPagoDesdeBanco/);
 assert.match(ctl,/vigenciaService\.actualizar\(pago\.casaId, usuarioId, transaction/);
 assert.match(ctl,/recargosService\.confirmar\(pago, transaction\)/);
 assert.match(ctl,/correoBancarioHash: correoHash/);
 assert.match(worker,/compatibles\.length!==1/);
 assert.match(worker,/PENDIENTE_VALIDACION/);
 assert.match(schema,/uq_pago_correo_bancario_hash/);
});
