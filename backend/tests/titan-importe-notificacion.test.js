'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const bank=require('../src/services/banco-correo.service');
const diagnostic=require('../src/services/banco-diagnostico.service');
const cfg={PAGOS_BANK_FORWARD_FROM_ADDRESS:'notificaciones@bazdigital.com',PAGOS_BANK_MAIL_SUBJECT:'Notificación Banco Azteca',PAGOS_BANK_MAIL_MAX_DIAS:'7',PAGOS_DESTINO_ULTIMOS4:'4409'};
const pago=()=>({id:30,folioOperacion:'0910260',identificadoresVerificados:{version:1,origen:'OCR_SERVIDOR',tipo:'referencia',referencia:'910260'},
 fechaOperacion:'2026-10-23',horaOperacion:'18:41:00',monto:10,casa:{calle:'Prueba',numero:'TEST-001'}});
function mail(contenido){
 return {
  id:'test-bank-message',
  from:{emailAddress:{address:'notificaciones@bazdigital.com'}},
  subject:'Notificación Banco Azteca',
  receivedDateTime:new Date().toISOString(),
  internetMessageHeaders:[{name:'Authentication-Results',value:'mx.auth.titan; dkim=pass header.d=bazdigital.com; dmarc=pass header.from=bazdigital.com;'}],
  body:{content:'<html><style>p{color:red}</style>'+
   '<div>'+contenido+'</div><div>A tu cuenta ***409</div>'+
   '<div>Concepto</div><div>casa TEST-001</div>'+
   '<div>Referencia</div><div>910260</div>'+
   '<div>Clave de rastreo</div><div>MBAN01002610260078204229</div></html>'}
 };
}
test('Banco Azteca: $10 recibido con fecha posterior SPEI y cuenta 4409',()=>{
 const a=bank.datosAviso(mail('Recibiste de otro banco $10 26/Oct/2026, 18:42:09'),cfg);
 assert.equal(a.monto,10);
 assert.equal(a.cuenta,'409');
 assert.equal(a.referencia,'910260');
 assert.equal(a.autorizado,true);
 assert.equal(bank.corresponde(pago(),a,cfg),true);
});
test('Titan codifica signo pesos en entidad HTML; importe bancario sigue $10',()=>{
 for(const currency of ['&#36;10.00','&#x24;10.00','&dollar;10.00']){
  const a=bank.datosAviso(mail('Recibiste de otro banco '+currency+' 26/Oct/2026, 18:42:09'),cfg);
  assert.equal(a.monto,10,currency);
  assert.equal(bank.corresponde(pago(),a,cfg),true,currency);
 }
});
test('Monto explícitamente etiquetado en correo, comisión no forma parte de depósito',()=>{
 const a=bank.datosAviso(mail('MONTO RECIBIDO: $10.00<br>Comisión (incluye IVA): $0.00'),cfg);
 assert.equal(a.monto,10);
});
test('Formatos separados y montos equivalentes no generan ambigüedad',()=>{
 const a=bank.datosAviso(mail('Recibiste de otro banco $ 10.00<br>MONTO RECIBIDO: $10'),cfg);
 assert.equal(a.monto,10);
});
test('Montos recibidos incompatibles producen null, jamás validación',()=>{
 const a=bank.datosAviso(mail('Recibiste de otro banco $10.00<br>MONTO RECIBIDO: $15.00'),cfg);
 assert.equal(a.monto,null);
 assert.equal(bank.corresponde(pago(),a,cfg),false);
});
test('Comisión, saldo, CLABE y referencia no se infieren como montos recibidos',()=>{
 const a=bank.datosAviso(mail('Comisión: $0.00<br>Saldo actual: $10.00'),cfg);
 assert.equal(a.monto,null);
 assert.equal(bank.corresponde(pago(),a,cfg),false);
});
test('Diagnóstico distingue monto ausente de monto distinto, ambos quedan en revisión sin match de identificador',()=>{
 const missing=bank.datosAviso(mail('Comisión $0.00'),cfg);
 const amountDifferent=bank.datosAviso(mail('Recibiste de otro banco $15.00 26/Oct/2026'),cfg);
 // El identificador coincide, pero el importe no: sin validación.
 assert.equal(bank.corresponde(pago(),missing,cfg),false);
 assert.equal(bank.corresponde(pago(),amountDifferent,cfg),false);
 assert.equal(bank.chequeosAviso(pago(),missing,cfg).importe,false);
 assert.equal(bank.chequeosAviso(pago(),amountDifferent,cfg).importe,false);
});
