'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const calc=require('../src/services/cuotas-mantenimiento-calculo');
const {calcularAdeudoVivienda}=require('../src/services/adeudo-vivienda-analisis.service');
const {historialMantenimiento}=require('../src/services/historial-pagos-vivienda.service');
const septiembre={id:1,anio:2026,mes:'SEPTIEMBRE',estatusPago:'PAGADO',montoPagado:300};
function aplicar(cuotas,plan){
 const rows=structuredClone(cuotas);
 for(const a of plan.aplicaciones){
  let row=rows.find(c=>Number(c.anio)===a.anio&&c.mes===a.mes);
  if(!row){row={id:rows.length+1,anio:a.anio,mes:a.mes};rows.push(row);}
  Object.assign(row,{montoCuota:a.total/100,montoPagado:(a.antesPagado+a.abono)/100,
   saldoPendiente:(a.total-a.antesPagado-a.abono)/100,recargo:a.recargo/100,
   recargoPagado:a.recargoPagado/100,estatusPago:a.antesPagado+a.abono===a.total?'PAGADO':'PAGO_PARCIAL'});
 }
 return rows;
}
test('Pagos y Análisis cotizan lo mismo, incluso meses sin renglón y tarifas por vivienda',()=>{
 for(const tarifa of [10,150,300,10000])for(const fecha of ['2026-10-08','2026-10-10','2026-10-11','2026-11-20']){
  for(const cuotas of [[],[septiembre],[{...septiembre,estatusPago:'PAGO_PARCIAL',montoPagado:100,montoCuota:300}]]){
   const ctx=calc.contextoCuotas(cuotas,fecha,tarifa);
   const analisis=calcularAdeudoVivienda(cuotas,{anio:Number(fecha.slice(0,4)),mes:Number(fecha.slice(5,7)),hoy:fecha,tarifa});
   assert.equal(ctx.adeudoTotal,analisis.saldoPendiente);
   assert.equal(ctx.recargo,analisis.recargosPendientes);
  }
 }
});
test('300 + 50 completa octubre sin repetir recargo; las cuotas contienen ambos abonos',()=>{
 const p1=calc.planificar([septiembre],'2026-10-15',300,300);
 assert.equal(p1.recargo,50);assert.equal(p1.meses,0);assert.equal(p1.fechaFinalObjetivo,'2026-10-10');
 const cuotas=aplicar([septiembre],p1);
 assert.equal(calc.contextoCuotas(cuotas,'2026-10-15',300).adeudoTotal,50);
 assert.equal(calc.contextoCuotas(cuotas,'2026-10-15',300).recargo,0);
 const p2=calc.planificar(cuotas,'2026-10-15',50,300);
 assert.equal(p2.recargo,0);assert.equal(p2.meses,1);assert.equal(p2.fechaFinalObjetivo,'2026-11-10');
 const analisis=calcularAdeudoVivienda(aplicar(cuotas,p2),{anio:2026,mes:10,hoy:'2026-10-15'});
 assert.equal(analisis.saldoPendiente,0);assert.equal(analisis.ultimoMesPagado.mes,'OCTUBRE');
});
test('Recargos pagados solos no se cobran otra vez; también se admite pagar parte de ellos',()=>{
 const p=calc.planificar([septiembre],'2026-11-20',100,300);
 assert.equal(p.aplicaciones.length,2);assert.equal(p.meses,0);
 const ctx=calc.contextoCuotas(aplicar([septiembre],p),'2026-11-20',300);
 assert.equal(ctx.recargo,0);assert.equal(ctx.adeudoTotal,600);
 const parcial=calc.planificar([septiembre],'2026-11-20',99.99,300);
 assert.equal(parcial.recargo,99.99);assert.equal(parcial.meses,0);
 const resto=calc.contextoCuotas(aplicar([septiembre],parcial),'2026-11-20',300);
 assert.equal(resto.recargo,0.01);assert.equal(resto.adeudoTotal,600.01);
});
test('Recargos solos pueden completar un renglón heredado con el principal ya cubierto',()=>{
 const rows=[septiembre,{id:2,anio:2026,mes:'OCTUBRE',estatusPago:'PAGO_PARCIAL',montoPagado:300,montoCuota:350,recargo:50}];
 const plan=calc.planificar(rows,'2026-10-20',50,300);
 assert.equal(plan.meses,1);assert.equal(plan.fechaFinalObjetivo,'2026-11-10');
});
test('El último mes pagado fija cobertura y los pagos nuevos continúan desde él, sin buscar huecos',()=>{
 const futuro={id:2,anio:2026,mes:'NOVIEMBRE',estatusPago:'PAGADO',montoPagado:300};
 assert.equal(calc.fechaDesdeCuotas([septiembre,futuro]),'2026-12-10');
 const p=calc.planificar([septiembre,futuro],'2026-10-08',725,300);
 assert.equal(p.meses,2);assert.equal(p.fechaFinalObjetivo,'2027-02-10');
 assert.deepEqual(p.aplicaciones.map(a=>a.mes),['DICIEMBRE','ENERO','FEBRERO']);
 assert.equal(p.saldoDespues,125);
});
test('El límite de 36 meses y los centavos se aplican antes de acreditar',()=>{
 assert.equal(calc.planificar([septiembre],'2026-10-08','0.01',300).aplicaciones[0].abono,1);
 assert.throws(()=>calc.planificar([septiembre],'2026-10-08','0.001',300),/dos decimales/);
 assert.throws(()=>calc.planificar([septiembre],'2026-10-08',11100,300),/36/);
 assert.equal(calc.planificar([septiembre],'2026-10-08',10800,300).meses,36);
});
test('El historial separa depósitos complementarios de una cuota acumulada sin duplicar ingresos',()=>{
 const a=calc.planificar([septiembre],'2026-10-15',300,300);
 const parcial=aplicar([septiembre],a),b=calc.planificar(parcial,'2026-10-15',50,300);
 const rows=historialMantenimiento(aplicar(parcial,b),[
  {id:1,tipoPago:'MANTENIMIENTO',estatus:'VALIDADO',monto:300,recargo:50,folioOperacion:'A',fechaOperacion:'2026-10-15',aplicacionCuotas:{...a,aplicado:true}},
  {id:2,tipoPago:'MANTENIMIENTO',estatus:'VALIDADO',monto:50,recargo:0,folioOperacion:'B',fechaOperacion:'2026-10-16',aplicacionCuotas:{...b,aplicado:true}}
 ]);
 assert.equal(rows.reduce((s,p)=>s+p.monto,0),650); // septiembre previo + ambos depósitos
 assert.deepEqual(rows.filter(p=>p.fuente==='COMPROBANTE_VALIDADO').map(p=>[p.referencia,p.monto,p.meses]),[['B',50,1],['A',300,0]]);
});
test('La cuota reducida de laboratorio conserva la misma excepción visible en Análisis',()=>{
 const rows=[septiembre,{id:2,anio:2026,mes:'OCTUBRE',estatusPago:'PENDIENTE',montoCuota:10,montoPagado:0,recargo:0,origenImportacion:'PRUEBA_10_PESOS'}];
 const plan=calc.planificar(rows,'2026-10-20',10,10);
 assert.equal(plan.recargo,0);assert.equal(plan.meses,1);assert.equal(plan.fechaFinalObjetivo,'2026-11-10');
});

test('Un depósito un año después paga el mes siguiente al último cubierto, no el mes del depósito',()=>{
 const ultimo={id:1,anio:2026,mes:'OCTUBRE',estatusPago:'PAGADO',montoPagado:300,fechaPago:'2026-10-08'};
 const ctx=calc.contextoCuotas([ultimo],'2027-10-24',300);
 assert.equal(ctx.mesesPendientes,12);assert.equal(ctx.recargo,600);assert.equal(ctx.adeudoTotal,4200);
 assert.equal(ctx.fechaUltimoCortePagado,'2026-11-10');assert.equal(ctx.fechaCorteActual,'2027-11-10');
 const plan=calc.planificar([ultimo],'2027-10-24',900,300);
 assert.equal(plan.meses,1);assert.equal(plan.fechaFinalObjetivo,'2026-12-10');
 assert.deepEqual(plan.aplicaciones.filter(p=>p.antesPagado+p.abono===p.total).map(p=>p.periodo),['2026-11']);
 const next=calc.contextoCuotas(aplicar([ultimo],plan),'2027-10-24',300);
 assert.equal(next.mesesPendientes,11);assert.equal(next.recargo,0);assert.equal(next.adeudoTotal,3300);
});
test('Septiembre de 2026 solo es base si no hay cobertura; con historial anterior se usa su corte',()=>{
 assert.equal(calc.contextoCuotas([],'2026-10-08',300).primerPeriodoPendiente,'2026-09');
 const julio={id:1,anio:2026,mes:'JULIO',estatusPago:'PAGADO',montoPagado:300};
 const ctx=calc.contextoCuotas([julio],'2026-10-08',300);
 assert.equal(ctx.primerPeriodoPendiente,'2026-08');assert.equal(ctx.mesesPendientes,3);
 assert.equal(ctx.recargo,100);assert.equal(ctx.adeudoTotal,1000);
});
test('La fecha del depósito y saldos viejos anteriores no sustituyen el último mes cubierto',()=>{
 const rows=[{id:1,anio:2026,mes:'SEPTIEMBRE',estatusPago:'PENDIENTE',saldoPendiente:99999},
  {id:2,anio:2027,mes:'ENERO',estatusPago:'PAGADO',montoPagado:300,fechaPago:'2026-10-15'}];
 assert.equal(calc.contextoCuotas(rows,'2027-02-10',300).adeudoTotal,300);
 assert.equal(calc.contextoCuotas(rows,'2027-02-11',300).adeudoTotal,350);
 assert.equal(calc.fechaDesdeCuotas(rows),'2027-02-10');
});
test('Cada mensualidad completa avanza exactamente un mes, incluidos cruces de año',()=>{
 let cuotas=[{id:1,anio:2026,mes:'DICIEMBRE',estatusPago:'PAGADO',montoPagado:300}];
 for(const [periodo,corte] of [['2027-01','2027-02-10'],['2027-02','2027-03-10'],['2027-03','2027-04-10']]){
  const plan=calc.planificar(cuotas,'2026-10-08',300,300);
  assert.equal(plan.aplicaciones[0].periodo,periodo);assert.equal(plan.meses,1);
  assert.equal(plan.fechaFinalObjetivo,corte);cuotas=aplicar(cuotas,plan);
 }
});
test('No salta una mensualidad con datos incoherentes de saldo cubierto y estatus parcial',()=>{
 const rows=[septiembre,{id:2,anio:2026,mes:'OCTUBRE',estatusPago:'PAGO_PARCIAL',montoPagado:300,recargoPagado:0}];
 assert.throws(()=>calc.planificar(rows,'2026-10-08',300,300),/requiere conciliación antes de avanzar/);
});
test('El cálculo resumido no necesita generar el desglose mensual para obtener el importe',()=>{
 const rows=[{anio:2026,mes:'OCTUBRE',estatusPago:'PAGADO',montoPagado:300}];
 const opciones={anio:2027,mes:10,hoy:'2027-10-24'};
 const resumen=calcularAdeudoVivienda(rows,opciones);
 const detallado=calcularAdeudoVivienda(rows,{...opciones,incluirDetalles:true});
 assert.deepEqual(resumen.detalles,[]);assert.equal(resumen.saldoPendiente,4200);
 assert.equal(detallado.detalles.length,12);
 assert.equal(detallado.detalles.reduce((sum,p)=>sum+p.monto,0),resumen.saldoPendiente);
});
test('Cada peso acreditado reduce exactamente el adeudo, también con complementos y distintos cortes',()=>{
 for(const tarifa of [10,150,300])for(const mes of ['ENERO','SEPTIEMBRE','OCTUBRE'])for(const fecha of ['2026-10-08','2026-10-24']){
  let rows=[{id:1,anio:2026,mes,estatusPago:'PAGADO',montoPagado:tarifa}];
  for(let paso=0;paso<4;paso++){
   const antes=calc.contextoCuotas(rows,fecha,tarifa);
   if(!antes.adeudoTotal)break;
   const monto=Math.min(antes.adeudoTotal,Math.round((antes.recargo+(paso+1)*tarifa/3)*100)/100);
   const plan=calc.planificar(rows,fecha,monto,tarifa);rows=aplicar(rows,plan);
   const despues=calc.contextoCuotas(rows,fecha,tarifa);
   assert.equal(Math.round((antes.adeudoTotal-despues.adeudoTotal)*100),Math.round(monto*100));
  }
 }
});
test('Cualquier abono positivo reduce primero recargos, sin adelantar el corte ni inventar principal',()=>{
 for(const monto of [0.01,1,20,49.99]){
  const plan=calc.planificar([septiembre],'2026-10-20',monto,300);
  assert.equal(plan.recargo,monto);assert.equal(plan.meses,0);assert.equal(plan.fechaFinalObjetivo,'2026-10-10');
  assert.equal(plan.aplicaciones.reduce((s,a)=>s+a.abono,0),Math.round(monto*100));
  assert.equal(plan.aplicaciones.reduce((s,a)=>s+a.abonoRecargo,0),Math.round(monto*100));
  const after=calc.contextoCuotas(aplicar([septiembre],plan),'2026-10-20',300);
  assert.equal(Math.round(after.adeudoTotal*100),35000-Math.round(monto*100));
  assert.equal(Math.round(after.recargo*100),5000-Math.round(monto*100));
  assert.equal(after.minimoReporte,0.01);
 }
});
test('Complementos a varios recargos pagan los más antiguos y luego el mantenimiento más antiguo',()=>{
 let rows=[{...septiembre,mes:'AGOSTO'}];
 for(const [monto,pendiente] of [[20,80],[40,40],[40,0]]){
  const plan=calc.planificar(rows,'2026-10-20',monto,300);rows=aplicar(rows,plan);
  assert.equal(plan.meses,0);assert.equal(calc.contextoCuotas(rows,'2026-10-20',300).recargo,pendiente);
 }
 assert.equal(rows.find(r=>r.mes==='SEPTIEMBRE').recargoPagado,50);
 assert.equal(rows.find(r=>r.mes==='OCTUBRE').recargoPagado,50);
 const maintenance=calc.planificar(rows,'2026-10-20',300,300);rows=aplicar(rows,maintenance);
 assert.equal(maintenance.recargo,0);assert.equal(maintenance.meses,1);
 assert.equal(maintenance.aplicaciones[0].mes,'SEPTIEMBRE');
 assert.equal(maintenance.fechaFinalObjetivo,'2026-10-10');
 const analysis=calcularAdeudoVivienda(rows,{anio:2026,mes:10,hoy:'2026-10-20',tarifa:300});
 assert.equal(analysis.saldoPendiente,300);
});
