'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {clasificarCuotaParaPago}=require('../src/services/cuota-pendiente-historica.service');

const historica={estatusPago:'PENDIENTE',montoPagado:'0.00',
  referencia:'HIST-OCT26-125',folio:null,fechaPago:null,fechaConfirmacion:null,
  confirmadoPorUsuarioId:null,reciboPdfUrl:null,tipoPago:'MANTENIMIENTO'};

test('Cuota histórica sin pago en octubre se puede registrar',()=>{
 const estado=clasificarCuotaParaPago(historica);
 assert.equal(estado.registrable,true);
 assert.equal(estado.referenciaAnterior,'HIST-OCT26-125');
 assert.equal(clasificarCuotaParaPago({...historica,referencia:null}).registrable,true);
 assert.equal(clasificarCuotaParaPago(null).registrable,true);
});

test('Nunca confirmar de nuevo pagos reales, parciales o con comprobante',()=>{
 const ejemplos=[
  {...historica,estatusPago:'PAGADO',montoPagado:300},
  {...historica,estatusPago:'PAGO_PARCIAL',montoPagado:50},
  {...historica,montoPagado:300},
  {...historica,referencia:'SPEI-ABC-123'},
  {...historica,folio:'R-2026-500'},
  {...historica,fechaPago:new Date('2026-10-10')},
  {...historica,fechaConfirmacion:new Date('2026-10-10')},
  {...historica,confirmadoPorUsuarioId:1},
  {...historica,reciboPdfUrl:'recibos/1.pdf'},
  {...historica,tipoPago:'EXTRAORDINARIO'},
  {...historica,estatusPago:'CANCELADO'}
 ];
 for(const cuota of ejemplos)assert.equal(clasificarCuotaParaPago(cuota).registrable,false,
  JSON.stringify(cuota));
});

test('Integración: conserva referencia histórica y utiliza outbox C3, no edición SQL directa de TAGs',()=>{
 const controller=fs.readFileSync(path.resolve(__dirname,'../src/controllers/pagos-manuales-analisis.controller.js'),'utf8');
 assert.match(controller,/clasificarCuotaParaPago\(cuota\)/);
 assert.match(controller,/revision\.registrable/);
 assert.match(controller,/referenciaAnterior:revision\.referenciaAnterior/);
 assert.match(controller,/Referencia histórica previa/);
 assert.match(controller,/vigenciaService\.actualizar\(/);
 assert.match(controller,/ZkTarjeta\.findAll/);
 assert.doesNotMatch(controller,/ZkTarjeta\.update/);
});
