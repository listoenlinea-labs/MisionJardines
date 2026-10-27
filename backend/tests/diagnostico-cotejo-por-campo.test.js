'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const banco=require('../src/services/banco-correo.service');
const {evaluar}=require('../src/services/banco-diagnostico.service');
const pago={folioOperacion:'0910260',identificadoresVerificados:{version:1,origen:'OCR_SERVIDOR',tipo:'referencia',referencia:'910260'},
 fechaOperacion:'2026-10-23',horaOperacion:'18:41:00',monto:10,casa:{calle:'Prueba',numero:'TEST-001'}};
const aviso={id:'mensaje-1',autorizado:true,reciente:true,referencia:'910261',tracking:'',folio:'',monto:10,
 cuenta:'409',fecha:'2026-10-26',concepto:'casa TEST-001'};
const evaluarUnico=a=>evaluar(pago,[a],[a]);
test('comprobante correcto y aviso con referencia distinta: llega a comparar identificadores',()=>{
 const r=evaluarUnico(aviso);
 assert.equal(r.etapa,'SIN_COINCIDENCIA');
 assert.equal(r.cotejoAvisos.filtroBloqueante,'IDENTIFICADOR');
 assert.equal(r.cotejoAvisos.fecha,1);
 assert.equal(r.diagnosticoReferencia.extraidaDelAvisoRelacionado,true);
 assert.match(r.detalle,/mismo valor normalizado/i);
});
test('cuenta diferente: no afirmar que la referencia es la causa',()=>{
 const r=evaluarUnico({...aviso,cuenta:'888'});
 assert.equal(r.etapa,'SIN_COINCIDENCIA');
 assert.equal(r.cotejoAvisos.filtroBloqueante,'DESTINO');
 assert.equal(r.cotejoAvisos.cuenta,0);
 assert.match(r.detalle,/cuenta destino/i);
 assert.doesNotMatch(r.detalle,/mismo valor normalizado/i);
});
test('importe diferente: se bloquea antes de la referencia',()=>{
 const r=evaluarUnico({...aviso,monto:50});
 assert.equal(r.cotejoAvisos.filtroBloqueante,'IMPORTE');
 assert.equal(r.cotejoAvisos.importe,0);
});
test('fecha sin relación: bloqueo de fecha, no de referencia',()=>{
 const r=evaluarUnico({...aviso,fecha:'2026-11-21'});
 assert.equal(r.cotejoAvisos.filtroBloqueante,'FECHA');
 assert.equal(r.cotejoAvisos.fecha,0);
});
test('concepto distinto no bloquea la comparación de identificadores',()=>{
 const r=evaluarUnico({...aviso,concepto:'GARDENIAS 5'});
 assert.equal(r.cotejoAvisos.filtroBloqueante,'IDENTIFICADOR');
 assert.equal(r.etapa,'SIN_COINCIDENCIA');
});
test('si el aviso solo trae clave y no referencia, se indica tipo faltante',()=>{
 const r=evaluarUnico({...aviso,referencia:'',tracking:'MBAN00000123456789'});
 assert.equal(r.etapa,'SIN_COINCIDENCIA');
 assert.equal(r.cotejoAvisos.filtroBloqueante,'IDENTIFICADOR');
 assert.equal(r.diagnosticoReferencia.extraidaDelAvisoRelacionado,false);
 assert.deepEqual(r.tiposAviso,['clave de rastreo']);
});
test('referencia coincidente continúa requiriendo importe, destino y fecha',()=>{
 const a={...aviso,referencia:'910260'};
 assert.equal(banco.corresponde(pago,a,{PAGOS_DESTINO_ULTIMOS4:'4409'}),true);
 assert.equal(evaluarUnico(a).etapa,'COINCIDENCIA_VERIFICADA');
 assert.equal(banco.corresponde(pago,{...a,cuenta:'888'},{PAGOS_DESTINO_ULTIMOS4:'4409'}),false);
});
