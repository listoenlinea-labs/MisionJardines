'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');
const rules=require(path.join(__dirname,'../docs/assets/js/finanzas-recomendacion.js'));
const maintenance=(free=40000)=>({id:'MANTENIMIENTO|2026-11',origen:'MANTENIMIENTO',
 origenPeriodo:'2026-11',name:'Mantenimiento noviembre',free});
const expense=(id,monto,grupo='Mantenimiento',extra={})=>({
 id,monto,grupo,nombre:'Vigilancia',categoria:'SERVICIOS',fecha:'2026-11-15',pagado:false,...extra});
test('recomienda primero la misma fuente y explica el cálculo',()=>{
 const out=rules.recommend({sources:[maintenance()],expenses:[expense(1,14500)],period:'2026-11'});
 assert.deepEqual(out.proposed,[{egresoId:1,origen:'MANTENIMIENTO',origenPeriodo:'2026-11',monto:14500}]);
 assert.equal(out.details[0].sourceRemaining,25500);
 assert.match(out.details[0].reason,/mismo ámbito/);
 assert.equal(out.summary.crossArea,0);
});
test('respeta las asignaciones ya existentes y no duplica cobertura',()=>{
 const out=rules.recommend({sources:[maintenance(7000)],expenses:[expense(2,9000)],
 assignments:[{egresoId:2,monto:5000}],period:'2026-11'});
 assert.equal(out.summary.totalProposed,4000);
 assert.equal(out.summary.uncoveredExpenses,0);
});
test('prestamo propuesto de mantenimiento preserva 20% y explica su riesgo',()=>{
 const out=rules.recommend({sources:[maintenance(10000)],
 expenses:[expense(3,9000,'Cuotas extraordinarias',{nombre:'Barandal',proyectoId:7})],
 period:'2026-11'});
 assert.equal(out.summary.totalProposed,8000);
 assert.equal(out.summary.crossArea,8000);
 assert.equal(out.summary.uncoveredExpenses,1000);
 assert.equal(out.details[0].temporary,true);
 assert.match(out.details[0].reason,/20%/);
});
test('no presta casa club ni mezcla proyectos',()=>{
 const out=rules.recommend({sources:[
  {origen:'CASA_CLUB',origenPeriodo:'2026-11',free:15000,name:'Casa club',id:'CASA_CLUB|2026-11'},
  {origen:'PROYECTO:8',origenPeriodo:'ACUMULADO',free:10000,name:'Otro proyecto',id:'PROYECTO:8|ACUMULADO'}
 ],expenses:[expense(4,5000,'Cuotas extraordinarias',{proyectoId:7})],period:'2026-11'});
 assert.equal(out.proposed.length,0);
 assert.equal(out.summary.uncoveredExpenses,5000);
});
test('no propone montos negativos ni finge cobertura si no hay fondos',()=>{
 const out=rules.recommend({sources:[],expenses:[expense(5,1200)],period:'2026-11'});
 assert.equal(out.summary.totalProposed,0);
 assert.equal(out.summary.uncoveredExpenses,1200);
 assert.equal(out.details.length,0);
});
