'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {clasificarCuotaParaPago}=require('../src/services/cuota-pendiente-historica.service');
const base={estatusPago:'PENDIENTE',montoPagado:'0.00',referencia:null,
 folio:'HIST-OCT26-176',fechaPago:null,fechaConfirmacion:null,
 confirmadoPorUsuarioId:null,reciboPdfUrl:null,tipoPago:'MANTENIMIENTO'};
test('HIST en folio, no referencia, es una cuota pendiente sin pagar',()=>{
 const result=clasificarCuotaParaPago(base);
 assert.equal(result.registrable,true);
 assert.equal(result.folioAnterior,'HIST-OCT26-176');
 assert.equal(result.requiereRevision,false);
});
test('HIST con fecha importada y $0 requiere autorización explícita, no se bloquea sin explicación',()=>{
 const result=clasificarCuotaParaPago({...base,fechaPago:new Date('2026-10-10')});
 assert.equal(result.registrable,true);
 assert.equal(result.requiereRevision,true);
 assert.match(result.advertencia,/fechas heredadas/);
});
test('Referencias históricas de septiembre y octubre se pueden confirmar juntas',()=>{
 assert.equal(clasificarCuotaParaPago({...base,folio:'HIST-SEP26-176'}).registrable,true);
 assert.equal(clasificarCuotaParaPago({...base,folio:null,referencia:'HIST-OCT26-176'}).registrable,true);
});
test('No se sobrescribe ningún abono, folio real, recibo ni pago confirmado',()=>{
 const records=[
  {...base,estatusPago:'PAGADO',montoPagado:300},
  {...base,estatusPago:'PAGO_PARCIAL',montoPagado:50},
  {...base,montoPagado:100},
  {...base,folio:'SPEI-2026'},
  {...base,referencia:'SPEI-2026'},
  {...base,reciboPdfUrl:'recibos/1.pdf'},
  {...base,confirmadoPorUsuarioId:1},
  {...base,tipoPago:'EXTRAORDINARIO'},
  {...base,estatusPago:'CANCELADO'},
  {...base,folio:null,fechaConfirmacion:new Date('2026-10-10')}
 ];
 for(const row of records)assert.equal(clasificarCuotaParaPago(row).registrable,false,JSON.stringify(row));
});
test('Backend audita folio HIST anterior, exige revisión y no edita TAGs directamente',()=>{
 const src=fs.readFileSync(path.resolve(__dirname,'../src/controllers/pagos-manuales-analisis.controller.js'),'utf8');
 assert.match(src,/revision\.folioAnterior/);
 assert.match(src,/folio histórico previo/);
 assert.match(src,/folio:null/);
 assert.match(src,/revision\.requiereRevision&&!confirmarHistorico/);
 assert.match(src,/registrarLoteManual\(/);
 assert.doesNotMatch(src,/ZkTarjeta\.update/);
});
