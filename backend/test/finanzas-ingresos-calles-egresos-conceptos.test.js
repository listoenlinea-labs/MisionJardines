'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {agrupacionMantenimiento,fechaCobro}=require('../src/services/resumen-cobranza-calles.service');
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
test('casa de prueba fuera del padrón no infla dinero y pago futuro no se anticipa',()=>{
 const cuotas=[cuota(2,90,'NOVIEMBRE',999,'2026-11-02','PRUEBA'),
   cuota(3,4,'NOVIEMBRE',300,'2026-12-04','FUTURO')];
 const x=agrupacionMantenimiento({padron:houses,cuotas,comprobantes:[],...periodo});
 assert.equal(x.mes,0);assert.equal(x.acumulado,0);
});
test('sin fecha no se inventan ingresos; se informa conciliación',()=>{
 const x=agrupacionMantenimiento({padron:houses,cuotas:[cuota(3,4,'NOVIEMBRE',300,null,'SIN-FECHA')],comprobantes:[],...periodo});
 assert.equal(x.mes,0);assert.equal(x.sinFecha,1);
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
test('HTML tiene ocho conceptos y los dos gráficos con tablas y acumulados',()=>{
 const html=root('docs/analisis-cuotas.html'),js=root('docs/assets/js/analisis-cuotas.js');
 for(const id of ['financeIncomeTotals','financeCashChart','financeIncomeStreetRows','financeIncomeStreetTotal',
  'financeExpenseTotals','financeExpenseChart','financeExpensesConceptRows','financeExpensesConceptTotal'])
  assert.match(html,new RegExp('id="'+id+'"'));
 const cats=['CFE','SIAPA','JARDINERIA','MANTENIMIENTO','CUOTA_EXTRAORDINARIA','INTERNET','SERVICIOS','OTROS'];
 for(const c of cats)assert.ok(html.split('<option value="'+c+'">').length>=3,c+' está en formulario y filtro');
 assert.doesNotMatch(html,/<option value="LUZ">|<option value="AGUA">/);
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
