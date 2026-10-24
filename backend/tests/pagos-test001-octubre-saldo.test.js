'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {Casa,Cuota}=require('../src/models');
const modulo=require('../src/services/pago-prueba-test001.service');
const {calcularAdeudoVivienda}=require('../src/services/adeudo-vivienda-analisis.service');
const row=(overrides={})=>({
 id:444,casaId:123,anio:2026,mes:'OCTUBRE',montoCuota:'300.00',recargo:'50.00',
 montoPagado:'340.00',saldoPendiente:'10.00',estatusPago:'PAGO_PARCIAL',
 origenImportacion:'PRUEBA_10_PESOS',observaciones:'Ajuste sintético preparado',
 ...overrides
});
const banco=(overrides={})=>({
 id:999,casaId:123,tipoPago:'MANTENIMIENTO',
 estatus:'VALIDADO',folioReporte:'MJ-2026-0031',
 monto:'10.00',recargo:'0.00',
 concepto:'PRUEBA CONTROLADA: Abono de mantenimiento de $10.00, octubre 2026. Requiere validación bancaria.',
 fechaOperacion:'2026-10-23',...overrides
});
test('Octubre sintético reconoce $10 pendientes y después $0 pagado',()=>{
 const sep={anio:2026,mes:'SEPTIEMBRE',estatusPago:'PAGADO',
  montoCuota:300,recargo:0,montoPagado:300,saldoPendiente:0};
 const antes=calcularAdeudoVivienda([sep,row()],{anio:2026,mes:10,hoy:'2026-10-23',tarifa:300});
 assert.equal(antes.saldoPendiente,10);
 const despues=calcularAdeudoVivienda([sep,row({montoPagado:350,saldoPendiente:0,estatusPago:'PAGADO'})],
   {anio:2026,mes:10,hoy:'2026-10-23',tarifa:300});
 assert.equal(despues.saldoPendiente,0);
 assert.equal(despues.ultimoMesPagado?.nombre,'OCTUBRE');
});
test('Solo Prueba TEST-001 puede completar el abono extraordinario sintético',()=>{
 assert.equal(modulo.esViviendaSintetica({calle:'Prueba',numero:'TEST-001'}),true);
 assert.equal(modulo.esViviendaSintetica({calle:'Gardenias',numero:'5'}),false);
 assert.equal(modulo.esDepositoPruebaDiez(banco(),{calle:'Prueba',numero:'TEST-001'}),true);
 assert.equal(modulo.esDepositoPruebaDiez(banco({monto:'11.00'}),{calle:'Prueba',numero:'TEST-001'}),false);
 assert.equal(modulo.esDepositoPruebaDiez(banco({estatus:'PENDIENTE_VALIDACION'}),{calle:'Prueba',numero:'TEST-001'}),false);
});
test('Una cuota distinta no se marca PAGADO ni se mezcla con deudas reales',()=>{
 for(const diferente of [
  {montoPagado:300},{saldoPendiente:20},{recargo:0},
  {montoCuota:10},{estatusPago:'PAGADO'},{origenImportacion:'EXCEL_2026'},
  {mes:'NOVIEMBRE'}
 ])assert.throws(()=>modulo.validarCuotaPrueba(row(diferente)),/no está preparada/);
});
test('Validación actualiza una única cuota y no llama servicios ZKTeco',async()=>{
 const findCasa=Casa.findByPk,findCuota=Cuota.findOne;
 let updates=0,updated=null;
 const cuota={...row(),async update(values){updates++;updated=values;Object.assign(this,values);}};
 Casa.findByPk=async()=>({id:123,calle:'Prueba',numero:'TEST-001'});
 Cuota.findOne=async()=>cuota;
 try{
  const tx={LOCK:{UPDATE:'UPDATE'}};
  const r=await modulo.aplicarSiCorresponde(banco(),tx);
  assert.equal(r.aplicado,true);
  assert.equal(updates,1);
  assert.equal(updated.estatusPago,'PAGADO');
  assert.equal(Number(updated.montoPagado),350);
  assert.equal(Number(updated.saldoPendiente),0);
  assert.match(updated.observaciones,/MJ-2026-0031/);
 }finally{Casa.findByPk=findCasa;Cuota.findOne=findCuota;}
});
test('No aplica la prueba a otros condominios',async()=>{
 const original=Casa.findByPk;const f=Cuota.findOne;
 Casa.findByPk=async()=>({id:90,calle:'Rosas',numero:'1'});
 Cuota.findOne=async()=>{throw Error('No consultar cuotas ajenas');};
 try{const result=await modulo.aplicarSiCorresponde(banco(),{LOCK:{UPDATE:'UPDATE'}});
  assert.equal(result.aplicado,false)}
 finally{Casa.findByPk=original;Cuota.findOne=f}
});
test('Una cuota sintética mal preparada no deja aplicar el depósito de $10',async()=>{
 const saved=Casa.findByPk,found=Cuota.findOne;
 Casa.findByPk=async()=>({id:123,calle:'Prueba',numero:'TEST-001'});
 Cuota.findOne=async()=>row({saldoPendiente:350});
 try{await assert.rejects(
  modulo.aplicarSiCorresponde(banco(),{LOCK:{UPDATE:'UPDATE'}}),
  /no está preparada/
 )}finally{Casa.findByPk=saved;Cuota.findOne=found}
});
