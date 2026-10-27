'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {evaluar}=require('../src/services/banco-diagnostico.service');

const pago=()=>({
 id:27,folioOperacion:'0910260',textoOcr:'Referencia\n0910260\nFolio de operación\n1769715857',
 fechaOperacion:'2026-10-26',horaOperacion:'18:41:00',monto:10,
 casa:{calle:'Prueba',numero:'TEST-001'}
});
const aviso=()=>({
 id:'correo-autenticado',autorizado:true,reciente:true,referencia:'910260',
 tracking:'MBAN01002610260078204229',fecha:'2026-10-26',monto:10,
 cuenta:'409',concepto:'CASA TEST-001'
});
test('Referencia 0910260 encuentra 910260 con coincidencia material completa',()=>{
 assert.equal(evaluar(pago(),[aviso()],[aviso()]).etapa,'COINCIDENCIA_VERIFICADA');
});
test('Con un identificador coincidente, monto incompatible genera fallo específico',()=>{
 const a={...aviso(),monto:15};const d=evaluar(pago(),[a],[a]);
 assert.equal(d.etapa,'FALLIDO');assert.match(d.detalle,/importe/i);
});
test('Cuenta destino incompatible vinculada por referencia produce fallo',()=>{
 const a={...aviso(),cuenta:'123'};const d=evaluar(pago(),[a],[a]);
 assert.equal(d.etapa,'FALLIDO');assert.match(d.detalle,/cuenta destinataria/i);
});
test('El concepto no determina la vivienda del reporte',()=>{
 const a={...aviso(),concepto:'GARDENIAS 5'};const d=evaluar(pago(),[a],[a]);
 assert.equal(d.etapa,'COINCIDENCIA_VERIFICADA');assert.doesNotMatch(d.detalle,/vivienda/i);
});
test('Nunca se marca Fallido por falta de correo o falta de autenticación',()=>{
 assert.equal(evaluar(pago(),[],[]).etapa,'BUZON_SIN_AVISOS');
 const a={...aviso(),autorizado:false};
 assert.equal(evaluar(pago(),[a],[]).etapa,'SIN_AUTENTICACION');
});
test('Ningún identificador coincide: se muestra motivo y permanece en revisión',()=>{
 const a={...aviso(),referencia:'910261',tracking:'OTRACLAVE'};
 const d=evaluar(pago(),[a],[a]);
 assert.equal(d.etapa,'SIN_COINCIDENCIA');assert.match(d.detalle,/clave|referencia|folio/i);
});
test('La discrepancia solamente de fecha no prueba fraude ni permite validación',()=>{
 const a={...aviso(),fecha:'2026-11-17'};
 assert.equal(evaluar(pago(),[a],[a]).etapa,'DATOS_INCOMPLETOS');
});
test('Dos avisos con mismo identificador obligan revisión; no se acredita ni rechaza',()=>{
 const a=aviso(),b={...aviso(),id:'segundo-correo'};
 assert.equal(evaluar(pago(),[a,b],[a,b]).etapa,'COINCIDENCIA_AMBIGUA');
});
