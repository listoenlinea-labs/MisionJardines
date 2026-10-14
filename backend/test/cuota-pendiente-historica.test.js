'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {clasificarCuotaParaPago}=require('../src/services/cuota-pendiente-historica.service');
const base={estatusPago:'PENDIENTE',montoPagado:'0.00',referencia:null,
 folio:'HIST-OCT26-176',fechaPago:null,fechaConfirmacion:null,
 confirmadoPorUsuarioId:null,reciboPdfUrl:null,tipoPago:'MANTENIMIENTO'};
test('El folio HIST de una cuota PENDIENTE con $0 no es un recibo',()=>{
 const actual=clasificarCuotaParaPago(base);
 assert.equal(actual.registrable,true);assert.equal(actual.folioAnterior,'HIST-OCT26-176');
 assert.equal(actual.requiereRevision,false);
});
test('Septiembre con referencia distinta de HIST y $0 permite conciliación SOLO tras autorización',()=>{
 const result=clasificarCuotaParaPago({...base,folio:null,referencia:'MISION-SEP-2026-13'});
 assert.equal(result.registrable,true);assert.equal(result.requiereRevision,true);
 assert.equal(result.referenciaAnterior,'MISION-SEP-2026-13');
 assert.match(result.advertencia,/NO represente|Verifica que NO represente/);
});
test('El historial puede tener fecha importada: requiere confirmación explícita',()=>{
 const result=clasificarCuotaParaPago({...base,fechaPago:new Date('2026-10-11')});
 assert.equal(result.registrable,true);assert.equal(result.requiereRevision,true);
 assert.match(result.advertencia,/fechas históricas/);
});
test('Se bloquean pagos confirmados, abonos, folios reales y recibos PDF',()=>{
 const invalid=[
  {...base,estatusPago:'PAGADO',montoPagado:300},
  {...base,estatusPago:'PAGO_PARCIAL',montoPagado:50},
  {...base,montoPagado:100},
  {...base,folio:'BANCO-2026'},
  {...base,reciboPdfUrl:'recibos/2026.pdf'},
  {...base,confirmadoPorUsuarioId:14},
  {...base,tipoPago:'EXTRAORDINARIO'},
  {...base,estatusPago:'CANCELADO'},
  {...base,folio:null,fechaPago:new Date('2026-10-11')}
 ];
 for(const q of invalid)assert.equal(clasificarCuotaParaPago(q).registrable,false,JSON.stringify(q));
});
test('El backend comprueba referencias vinculadas antes de cobrar y mantiene auditoría',()=>{
 const src=fs.readFileSync(path.resolve(__dirname,'../src/controllers/pagos-manuales-analisis.controller.js'),'utf8');
 assert.match(src,/async function comprobarReferenciasVinculadas/);
 assert.match(src,/PagoReportado\.findAll\(/);
 assert.match(src,/PagoAcceso\.findAll\(/);
 assert.match(src,/await comprobarReferenciasVinculadas\(casaId,evaluadas,transaction\)/);
 assert.match(src,/revision\.requiereRevision&&!confirmarHistorico/);
 assert.match(src,/referencia histórica previa/);
 assert.match(src,/folio histórico previo/);
 assert.match(src,/registrarLoteManual\(/);
 assert.doesNotMatch(src,/ZkTarjeta\.update\(/);
});
