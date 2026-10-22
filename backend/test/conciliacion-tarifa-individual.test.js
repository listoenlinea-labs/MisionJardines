'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {conciliacionesTarifa,historialConTarifaConciliada}=require('../src/services/conciliacion-tarifa-individual.service');
const {prepararDesdeHistorial}=require('../src/services/pago-manual-analisis.service');
const {calcularAdeudoVivienda}=require('../src/services/adeudo-vivienda-analisis.service');
const septiembre={id:252,casaId:698,anio:2026,mes:'SEPTIEMBRE',
 estatusPago:'PAGO_PARCIAL',montoCuota:300,montoPagado:150,saldoPendiente:150,
 recargo:0,fechaPago:'2026-09-08T18:00:00Z',referencia:'MJ-2026-0252'};
const caso=(partial=septiembre,tarifa=150)=>
 conciliacionesTarifa([partial],tarifa,{anioHasta:2026,mesHasta:10});
test('Atotonilco 752: $150 pagados el 8/Sep cubren septiembre bajo su tarifa de $150',()=>{
 const candidatos=caso();
 assert.equal(candidatos.length,1);
 assert.deepEqual(candidatos[0],{id:252,anio:2026,mes:'SEPTIEMBRE',
  montoPagado:150,fechaPago:'2026-09-08'});
 const before=structuredClone(septiembre);
 const normalizadas=historialConTarifaConciliada([septiembre],candidatos);
 assert.equal(normalizadas[0].estatusPago,'PAGADO');
 assert.equal(septiembre.estatusPago,'PAGO_PARCIAL','no edita cuotas en una cotización');
 assert.deepEqual(septiembre,before);
 const plan=prepararDesdeHistorial({cuotas:normalizadas,anio:2026,mes:10,tarifa:150});
 assert.deepEqual(plan.periodos.map(p=>p.mes),['OCTUBRE']);
 assert.equal(plan.meses,1);
 assert.equal(plan.montoSugerido,150);
 assert.equal(plan.montoMinimo,150);
 assert.equal(plan.fechaFinObjetivo,'2026-11-10');
 const saldo=calcularAdeudoVivienda(normalizadas,{anio:2026,mes:9,hoy:'2026-09-09',tarifa:150});
 assert.equal(saldo.saldoPendiente,0);
});
test('La tarifa general no concilia abonos parciales de $150',()=>{
 assert.deepEqual(caso(septiembre,300),[]);
});
test('No concilia abonos insuficientes, tardíos o con recargo positivo',()=>{
 assert.deepEqual(caso({...septiembre,montoPagado:100}),[]);
 assert.deepEqual(caso({...septiembre,fechaPago:'2026-09-11T17:00:00Z'}),[]);
 assert.deepEqual(caso({...septiembre,recargo:50}),[]);
 assert.deepEqual(caso({...septiembre,fechaPago:null}),[]);
 assert.deepEqual(caso({...septiembre,estatusPago:'PAGADO'}),[]);
 assert.deepEqual(caso({...septiembre,tipoPago:'EXTRAORDINARIO'}),[]);
});
test('No concilia meses posteriores al mes que el administrador desea cubrir',()=>{
 assert.deepEqual(conciliacionesTarifa([septiembre],150,{anioHasta:2026,mesHasta:8}),[]);
});
test('La conciliación no duplica pagos existentes ni altera el registro original',()=>{
 const source=structuredClone(septiembre);
 const resultado=historialConTarifaConciliada([septiembre],caso());
 assert.equal(resultado[0].montoPagado,150);
 assert.equal(resultado[0].fechaPago,septiembre.fechaPago);
 assert.equal(resultado[0].referencia,septiembre.referencia);
 assert.deepEqual(septiembre,source);
});
