'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {prepararPlan,generarReferencia,fechaFinDeReferencia}=require('../src/services/pago-manual-analisis.service');

test('Un mes octubre de 2026 vence el 10 de noviembre para todos los TAGs',()=>{
 const p=prepararPlan({anio:2026,mes:10,meses:1,importeMes:300});
 assert.deepEqual(p.periodos.map(x=>x.mes+' '+x.anio),['OCTUBRE 2026']);
 assert.equal(p.fechaFinObjetivo,'2026-11-10');
 assert.equal(p.total,300);
 assert.equal(p.recargo,0);
});
test('Pago de múltiples meses cruza el año y calcula fecha única de corte',()=>{
 const p=prepararPlan({anio:2026,mes:12,meses:3,importeMes:350});
 assert.deepEqual(p.periodos.map(x=>x.mes+' '+x.anio),['DICIEMBRE 2026','ENERO 2027','FEBRERO 2027']);
 assert.equal(p.fechaFinObjetivo,'2027-03-10');
 assert.equal(p.total,1050);
 assert.equal(p.recargo,50);
});
test('Se rechazan montos no oficiales, meses anteriores a octubre 2026 y cantidades inválidas',()=>{
 assert.throws(()=>prepararPlan({anio:2026,mes:9,meses:1,importeMes:300}));
 assert.throws(()=>prepararPlan({anio:2026,mes:10,meses:0,importeMes:300}));
 assert.throws(()=>prepararPlan({anio:2026,mes:10,meses:37,importeMes:300}));
 assert.throws(()=>prepararPlan({anio:2026,mes:10,meses:1,importeMes:250}));
});
test('Referencia única enlaza cuotas con la misma fecha C3',()=>{
 const a=generarReferencia('2027-03-10');
 const b=generarReferencia('2027-03-10');
 assert.notEqual(a,b);
 assert.equal(fechaFinDeReferencia(a),'2027-03-10');
 assert.equal(fechaFinDeReferencia('BANCARIO:000011'),null);
 assert.equal(fechaFinDeReferencia('MJMAN:2027-02-31:12345678-1234-4123-8123-123456789012'),null);
});
test('Finanzas almacena cuotas con una transacción y enlaza la cola ZKTeco',()=>{
 const controller=fs.readFileSync(path.resolve(__dirname,'../src/controllers/pagos-manuales-analisis.controller.js'),'utf8');
 const sync=fs.readFileSync(path.resolve(__dirname,'../src/services/zkteco-vigencias.service.js'),'utf8');
 const routes=fs.readFileSync(path.resolve(__dirname,'../src/routes/finanzas.routes.js'),'utf8');
 assert.match(controller,/sequelize\.transaction\(/);
 assert.match(controller,/vigenciaService\.actualizar\(/);
 assert.match(controller,/estatusPago:'PAGADO'/);
 assert.match(controller,/clasificarCuotaParaPago\(cuota\)/);
 assert.match(controller,/t\.fechaFin>plan\.fechaFinObjetivo/);
 assert.match(sync,/fechaFinDeReferencia\(event\.referencia\)/);
 assert.match(sync,/fechaObjetivo<fechaAntes/);
 assert.match(sync,/fechaDespues: fechaObjetivo\|\|incrementar/);
 assert.match(routes,/router\.post\('\/pagos-vivienda'/);
 assert.match(routes,/router\.get\('\/pagos-vivienda\/:casaId\/estado-c3'/);
});
test('Análisis ofrece botón y formulario, Sidebar muestra Cuotas en Administración',()=>{
 const html=fs.readFileSync(path.resolve(__dirname,'../../docs/analisis-cuotas.html'),'utf8');
 const ui=fs.readFileSync(path.resolve(__dirname,'../../docs/assets/js/analisis-cuotas.js'),'utf8');
 const sidebar=fs.readFileSync(path.resolve(__dirname,'../../docs/assets/js/site-sidebar.js'),'utf8');
 for(const id of ['housePaymentModal','housePaymentMonth','housePaymentYear','housePaymentCount','housePaymentAmount','housePaymentMethod','housePaymentRefreshC3']){
  assert.match(html,new RegExp('id="'+id+'"'));
 }
 assert.match(ui,/data-pay-house/);
 assert.match(ui,/request\('\/pagos-vivienda',payload\)/);
 assert.match(sidebar,/item\.page === 'cuotas\.html'\) administration\.push/);
});
