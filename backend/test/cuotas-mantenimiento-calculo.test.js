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
test('Los recargos pagados solos no vuelven a cobrarse y conservan el principal pendiente',()=>{
 const p=calc.planificar([],'2026-10-20',100,300);
 assert.equal(p.aplicaciones.length,2);assert.equal(p.meses,0);
 const ctx=calc.contextoCuotas(aplicar([],p),'2026-10-20',300);
 assert.equal(ctx.recargo,0);assert.equal(ctx.adeudoTotal,600);
 assert.throws(()=>calc.planificar([],'2026-10-20',99.99,300),/recargos pendientes/);
});
test('Recargos solos pueden completar un renglón heredado con el principal ya cubierto',()=>{
 const rows=[septiembre,{id:2,anio:2026,mes:'OCTUBRE',estatusPago:'PAGO_PARCIAL',montoPagado:300,montoCuota:350,recargo:50}];
 const plan=calc.planificar(rows,'2026-10-20',50,300);
 assert.equal(plan.meses,1);assert.equal(plan.fechaFinalObjetivo,'2026-11-10');
});
test('Anticipos saltan meses cubiertos pero no conceden cobertura mientras exista un hueco',()=>{
 const futuro={id:2,anio:2026,mes:'NOVIEMBRE',estatusPago:'PAGADO',montoPagado:300};
 assert.equal(calc.fechaDesdeCuotas([septiembre,futuro]),'2026-10-10');
 const p=calc.planificar([septiembre,futuro],'2026-10-08',725,300);
 assert.equal(p.meses,2);assert.equal(p.fechaFinalObjetivo,'2027-01-10');
 assert.deepEqual(p.aplicaciones.map(a=>a.mes),['OCTUBRE','DICIEMBRE','ENERO']);
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
