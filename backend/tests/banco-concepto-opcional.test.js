'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const banco = require('../src/services/banco-correo.service');
const diagnostico = require('../src/services/banco-diagnostico.service');
const cfg = { PAGOS_DESTINO_ULTIMOS4: '4409' };
const pago = () => ({ id: 1, casaId: 10, estatus: 'PENDIENTE_VALIDACION',
 monto: 300, fechaOperacion: '2026-10-26', horaOperacion: '12:00:00',
 textoOcr: 'Referencia 1234567', casa: { calle: 'CALLE FICTICIA', numero: '12' } });
const aviso = () => ({ id: 'mensaje-ficticio', autorizado: true, reciente: true,
 referencia: '1234567', monto: 300, fecha: '2026-10-26', cuenta: '409' });
test('concepto ausente, vacío, genérico o equivocado no bloquea coincidencia bancaria', () => {
 for (const concepto of [undefined, '', 'Pago', 'Transferencia a beneficiario', 'OTRA CALLE 99']) {
  const a = { ...aviso(), concepto };
  assert.equal(banco.corresponde(pago(), a, cfg), true);
  const result = diagnostico.evaluar(pago(), [a], [a]);
  assert.equal(result.etapa, 'COINCIDENCIA_VERIFICADA');
  assert.equal('vivienda' in result.verificaciones, false);
 }
});
test('concepto libre no salta monto, fecha, cuenta, remitente, vigencia ni identificador', () => {
 for (const cambio of [{monto:301}, {fecha:'2026-11-01'}, {cuenta:'999'},
  {autorizado:false}, {reciente:false}, {id:''}, {referencia:'7654321'}]) {
  assert.equal(banco.corresponde(pago(), {...aviso(),concepto:'Pago',...cambio}, cfg), false);
 }
 const a={...aviso(),referencia:'7654321',concepto:'Pago'};
 assert.equal(diagnostico.evaluar(pago(),[a],[a]).etapa,'SIN_COINCIDENCIA');
});
async function workerScenario(avisos, rows) {
 const filename=require.resolve('../src/services/banco-correo-worker.service');
 const originalRequire=createRequire(filename), updates=[], confirmations=[], hashes=new Set();
 const models={ Casa:{}, PagoReportado:{
  findAll: async()=>rows,
  findOne: async({where})=>hashes.has(where.correoBancarioHash)?{id:1}:null,
  update: async(values,options)=>{updates.push({id:options.where.id,...values});}
 }};
 const sandbox={module:{exports:{}},console:{info(){},warn(){},error(e){throw Error(e)}},
  setImmediate,setInterval,process,
  require(name){
   if(name==='../models')return models;
   if(name==='./banco-correo.service')return {...banco,configurado:()=>true,obtenerAvisos:async()=>avisos};
   if(name==='../controllers/pagos.controller')return {confirmarPagoDesdeBanco:async(id,hash)=>{assert.ok(!hashes.has(hash));hashes.add(hash);confirmations.push(id)}};
   return originalRequire(name);
  }};
 vm.runInNewContext(fs.readFileSync(filename,'utf8'),sandbox);
 await sandbox.module.exports.ejecutarRevision();
 return {updates,confirmations};
}
test('worker confirma sin concepto y no permite reutilizar el aviso en otra vivienda', async () => {
 const r=await workerScenario([aviso()],[pago(),{...pago(),id:2,casaId:20,casa:{calle:'OTRA CALLE',numero:'99'}}]);
 assert.deepEqual(r.confirmations,[1]);
 const rejected=r.updates.find(x=>x.id===2&&x.estatus==='RECHAZADO');
 assert.ok(rejected);assert.match(rejected.verificacionBancaria.detalle,/utilizada|reutilizar/);
});
test('worker conserva la revisión cuando dos avisos coinciden, aunque no tengan concepto', async () => {
 const r=await workerScenario([aviso(),{...aviso(),id:'otro-mensaje'}],[pago()]);
 assert.deepEqual(r.confirmations,[]);
 assert.equal(r.updates[0].verificacionBancaria.etapa,'COINCIDENCIA_AMBIGUA');
});
