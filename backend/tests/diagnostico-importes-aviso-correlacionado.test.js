'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const banco=require('../src/services/banco-correo.service');
const {evaluar}=require('../src/services/banco-diagnostico.service');
const pago=()=>({id:30,monto:10,fechaOperacion:'2026-10-23',horaOperacion:'18:41:00',folioOperacion:'0910260',
 identificadoresVerificados:{version:1,origen:'OCR_SERVIDOR',tipo:'referencia',referencia:'910260'},
 casa:{calle:'Prueba',numero:'TEST-001'}});
const aviso=()=>({id:'test-auth-bank',autorizado:true,reciente:true,referencia:'910260',tracking:'MBAN01002610260078204229',
 monto:10,cuenta:'409',fecha:'2026-10-26',concepto:'casa TEST-001'});
const run=a=>evaluar(pago(),[a],[a]);
test('El depósito de 10 pesos se valida si todos los campos coinciden',()=>{
 const a=aviso();
 assert.equal(banco.corresponde(pago(),a,{PAGOS_DESTINO_ULTIMOS4:'4409'}),true);
 assert.equal(run(a).etapa,'COINCIDENCIA_VERIFICADA');
});
test('Referencia exacta, misma cuenta, vivienda y fecha pero importe bancario distinto',()=>{
 const a={...aviso(),monto:1026};
 assert.equal(banco.corresponde(pago(),a,{PAGOS_DESTINO_ULTIMOS4:'4409'}),false);
 const r=run(a);
 assert.equal(r.cotejoAvisos.filtroBloqueante,'IMPORTE');
 assert.equal(r.etapa,'FALLIDO');
 assert.equal(r.cotejoAvisos.referenciaMismaCuenta,1);
 assert.equal(r.cotejoAvisos.referenciaFechaCompatible,1);
 assert.equal(r.cotejoAvisos.importeLegibleReferencia,1);
 assert.match(r.detalle,/importe interpretado/i);
 assert.doesNotMatch(r.detalle,/1026|910260/);
});
test('Aviso autenticado de otro movimiento (misma cuenta, monto distinto, referencia distinta)',()=>{
 const a={...aviso(),monto:15,referencia:'000001'};
 const r=run(a);
 assert.equal(r.cotejoAvisos.filtroBloqueante,'IMPORTE');
 assert.equal(r.cotejoAvisos.referenciaMismaCuenta,0);
 assert.match(r.detalle,/otro movimiento/i);
});
test('Concepto distinto no bloquea el cotejo; importe incompatible sigue fallando',()=>{
 const a={...aviso(),monto:15,concepto:'Gardenias 5'};
 const r=run(a);
 assert.equal(r.cotejoAvisos.referenciaMismaCuenta,1);
 assert.equal(r.etapa,'FALLIDO');
 assert.doesNotMatch(r.detalle,/15/);
});
test('Sin fecha compatible no afirmar que el correo es el mismo pago',()=>{
 const a={...aviso(),monto:15,fecha:'2026-11-01'};
 const r=run(a);
 assert.equal(r.cotejoAvisos.referenciaFechaCompatible,0);
 assert.equal(r.cotejoAvisos.importeLegibleReferencia,0);
});
test('Sin importe leído se mantiene revisión aunque identificador coincida',()=>{
 const a={...aviso(),monto:null};
 const r=run(a);
 assert.equal(r.cotejoAvisos.filtroBloqueante,'IMPORTE');
 assert.equal(r.cotejoAvisos.importeLegibleReferencia,0);
 assert.match(r.detalle,/extraer.*importe/i);
});

test('El importe separado en párrafos HTML de Banco Azteca debe ser exactamente $10',()=>{
 const cfg={
  PAGOS_BANK_FORWARD_FROM_ADDRESS:'administrador@example.test',
  PAGOS_BANK_MAIL_SUBJECT:'Notificación Banco Azteca',
  PAGOS_DESTINO_ULTIMOS4:'4409',
  PAGOS_BANK_MAIL_MAX_DIAS:'7'
 };
 const html=[
  '<section><p>Recibiste de otro banco</p><p>$10</p>',
  '<p>26/Oct/2026, 18:42:09</p>',
  '<p>A tu cuenta</p><p>***409</p>',
  '<p>Beneficiario</p><p>MARIA DEL ROCIO BAHENA JUAREZ</p>',
  '<p>Concepto</p><p>casa TEST-001</p>',
  '<p>Referencia</p><p>910260</p>',
  '<p>Clave de rastreo</p><p>MBAN01002610260078204229</p></section>'
 ].join('');
 const mensaje={
  id:'simulacion-titan-no-real',
  from:{emailAddress:{address:'administrador@example.test'}},
  subject:'Notificación Banco Azteca',
  receivedDateTime:new Date().toISOString(),
  internetMessageHeaders:[{name:'Authentication-Results',value:
   'servidor-titan-pruebas; dkim=pass header.d=bazdigital.com; dmarc=pass header.from=bazdigital.com;'}],
  body:{content:html}
 };
 const avisoExtraido=banco.datosAviso(mensaje,cfg);
 assert.equal(avisoExtraido.monto,10);
 assert.equal(avisoExtraido.referencia,'910260');
 assert.equal(avisoExtraido.cuenta,'409');
 assert.equal(avisoExtraido.concepto,'CASA TEST-001');
 assert.equal(avisoExtraido.autorizado,true);
 assert.equal(banco.chequeosAviso(pago(),avisoExtraido,cfg).importe,true);
 assert.equal(banco.corresponde(pago(),avisoExtraido,cfg),true);
 assert.equal(banco.corresponde(pago(),{...avisoExtraido,monto:11},cfg),false);
 assert.equal(banco.corresponde(pago(),{...avisoExtraido,monto:null},cfg),false);
});
