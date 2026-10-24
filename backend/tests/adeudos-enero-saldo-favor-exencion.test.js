'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {calcularAdeudoVivienda}=require('../src/services/adeudo-vivienda-analisis.service');
const {contextoCuotas,planificar}=require('../src/services/cuotas-mantenimiento-calculo');
const {prepararDesdeHistorial}=require('../src/services/pago-manual-analisis.service');
const {establecer,exentoEn}=require('../src/services/recargos-exenciones.service');
const octubre='2026-10-24';
const pago=(mes,monto=300,anio=2026)=>({id:mes,anio,mes,montoPagado:monto,montoCuota:300,recargo:0,estatusPago:'PAGADO'});
const parcial=(mes,monto)=>({id:mes,anio:2026,mes,montoPagado:monto,montoCuota:300,recargo:0,recargoPagado:0,estatusPago:'PAGO_PARCIAL'});
function comparar(cuotas,hoy,esperado,exencionesRecargo=[]){
 const opciones={anio:Number(hoy.slice(0,4)),mes:Number(hoy.slice(5,7)),hoy,tarifa:300,exencionesRecargo,incluirDetalles:true};
 const a=calcularAdeudoVivienda(cuotas,opciones);
 const p=contextoCuotas(cuotas,hoy,300,exencionesRecargo);
 assert.equal(a.saldoPendiente,esperado,'Análisis de cuotas');
 assert.equal(p.adeudoTotal,esperado,'Pagos residente');
 assert.equal(a.detalles.reduce((s,d)=>s+d.monto,0),esperado,'Detalle / modal de deudas');
 return a;
}
test('Sin ningún pago desde enero, octubre suma 10 mensualidades y 10 recargos',()=>{
 comparar([],octubre,3500);
 const manual=prepararDesdeHistorial({cuotas:[],anio:2026,mes:10,tarifa:300,hoy:octubre});
 assert.equal(manual.meses,10);
 assert.equal(manual.desde.mes,1);
 assert.equal(manual.montoSugerido,3500);
 assert.equal(manual.recargo,500);
});
test('Después del último mes pagado solo se cobra el intervalo descubierto',()=>{
 comparar([pago('SEPTIEMBRE')],octubre,350);
 comparar([pago('MARZO')],octubre,2450);
 const manual=prepararDesdeHistorial({cuotas:[pago('SEPTIEMBRE')],anio:2026,mes:10,tarifa:300,hoy:octubre});
 assert.equal(manual.montoSugerido,350);
});
test('Antes del día 11 no hay recargo de octubre, después sí',()=>{
 comparar([pago('SEPTIEMBRE')],'2026-10-10',300);
 comparar([pago('SEPTIEMBRE')],'2026-10-11',350);
});
test('Exención de octubre: no cobra $50, sin afectar septiembre',()=>{
 const exenciones=establecer([],true,octubre);
 assert.equal(exentoEn(exenciones,'2026-10'),true);
 comparar([pago('SEPTIEMBRE')],octubre,300,exenciones);
 const sinPago=calcularAdeudoVivienda([],{anio:2026,mes:10,hoy:octubre,tarifa:300,exencionesRecargo:exenciones,incluirDetalles:true});
 assert.equal(sinPago.saldoPendiente,3450);
 const manual=prepararDesdeHistorial({cuotas:[pago('SEPTIEMBRE')],anio:2026,mes:10,tarifa:300,exencionesRecargo:exenciones,hoy:octubre});
 assert.equal(manual.montoSugerido,300);
});
test('Reactivar recargo no vuelve a cobrar meses previamente exentos',()=>{
 const activas=establecer([],true,'2026-10-24');
 const cerradas=establecer(activas,false,'2026-11-02');
 assert.equal(exentoEn(cerradas,'2026-10'),true);
 assert.equal(exentoEn(cerradas,'2026-11'),false);
 comparar([pago('SEPTIEMBRE')],'2026-11-11',650,cerradas);
});
test('Un depósito de $500 cubre octubre y anticipa $200 de noviembre',()=>{
 const plan=planificar([pago('SEPTIEMBRE')],'2026-10-09',500,300);
 assert.equal(plan.meses,1);
 assert.equal(plan.recargo,0);
 assert.deepEqual(plan.aplicaciones.map(x=>[x.mes,x.abono]),[['OCTUBRE',30000],['NOVIEMBRE',20000]]);
});
test('Los $200 se muestran como crédito en octubre, no en noviembre',()=>{
 const cuotas=[pago('OCTUBRE'),parcial('NOVIEMBRE',200)];
 assert.equal(comparar(cuotas,octubre,0).saldoFavor,200);
 assert.equal(comparar(cuotas,'2026-11-09',100).saldoFavor,0);
 assert.equal(comparar(cuotas,'2026-11-11',150).saldoFavor,0);
});
test('Registrar los $100 restantes completa noviembre y extiende cobertura',()=>{
 const cuotas=[pago('OCTUBRE'),parcial('NOVIEMBRE',200)];
 const plan=planificar(cuotas,'2026-11-09',100,300);
 assert.equal(plan.meses,1);
 assert.equal(plan.fechaFinalObjetivo,'2026-12-10');
 assert.equal(plan.aplicaciones[0].abono,10000);
});
test('Un pago adelantado de noviembre y diciembre no genera recargo',()=>{
 const manual=prepararDesdeHistorial({cuotas:[pago('OCTUBRE')],anio:2026,mes:12,tarifa:300,hoy:octubre});
 assert.equal(manual.total,600);
 assert.equal(manual.recargo,0);
 assert.equal(manual.fechaFinObjetivo,'2027-01-10');
});
test('Si se omite un recargo exigible, el pago manual no puede liquidar',()=>{
 assert.throws(()=>prepararDesdeHistorial({cuotas:[],anio:2026,mes:10,tarifa:300,montoTotal:3000,hoy:octubre}),/exentar el recargo/i);
});
