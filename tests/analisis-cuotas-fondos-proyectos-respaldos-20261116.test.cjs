'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const repo=path.join(__dirname,'..');
const read=file=>fs.readFileSync(path.join(repo,file),'utf8');
const budget=require('../docs/assets/js/proyectos-presupuesto.js');
const houses=Array.from({length:231},(_,n)=>({casaId:n+1}));
test('cuota de 600 sin exenciones produce meta de 138600 y 231 casas que pagan',()=>{
 const value=budget.distribuirPorCuota(houses,600,[]);
 assert.equal(value.totalCentavos/100,138600);
 assert.equal(value.casasIncluidas,231);
 assert.equal(value.noAplica,0);
});
test('cuota cero resta una vivienda y reduce meta en 600 sin redistribuir',()=>{
 const value=budget.distribuirPorCuota(houses,600,[{casaId:5,monto:0}]);
 assert.equal(value.casasIncluidas,230);
 assert.equal(value.noAplica,1);
 assert.equal(value.totalCentavos/100,138000);
 assert.equal(value.rows.find(x=>x.casaId===5).montoCentavos,0);
});
test('se suman cuotas especiales menores y mayores de modo exacto',()=>{
 const v=budget.distribuirPorCuota(houses,600,[
  {casaId:5,monto:0},{casaId:6,monto:300},{casaId:7,monto:800}
 ]);
 assert.equal(v.totalCentavos/100,137900);
 assert.equal(v.casasIncluidas,230);
 assert.equal(v.excepciones,3);
 assert.equal(v.rows.reduce((s,x)=>s+x.montoCentavos,0),v.totalCentavos);
});
test('se rechazan IDs de excepción duplicados o ajenos al padrón',()=>{
 assert.throws(()=>budget.distribuirPorCuota(houses,600,[{casaId:999,monto:0}]));
 assert.throws(()=>budget.distribuirPorCuota(houses,600,[{casaId:5,monto:0},{casaId:5,monto:100}]));
});
test('el servidor preserva el estado No aplica con cuota cero',()=>{
 const validation=read('backend/src/services/proyectos-extraordinarios-validacion.service.js');
 const projectService=read('backend/src/services/proyectos-extraordinarios.service.js');
 assert.match(validation,/c\.montoCentavos===0&&paid===0\)noAplica\+\+/);
 assert.match(projectService,/if\(input\?\.cuotaPorCasa!==undefined\)/);
 assert.match(projectService,/tarifasEspeciales=\[\.\.\.overrides\]/);
});
test('tablas de fondos: máximo 10 filas por columna, doble selección y exclusión reversible',()=>{
 const ui=read('docs/assets/js/finanzas-plan.js');
 const html=read('docs/analisis-cuotas.html');
 const controller=read('backend/src/controllers/finanzas-plan.controller.js');
 assert.match(ui,/pageLimit=10/);
 assert.match(ui,/for\(const project of target\.proyectosExtraordinarios\|\|\[\]\)/);
 assert.match(ui,/selectedExpenseId/);
 assert.match(ui,/data-exclude/);
 assert.match(html,/id="fplanAssignFooter"/);
 assert.match(html,/id="fplanIncomeSearch"/);
 assert.match(html,/id="fplanIncomePagination"/);
 assert.match(html,/id="fplanExpensePagination"/);
 assert.match(controller,/cleanExcluded/);
});
test('el respaldo sólo confirma archivos verificados en la carpeta autorizada',()=>{
 const svc=read('backend/src/services/drive-respaldos.service.js');
 const jobs=read('backend/src/services/drive-respaldos-jobs.service.js');
 assert.match(svc,/async function verificarArchivo/);
 assert.match(svc,/file\.parents\.includes\(parent\)/);
 assert.match(svc,/folder\(token,periodo\.slice\(0,4\),setting\.folder_id\)/);
 assert.match(jobs,/job\.verificados<=0/);
 assert.match(jobs,/job\.estado='COMPLETADO'/);
 assert.match(read('docs/assets/js/analisis-cuotas.js'),/financeBackupJobBanner/);
});
test('los proyectos se consultan por conceptos sin duplicar presupuestos',()=>{
 const scopes=read('docs/assets/js/finanzas-egresos-ambito.js');
 const ui=read('docs/assets/js/analisis-cuotas.js');
 assert.match(scopes,/function egresosTodosProyectos/);
 assert.match(scopes,/known\.has\(id\)/);
 assert.match(ui,/id\)===/);
 assert.match(ui,/showAllProjectExpenses/);
});
