'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=relative=>fs.readFileSync(path.resolve(__dirname,'../..',relative),'utf8');
const {resumen}=require('../../docs/assets/js/costos-presupuesto-proyecto.js');
const balance=require('../../docs/assets/js/analisis-balance.js');

test('sin conceptos, el proyecto muestra el presupuesto comprometido en lugar de cero',()=>{
 const project={recaudado:204500,presupuestoBase:258500,totalEsperado:258500,gastosConceptos:[]};
 const c=resumen(project);
 assert.equal(c.gastosReales,0);
 assert.equal(c.costoComprometido,258500);
 assert.equal(c.diferencia,-54000);
 assert.equal(balance.proyecto({...project,egresosComprometidos:c.costoComprometido}).egresos,258500);
});
test('concepto incluido no aumenta costo; adicional sí aumenta y ambos son gastos reales',()=>{
 const project={recaudado:10000,presupuestoBase:20000,gastosConceptos:[
  {monto:3000,incluidoPresupuesto:true},
  {monto:2000,incluidoPresupuesto:false},
  {monto:1000,incluidoPresupuesto:true}
 ]};
 const c=resumen(project);
 assert.equal(c.incluidos,4000);
 assert.equal(c.adicionales,2000);
 assert.equal(c.gastosReales,6000);
 assert.equal(c.costoComprometido,22000);
 assert.equal(c.porJustificar,16000);
 assert.equal(c.diferencia,-12000);
});
test('gastos históricos previos al checkbox se consideran incluidos por defecto',()=>{
 const c=resumen({presupuestoBase:5000,recaudado:0,gastosConceptos:[{monto:1200}]});
 assert.equal(c.gastosReales,1200);
 assert.equal(c.costoComprometido,5000);
});
test('frontend permite editar cada movimiento y el total por ámbito sin tocar mantenimiento al editar proyecto',()=>{
 const js=read('docs/assets/js/analisis-cuotas.js');
 const ui=read('docs/assets/js/finanzas-ambitos-vista.js');
 const controller=read('backend/src/controllers/finanzas.controller.js');
 const routes=read('backend/src/routes/finanzas.routes.js');
 assert.match(js,/financeProjectExpenseIncluded'\)\.checked/);
 assert.match(js,/data-expense-edit/);
 assert.match(js,/financeExpenseFooter'\)\.addEventListener\('dblclick'/);
 assert.match(js,/egresos\/total-mantenimiento/);
 assert.match(js,/proyectos-extraordinarios\/'.*?\/presupuesto/);
 assert.match(controller,/actualizarPresupuestoProyecto/);
 assert.match(controller,/actualizarMontoEgreso/);
 assert.match(controller,/actualizarTotalMantenimiento/);
 assert.match(routes,/router\.patch\('\/egresos\/:id\/monto'/);
 assert.match(ui,/Costo total comprometido/);
});
test('iPhone horizontal presenta tres tarjetas y retrato mantiene navegación',()=>{
 const css=read('docs/assets/css/analisis-cuotas.css');
 assert.match(css,/orientation:landscape/);
 assert.match(css,/grid-template-columns:repeat\(3,minmax\(0,1fr\)\)!important/);
 assert.match(css,/\.finance-monthly-pagination\{display:none!important\}/);
 assert.match(css,/scroll-snap-type:none!important/);
});
