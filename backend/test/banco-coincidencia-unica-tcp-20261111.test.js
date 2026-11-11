'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
process.env.DB_HOST ||= '127.0.0.1';
process.env.DB_NAME ||= 'mision_test_ci';
process.env.DB_USER ||= 'ci_test';
process.env.DB_PASSWORD ||= 'ci_only_no_connection';
const banco=require('../src/services/banco-correo.service');
const diag=require('../src/services/banco-diagnostico.service');

const pago=()=>({
 id:35,monto:350,fechaOperacion:'2026-11-11',horaOperacion:'11:19:00',
 folioOperacion:'0911260',textoOcr:'Referencia\n0911260',
 identificadoresVerificados:{version:2,origen:'OCR_SERVIDOR',tipo:'referencia',referencia:'911260'},
 casa:{calle:'Prueba',numero:'TEST-001'}
});
const aviso=(changes={})=>({
 id:'msg-1',autorizado:true,reciente:true,referencia:'911260',
 tracking:'',folio:'',monto:350,fecha:'2026-11-11',cuenta:'4409',
 concepto:'PRUEBA TEST-001',...changes
});

test('Una coincidencia íntegra se confirma aunque otros avisos compartan referencia parcialmente',()=>{
 const completo=aviso();
 const parcial=aviso({id:'msg-2',monto:300});
 const otraCuenta=aviso({id:'msg-3',cuenta:'1234'});
 const list=[completo,parcial,otraCuenta];
 const resultado=diag.evaluar(pago(),list,list);
 assert.equal(resultado.etapa,'COINCIDENCIA_VERIFICADA');
 assert.equal(resultado.coincidencias,1);
 assert.deepEqual(diag.coincidenciasCompletas(pago(),list),[completo]);
 assert.equal(banco.corresponde(pago(),completo),true);
});
test('Dos avisos distintos que cumplen TODAS las verificaciones siguen ambiguos',()=>{
 const a=aviso(),b=aviso({id:'segundo'});
 assert.equal(diag.evaluar(pago(),[a,b],[a,b]).etapa,'COINCIDENCIA_AMBIGUA');
 assert.equal(diag.coincidenciasCompletas(pago(),[a,b]).length,2);
});
test('No se acredita si la coincidencia falla en importe, fecha, cuenta, remitente o reciente',()=>{
 for(const cambio of [
  {monto:351},{fecha:'2026-11-07'},{cuenta:'1111'},{autorizado:false},{reciente:false},{id:''}
 ]){
  const a=aviso(cambio);
  const autenticados=a.autorizado&&a.reciente?[a]:[];
  assert.notEqual(diag.evaluar(pago(),[a],autenticados).etapa,'COINCIDENCIA_VERIFICADA');
  assert.equal(diag.coincidenciasCompletas(pago(),autenticados).length,0);
 }
});
test('Worker usa exactamente la misma selección completa, con 15 s mínimo de revisión',()=>{
 const src=fs.readFileSync(path.resolve(__dirname,'../src/services/banco-correo-worker.service.js'),'utf8');
 assert.match(src,/diagnostico\.coincidenciasCompletas\(pago,autenticados\)/);
 assert.match(src,/completos\.length===1\?completos\[0\]:null/);
 assert.match(src,/Math\.max\(15000,Number\(process\.env\.PAGOS_BANK_POLL_MS\)\|\|15000\)/);
 assert.match(src,/if\(ocupado\|\|!banco\.configurado\(\)\)return/);
 assert.match(src,/correoBancarioHash:hash/);
});
test('ZKTeco usa TCP directo por defecto e ignora el bridge antiguo',()=>{
 const {getWriteMode}=require('../src/services/zkteco-direct.service');
 const prevMode=process.env.ZKTECO_WRITE_MODE;
 const prevAllow=process.env.ZKTECO_ALLOW_PULLSDK_FALLBACK;
 try{
  delete process.env.ZKTECO_WRITE_MODE;
  delete process.env.ZKTECO_ALLOW_PULLSDK_FALLBACK;
  assert.equal(getWriteMode(),'DIRECT');
  process.env.ZKTECO_WRITE_MODE='AUTO';
  assert.equal(getWriteMode(),'DIRECT');
  process.env.ZKTECO_ALLOW_PULLSDK_FALLBACK='true';
  assert.equal(getWriteMode(),'AUTO');
  process.env.ZKTECO_WRITE_MODE='DIRECT';
  assert.equal(getWriteMode(),'DIRECT');
 }finally{
  if(prevMode===undefined)delete process.env.ZKTECO_WRITE_MODE;
  else process.env.ZKTECO_WRITE_MODE=prevMode;
  if(prevAllow===undefined)delete process.env.ZKTECO_ALLOW_PULLSDK_FALLBACK;
  else process.env.ZKTECO_ALLOW_PULLSDK_FALLBACK=prevAllow;
 }
 const src=fs.readFileSync(path.resolve(__dirname,'../src/controllers/zkteco.controller.js'),'utf8');
 assert.match(src,/modoEscritura!=='DIRECT'&&isPullSdkBridgeConfigured\(\)/);
});
