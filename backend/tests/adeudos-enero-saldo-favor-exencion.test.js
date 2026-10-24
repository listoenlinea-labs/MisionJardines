'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {calcularAdeudoVivienda}=require('../src/services/adeudo-vivienda-analisis.service');
const {contextoCuotas,planificar}=require('../src/services/cuotas-mantenimiento-calculo');
const {establecer,exentoEn}=require('../src/services/recargos-exenciones.service');
const fecha='2026-10-24';
const pago=(mes,monto=300)=>({id:mes,anio:2026,mes,montoPagado:monto,montoCuota:300,recargo:0,estatusPago:'PAGADO'});
test('sin pagos: comienza en enero de 2026 y suma recargos vencidos',()=>{
 const a=calcularAdeudoVivienda([],{anio:2026,mes:10,hoy:fecha,tarifa:300});
 const p=contextoCuotas([],fecha,300);
 assert.equal(a.saldoPendiente,p.adeudoTotal);
 assert.equal(a.saldoPendiente,3500);
});
test('último periodo completo: comienza en el mes siguiente',()=>{
 const cuotas=[pago('SEPTIEMBRE')];
 const a=calcularAdeudoVivienda(cuotas,{anio:2026,mes:10,hoy:fecha,tarifa:300});
 assert.equal(a.saldoPendiente,350);
});
test('exención actual elimina el recargo, no la tarifa',()=>{
 const exenciones=establecer([],true,fecha);
 assert.ok(exentoEn(exenciones,'2026-10'));
 const a=calcularAdeudoVivienda([pago('SEPTIEMBRE')],{anio:2026,mes:10,hoy:fecha,tarifa:300,exencionesRecargo:exenciones});
 assert.equal(a.saldoPendiente,300);
});
test('500 pesos con octubre pendiente y septiembre pagado abona 200 a noviembre',()=>{
 const cuotas=[pago('SEPTIEMBRE')];
 const p=planificar(cuotas,'2026-10-09',500,300);
 const octubre=p.aplicaciones.find(x=>x.mes==='OCTUBRE');
 const noviembre=p.aplicaciones.find(x=>x.mes==='NOVIEMBRE');
 assert.equal(octubre.abono,30000);
 assert.equal(noviembre.abono,20000);
 assert.equal(p.meses,1);
});
