'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {Cuota,Casa}=require('../src/models');
const helper=require('../src/services/pago-prueba-test001.service');
const {calcularAdeudoVivienda}=require('../src/services/adeudo-vivienda-analisis.service');
const {incrementar}=require('../src/services/pago-acceso-calculo');
const pending=()=>({id:800,anio:2026,mes:'OCTUBRE',
  estatusPago:'PENDIENTE',montoCuota:'10.00',recargo:'0.00',
  montoPagado:'0.00',saldoPendiente:'10.00',origenImportacion:'PRUEBA_10_PESOS'});
const sep={anio:2026,mes:'SEPTIEMBRE',estatusPago:'PAGADO',
  montoCuota:'10.00',recargo:'0.00',montoPagado:'10.00',saldoPendiente:'0.00'};
const pago={id:99,casaId:123,monto:'10.00',recargo:'0.00',tipoPago:'MANTENIMIENTO',
  estatus:'VALIDADO',folioReporte:'MJ-2026-NUEVO',fechaOperacion:'2026-10-23',
  concepto:'PRUEBA CONTROLADA: Abono de mantenimiento de $10.00, octubre 2026. Requiere validación bancaria.'};
test('La cuota sintética TEST-001 con tarifa $10 tiene $10 pendientes, sin recargo tardío',()=>{
 const q=pending();
 const d=calcularAdeudoVivienda([sep,q],{anio:2026,mes:10,hoy:'2026-10-23',tarifa:10});
 assert.equal(d.saldoPendiente,10);
 assert.equal(d.recargosPendientes,0);
 assert.equal(d.ultimoMesPagado?.mes,'SEPTIEMBRE');
});
test('El resto de las viviendas de cuota $10 sin marcador conserva recargo habitual',()=>{
 const d=calcularAdeudoVivienda([sep,{...pending(),origenImportacion:null}],{anio:2026,mes:10,hoy:'2026-10-23',tarifa:10});
 assert.equal(d.saldoPendiente,60);
});
test('Marcador sintético no elimina recargo con tarifa distinta ni mes posterior',()=>{
 const a=calcularAdeudoVivienda([sep,pending()],{anio:2026,mes:10,hoy:'2026-10-23',tarifa:150});
 assert.equal(a.saldoPendiente,200);
 const b=calcularAdeudoVivienda([sep,{...pending(),mes:'NOVIEMBRE'}],{anio:2026,mes:11,hoy:'2026-11-23',tarifa:10});
 assert.ok(b.saldoPendiente>10);
});
test('La tarifa $10 de Prueba TEST-001 admite solo el saldo $10 pendiente',()=>{
 assert.deepEqual(helper.validarCuotaPrueba(pending(),10),{montoPagado:'10.00',tipo:'MENSUALIDAD_10'});
 assert.throws(()=>helper.validarCuotaPrueba(pending(),300),/no coincide/);
 assert.throws(()=>helper.validarCuotaPrueba({...pending(),montoPagado:'5.00'},10),/no coincide/);
 assert.throws(()=>helper.validarCuotaPrueba({...pending(),recargo:'50.00'},10),/no coincide/);
});
test('Depósito previamente validado contabiliza octubre y elimina modal de adeudos',async()=>{
 const originalCasa=Casa.findByPk,originalCuota=Cuota.findOne;
 const cuota={...pending(),async update(change){Object.assign(this,change)}};
 Casa.findByPk=async()=>({id:123,calle:'Prueba',numero:'TEST-001',cuotaPorCobrar:10});
 Cuota.findOne=async()=>cuota;
 try{
  const res=await helper.aplicarSiCorresponde(pago,{LOCK:{UPDATE:'UPDATE'}});
  assert.equal(res.tipo,'MENSUALIDAD_10');
  assert.equal(cuota.estatusPago,'PAGADO');
  assert.equal(Number(cuota.montoPagado),10);
  assert.equal(Number(cuota.saldoPendiente),0);
  const d=calcularAdeudoVivienda([sep,cuota],{anio:2026,mes:10,hoy:'2026-10-23',tarifa:10});
  assert.equal(d.saldoPendiente,0);
  assert.equal(d.ultimoMesPagado?.mes,'OCTUBRE');
 }finally{Casa.findByPk=originalCasa;Cuota.findOne=originalCuota}
});
test('La función de vigencia existente incrementa un TAG de 10-OCT a 10-NOV',()=>{
 assert.equal(incrementar('2026-10-10',1),'2026-11-10');
});
