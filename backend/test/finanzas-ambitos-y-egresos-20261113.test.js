'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=file=>fs.readFileSync(path.resolve(__dirname,'../..',file),'utf8');
const balance=require('../../docs/assets/js/analisis-balance.js');
const {ambitoDeEgreso}=require('../src/services/categorias-egresos.service');

test('un proyecto solo descuenta gastos reales propios y no la meta presupuestada',()=>{
 const p=balance.proyecto({recaudado:8000,totalEsperado:15000,egresosReales:1250});
 assert.equal(p.ingresos,8000);assert.equal(p.egresos,1250);assert.equal(p.diferencia,6750);
 assert.equal(p.tipo,'EXTRAORDINARIO');
});
test('club no usa gastos de otros ámbitos y mantenimiento permanece independiente',()=>{
 const club=balance.casaClub({ingresos:3500,egresos:500});
 assert.equal(club.diferencia,3000);
 const maintenance=balance.mensual({ingresosMantenimientoCalles:{mes:5500},
  finanzasAmbitos:{MANTENIMIENTO:{egresos:650}},egresosPorConcepto:{mes:99999}});
 assert.equal(maintenance.diferencia,4850);
 assert.equal(ambitoDeEgreso({categoria:'CFE'}),'MANTENIMIENTO');
 assert.equal(ambitoDeEgreso({categoria:'PROYECTO'}),'EXTRAORDINARIO');
 assert.equal(ambitoDeEgreso({categoria:'INTERNET',ambito:'CASA_CLUB'}),'CASA_CLUB');
});
test('UI prepara filtros, dos columnas, paginación y comprobantes de proyecto',()=>{
 const html=read('docs/analisis-cuotas.html');
 const js=read('docs/assets/js/analisis-cuotas.js');
 const css=read('docs/assets/css/analisis-cuotas.css');
 const backend=read('backend/src/controllers/finanzas.controller.js');
 for(const id of ['expensePagination','expensePrev','expenseNext','financeProjectExpenseForm',
  'financeProjectExpenseProof','expenseScope','financeIncomeSubtitle'])assert.ok(html.includes('id="'+id+'"'));
 assert.match(js,/matchMedia\('\(max-width:700px\)'\)\.matches\?3:10/);
 assert.match(css,/grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
 assert.match(backend,/gastosConceptos/);
 assert.match(backend,/comprobanteEgreso/);
 assert.match(backend,/crearProyecto/);
});
