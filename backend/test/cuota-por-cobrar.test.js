'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {tarifaParaCasa}=require('../src/services/tarifa-mantenimiento.service');
const {cotizar}=require('../src/services/mensualidades-mantenimiento');
const {prepararPlan}=require('../src/services/pago-manual-analisis.service');
const {calcularAdeudoVivienda}=require('../src/services/adeudo-vivienda-analisis.service');

test('por defecto $300; Atotonilco 752 configurado $150 por casa_id',()=>{
 assert.equal(tarifaParaCasa({calle:'Av. Atotonilco',numero:'752',cuotaPorCobrar:'150.00'}),150);
 assert.equal(tarifaParaCasa({calle:'Jardines',numero:'752',cuotaPorCobrar:300}),300);
 assert.equal(tarifaParaCasa({id:752,calle:'Jardines',numero:'8'}),300);
 assert.equal(tarifaParaCasa({cuotaPorCobrar:250}),250);
 assert.throws(()=>tarifaParaCasa({cuotaPorCobrar:0}),/inválida/);
});
test('cotización bancaria mensual permite tarifa individual y abonos',()=>{
 const opts={hoy:'2026-10-20',fechaFinal:'2026-10-10',cortesPagados:['2026-10-10']};
 assert.equal(cotizar('2026-10-20',150,{...opts,tarifa:150}).meses,1);
 assert.equal(cotizar('2026-10-20',150,opts).meses,0);
 const parcial=cotizar('2026-10-20',75,{...opts,tarifa:150});
 assert.equal(parcial.faltante,75);
 assert.equal(cotizar('2026-10-20',75,{...opts,tarifa:150,saldoParcial:75}).meses,1);
});
test('pago manual respeta $150 + hasta $50 de recargo por mes',()=>{
 const plan=prepararPlan({anio:2026,mes:9,meses:2,tarifa:150,montoTotal:350});
 assert.equal(plan.tarifaMensual,150);
 assert.equal(plan.montoMinimo,300);
 assert.equal(plan.montoMaximo,400);
 assert.equal(plan.recargo,50);
 assert.deepEqual(plan.periodos.map(p=>p.montoCuota),[200,150]);
 assert.throws(()=>prepararPlan({anio:2026,mes:9,meses:2,tarifa:150,montoTotal:600}),/entre/);
 assert.equal(prepararPlan({anio:2026,mes:9,meses:2,montoTotal:600}).total,600);
});
test('saldo usa la tarifa configurable sin borrar pagos ni recargos históricos',()=>{
 const cuotas=[
  {anio:2026,mes:'SEPTIEMBRE',estatusPago:'PENDIENTE',montoCuota:350,saldoPendiente:350,recargo:50,montoPagado:0},
  {anio:2026,mes:'OCTUBRE',estatusPago:'PAGO_PARCIAL',montoCuota:300,saldoPendiente:200,recargo:0,montoPagado:100}
 ];
 const args={anio:2026,mes:10,hoy:'2026-10-14'};
 assert.equal(calcularAdeudoVivienda(cuotas,{...args,tarifa:150}).saldoPendiente,300);
 assert.equal(calcularAdeudoVivienda(cuotas,args).saldoPendiente,600);
 assert.equal(calcularAdeudoVivienda(cuotas,{...args,tarifa:250}).saldoPendiente,500);
});
