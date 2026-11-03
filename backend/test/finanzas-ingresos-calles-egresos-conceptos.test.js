'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {CALLES,agrupacionMantenimiento,fechaCobro}=require('../src/services/resumen-cobranza-calles.service');
const {categorias,canonica,resumenEgresos}=require('../src/services/categorias-egresos.service');
const root=p=>fs.readFileSync(path.resolve(__dirname,'../../',p),'utf8');
const cuota=(id,casaId,mes,monto,fecha,ref,origen='MANUAL_ANALISIS')=>({
 id,casaId,anio:2026,mes,montoPagado:monto,recargo:0,estatusPago:'PAGADO',
 referencia:ref,fechaConfirmacion:fecha,formaPago:'EFECTIVO',origenImportacion:origen
});
const houses=[
 {id:4,calle:'Gardenias',calleCorrecta:'Gardenias',numero:'4'},
 {id:11,calle:'Rosas',calleCorrecta:'Rosas',numero:'10'}
];
const periodo={inicio:'2026-11-01',fin:'2026-11-30'};

test('manual anual en noviembre suma el movimiento una sola vez, incluso si cubre diciembre',()=>{
 const cuotas=[
  cuota(1,4,'NOVIEMBRE',300,'2026-11-02T18:00:00.000Z','MJMAN-ANUAL-4','MANUAL_ANALISIS_ANUAL'),
  cuota(2,4,'DICIEMBRE',300,'2026-11-02T18:00:00.000Z','MJMAN-ANUAL-4','MANUAL_ANALISIS_ANUAL')
 ];
 const x=agrupacionMantenimiento({padron:houses,cuotas,comprobantes:[],...periodo});
 assert.equal(x.mes,600);
 assert.equal(x.acumulado,600);
 assert.equal(x.calles.find(c=>c.calle==='Gardenias').movimientos,1);
 assert.equal(x.calles.find(c=>c.calle==='Gardenias').mes,600);
 assert.equal(x.calles.find(c=>c.calle==='Rosas').mes,0);
});
test('cobros anteriores van al acumulado, no vuelven a sumarse a noviembre',()=>{
 const cuotas=[
  cuota(1,4,'OCTUBRE',300,'2026-10-05T18:00:00.000Z','PAGO-OCT'),
  cuota(2,4,'NOVIEMBRE',300,'2026-11-02T18:00:00.000Z','PAGO-NOV')
 ];
 const x=agrupacionMantenimiento({padron:houses,cuotas,comprobantes:[],...periodo});
 assert.equal(x.acumulado,600);
 assert.equal(x.mes,300);
});
test('depósito bancario ya aplicado a cuotas no se cuenta dos veces',()=>{
 const cuotas=[cuota(1,4,'NOVIEMBRE',300,'2026-11-02T18:00:00.000Z','BANCO-001','BANCO')];
 const comprobantes=[{id:22,casaId:4,tipoPago:'MANTENIMIENTO',estatus:'VALIDADO',
  monto:300,folioOperacion:'BANCO-001',fechaOperacion:'2026-11-02'}];
 const x=agrupacionMantenimiento({padron:houses,cuotas,comprobantes,...periodo});
 assert.equal(x.acumulado,300);
 assert.equal(x.mes,300);
});
test('casa de prueba fuera del padrón no infla total y fecha posterior no se atribuye a noviembre',()=>{
 const cuotas=[cuota(2,90,'NOVIEMBRE',999,'2026-11-02','PRUEBA'),
   cuota(3,4,'NOVIEMBRE',300,'2026-12-04','FUTURO')];
 const x=agrupacionMantenimiento({padron:houses,cuotas,comprobantes:[],...periodo});
 assert.equal(x.mes,0);assert.equal(x.acumulado,300);
});
test('una cuota pagada sin fecha suma al acumulado, pero no inventa un cobro mensual',()=>{
 const x=agrupacionMantenimiento({padron:houses,cuotas:[cuota(3,4,'NOVIEMBRE',300,null,'SIN-FECHA')],comprobantes:[],...periodo});
 assert.equal(x.mes,0);assert.equal(x.acumulado,300);assert.equal(x.sinFecha,1);
});
test('fecha del cobro se interpreta en hora México para timestamps UTC',()=>{
 assert.equal(fechaCobro('2026-12-01T05:30:00.000Z'),'2026-11-30');
 assert.equal(fechaCobro('2026-11-02 21:15:00'),'2026-11-02');
});
test('egresos conservan gastos LUZ/AGUA/PROYECTOS sin mutarlos, y agregan Internet y Servicios',()=>{
 assert.deepEqual(categorias,['CFE','SIAPA','JARDINERIA','MANTENIMIENTO','CUOTA_EXTRAORDINARIA','INTERNET','SERVICIOS','OTROS']);
 assert.equal(canonica('LUZ'),'CFE');assert.equal(canonica('AGUA'),'SIAPA');
 assert.equal(canonica('PROYECTOS'),'CUOTA_EXTRAORDINARIA');
 const rows=[
  {categoria:'LUZ',monto:150,fecha:'2026-10-30'},
  {categoria:'CFE',monto:300,fecha:'2026-11-01'},
  {categoria:'AGUA',monto:100,fecha:'2026-11-03'},
  {categoria:'INTERNET',monto:500,fecha:'2026-11-04'},
  {categoria:'SERVICIOS',monto:50,fecha:'2026-12-04'}
 ];
 const result=resumenEgresos(rows,'2026-11-01','2026-11-30');
 const cfe=result.conceptos.find(c=>c.categoria==='CFE');
 assert.equal(cfe.acumulado,450);assert.equal(cfe.mes,300);
 assert.equal(result.conceptos.find(c=>c.categoria==='SIAPA').mes,100);
 assert.equal(result.conceptos.find(c=>c.categoria==='INTERNET').mes,500);
 assert.equal(result.mes,900);assert.equal(result.acumulado,1050);
});
test('HTML muestra solo las ocho barras de ingresos y conserva tabla de egresos',()=>{
 const html=root('docs/analisis-cuotas.html'),js=root('docs/assets/js/analisis-cuotas.js');
 for(const id of ['financeIncomeTotals','financeCashChart',
  'financeExpenseTotals','financeExpenseChart','financeExpenseHistory',
  'financeExpenseHistoryRows','financeExpenseHistoryTotal','financeExpenseHistoryClose'])
  assert.match(html,new RegExp('id="'+id+'"'));
 const cats=['CFE','SIAPA','JARDINERIA','MANTENIMIENTO','CUOTA_EXTRAORDINARIA','INTERNET','SERVICIOS','OTROS'];
 for(const c of cats)assert.ok(html.split('<option value="'+c+'">').length>=3,c+' está en formulario y filtro');
 assert.doesNotMatch(html,/<option value="LUZ">|<option value="AGUA">/);
 assert.doesNotMatch(html,/id="financeIncomeStreetRows"|id="financeIncomeStreetTotal"/);
 assert.match(html,/<h2>Ingresos<\/h2>/);
 assert.match(html,/<p class="finance-card-subtitle">Ingresos por calle<\/p>/);
 assert.match(js,/Mantenimiento de '/);
 assert.match(js,/Number\(c\.mes\|\|0\)/);
 assert.match(html,/<th>Concepto<\/th><th>Mes<\/th><th>Total pagado<\/th>/);
 assert.doesNotMatch(html,/id="financeExpensesConceptRows"|id="financeExpensesConceptTotal"/);
 assert.match(js,/selectedExpenseCategory===category\?null:category/);
 assert.match(js,/renderExpenseHistory\(\)/);
 assert.match(js,/canonicalExpenseCategory\(e\.categoria\)===category/);
 assert.match(js,/data\.ingresosMantenimientoCalles/);
 assert.match(js,/data\.egresosPorConcepto/);
 assert.doesNotThrow(()=>new Function(js));
});
test('migración de enum preserva valores originales y solo añade los nuevos',()=>{
 const model=root('backend/src/models/Egreso.js'),migration=root('backend/src/services/finanzas-schema.service.js');
 for(const cat of [...categorias,'LUZ','AGUA','PROYECTOS']){
  assert.ok(model.includes("'"+cat+"'"),cat);
  assert.ok(migration.includes("'"+cat+"'"),cat);
 }
 assert.match(migration,/information_schema\.COLUMNS/);
 assert.match(migration,/if\(opciones\.every\(/);
});

test('ocho calles siempre visibles en orden, aunque ninguna vivienda tenga pagos',()=>{
 const names=['Atotonilco','Gardenias','Guadalajara','Jardines','Lirios','Magnolias','Rosas','Valle de México'];
 assert.deepEqual(CALLES,names);
 const empty=agrupacionMantenimiento({padron:[],cuotas:[],comprobantes:[],...periodo});
 assert.deepEqual(empty.calles.map(c=>c.calle),names);
 assert.equal(empty.acumulado,0);
});
test('historical sin fecha en varias calles y anualidad se contabiliza una sola vez',()=>{
 const casas=[
  {id:1,calle:'Gardenias'},{id:2,calleCorrecta:'Rosas',calle:'Rosas'},
  {id:3,calle:'Valle de México'}
 ];
 const cuotas=[
  cuota(20,1,'NOVIEMBRE',300,null,'G1-ANUAL','MANUAL_ANALISIS_ANUAL'),
  cuota(21,1,'DICIEMBRE',300,null,'G1-ANUAL','MANUAL_ANALISIS_ANUAL'),
  cuota(22,2,'OCTUBRE',350,null,'R1'),
  cuota(23,3,'SEPTIEMBRE',150,null,'V1')
 ];
 const result=agrupacionMantenimiento({padron:casas,cuotas,comprobantes:[],...periodo});
 assert.equal(result.acumulado,1100);
 assert.equal(result.calles.find(c=>c.calle==='Gardenias').acumulado,600);
 assert.equal(result.calles.find(c=>c.calle==='Gardenias').movimientos,1);
 assert.equal(result.calles.find(c=>c.calle==='Rosas').acumulado,350);
 assert.equal(result.calles.find(c=>c.calle==='Valle de México').acumulado,150);
 assert.equal(result.mes,0);
});
test('el portal fuerza la carga de Análisis de cuotas actualizado en iframe',()=>{
 const shell=root('docs/assets/js/app-shell.js');
 const html=root('docs/analisis-cuotas.html'),app=root('docs/app.html');
 assert.match(shell,/_mjVersion.*finanzas-mensuales-conceptos-20261103/);
 assert.match(html,/analisis-cuotas\.js\?v=20261103-ingresos-ocho-calles/);
 assert.match(app,/app-shell\.js\?v=20261103-ingresos-calles/);
});

test('ambos gráficos muestran solo el mes seleccionado y no el acumulado histórico',()=>{
 const html=root('docs/analisis-cuotas.html'),js=root('docs/assets/js/analisis-cuotas.js');
 assert.match(html,/Mantenimiento cobrado durante el mes y año seleccionados/);
 assert.match(js,/bar\(c\.calle,Number\(c\.mes\|\|0\),max,false,fmt\(c\.mes\)\)/);
 assert.match(js,/bar\(c\.concepto,Number\(c\.mes\|\|0\),max,true,fmt\(c\.mes\)\)/);
 assert.match(js,/Mantenimiento del mes/);
 assert.match(js,/Egresos de '/);
 assert.doesNotMatch(js,/bar\(c\.calle,Number\(c\.acumulado\)/);
 assert.doesNotMatch(js,/bar\(c\.concepto,Number\(c\.acumulado\)/);
});

test('detalle CFE enero a noviembre 2026: meses vacíos, varios gastos y exclusión diciembre',()=>{
 const rows=[
  {categoria:'LUZ',monto:2000,fecha:'2026-01-05'},
  {categoria:'CFE',monto:7000,fecha:'2026-11-01'},
  {categoria:'LUZ',monto:3000,fecha:'2026-11-11'},
  {categoria:'CFE',monto:2500,fecha:'2026-12-01'},
  {categoria:'SIAPA',monto:1600,fecha:'2026-11-03'},
  {categoria:'CFE',monto:900,fecha:'2025-10-04'}
 ];
 const x=resumenEgresos(rows,'2026-11-01','2026-11-30');
 const cfe=x.historialMensual.CFE;
 assert.equal(cfe.length,11);
 assert.deepEqual(cfe.map(m=>m.mes),
  ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre']);
 assert.equal(cfe[0].totalPagado,2000);
 assert.equal(cfe[1].totalPagado,0);
 assert.equal(cfe[10].totalPagado,10000);
 assert.equal(x.conceptos.find(c=>c.categoria==='CFE').mes,10000);
 assert.equal(x.mes,11600);
 // Acumulado de ejercicios previos se conserva fuera de la gráfica mensual.
 assert.equal(x.conceptos.find(c=>c.categoria==='CFE').acumulado,12900);
 assert.equal(cfe.reduce((sum,m)=>sum+m.totalPagado,0),12000);
 assert.equal(x.historialMensual.SIAPA[10].totalPagado,1600);
 assert.equal(x.historialMensual.INTERNET.length,11);
 assert.equal(x.historialMensual.INTERNET[10].totalPagado,0);
});

test('seleccionar marzo no muestra abril-diciembre en el historial',()=>{
 const x=resumenEgresos([
  {categoria:'CFE',monto:100,fecha:'2026-02-28'},
  {categoria:'CFE',monto:300,fecha:'2026-04-01'}
 ],'2026-03-01','2026-03-31');
 assert.equal(x.historialMensual.CFE.length,3);
 assert.equal(x.historialMensual.CFE[1].totalPagado,100);
 assert.equal(x.historialMensual.CFE[2].totalPagado,0);
 assert.equal(x.mes,0);
});
