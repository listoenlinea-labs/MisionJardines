'use strict';

const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {historialMantenimiento,historialConcepto}=require('../src/services/historial-pagos-vivienda.service');
const {prepararDesdeHistorial}=require('../src/services/pago-manual-analisis.service');

const cuota=(id,mes,monto)=>({id,anio:2026,mes,montoPagado:monto,estatusPago:'PAGADO',
 referencia:'MJMAN:2027-01-10:84b8ed5c-317c-44ba-90da-b1f889045f11',
 recargo:monto===350?50:0,fechaConfirmacion:'2026-10-19T18:00:00.000Z',
 formaPago:'EFECTIVO',origenImportacion:'MANUAL_ANALISIS'});

test('Los 950 pesos de octubre a diciembre forman un solo movimiento, no 350',()=>{
 const cuotas=[cuota(1,'OCTUBRE',350),cuota(2,'NOVIEMBRE',300),cuota(3,'DICIEMBRE',300)];
 const rows=historialMantenimiento(cuotas);
 assert.equal(rows.length,1);
 assert.equal(rows[0].monto,950);
 assert.equal(rows[0].recargo,50);
 assert.equal(rows[0].meses,3);
 assert.deepEqual(rows[0].periodos.map(p=>p.mes),['OCTUBRE','NOVIEMBRE','DICIEMBRE']);
 assert.equal(rows[0].fecha,'2026-10-19T18:00:00.000Z');
});
test('El comprobante bancario vinculado no duplica el pago ya almacenado en cuotas',()=>{
 const result=historialMantenimiento([cuota(1,'OCTUBRE',350),cuota(2,'NOVIEMBRE',300),cuota(3,'DICIEMBRE',300)],
  [{id:9,tipoPago:'MANTENIMIENTO',estatus:'VALIDADO',monto:950,recargo:50,
   folioOperacion:'MJMAN:2027-01-10:84b8ed5c-317c-44ba-90da-b1f889045f11',fechaOperacion:'2026-10-19'}]);
 assert.equal(result.length,1);
 assert.equal(result[0].monto,950);
});
test('No se vuelve a cotizar un mes anterior a un anticipo confirmado',()=>{
 const cuotas=[cuota(1,'OCTUBRE',350),cuota(2,'NOVIEMBRE',300),cuota(3,'DICIEMBRE',300)];
 assert.throws(()=>prepararDesdeHistorial({cuotas,anio:2026,mes:11}),/ya está cubierto/);
 const january=prepararDesdeHistorial({cuotas,anio:2027,mes:1});
 assert.deepEqual(january.periodos.map(p=>p.mes),['ENERO']);
});
test('Un año anterior al actual o de tres dígitos se rechaza en registro manual',()=>{
 const current=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/Mexico_City',year:'numeric'}).format(new Date()));
 assert.throws(()=>prepararDesdeHistorial({anio:current-1,mes:12}),/año/);
 assert.throws(()=>prepararDesdeHistorial({anio:999,mes:12}),/año/);
});
test('Casa club y extraordinarios separan los movimientos por concepto',()=>{
 const bank=[{tipoPago:'EXTRAORDINARIO',estatus:'VALIDADO',monto:100,fechaOperacion:'2026-10-18',folioOperacion:'E1'},
  {tipoPago:'CASA_CLUB',estatus:'VALIDADO',monto:150,fechaOperacion:'2026-10-19',folioOperacion:'C1'}];
 const manual=[{tipoPago:'EXTRAORDINARIO',monto:75,referencia:'E2',creadoEn:'2026-10-19',formaPago:'EFECTIVO'}];
 assert.deepEqual(historialConcepto('EXTRAORDINARIO',bank,manual).map(p=>p.monto),[75,100]);
 assert.deepEqual(historialConcepto('CASA_CLUB',bank,manual).map(p=>p.monto),[150]);
});
test('Interfaz conecta las cifras clicables con historial y fechas guardada / física',()=>{
 const ui=fs.readFileSync(path.resolve(__dirname,'../../docs/assets/js/analisis-cuotas.js'),'utf8');
 const html=fs.readFileSync(path.resolve(__dirname,'../../docs/analisis-cuotas.html'),'utf8');
 const routes=fs.readFileSync(path.resolve(__dirname,'../src/routes/finanzas.routes.js'),'utf8');
 assert.match(ui,/h\.ultimoPago\?\.monto/);
 assert.match(ui,/data-paid-history/);
 assert.match(ui,/fechaFinC3/);
 assert.match(ui,/MySQL:/);
 assert.doesNotMatch(ui,/Fechas distintas\. Verifica la sincronización en ZKTeco/);
 assert.doesNotMatch(ui,/tags-date-mismatch/);
 assert.match(html,/analisis-cuotas\.js\?v=20261021-vigencia-corte/);
 assert.match(ui,/submit\.disabled=!valid\|\|q\.bloqueado/);
 assert.match(html,/<select id="housePaymentYear" required/);
 assert.match(html,/id="houseHistoryModal"/);
 assert.match(routes,/\/pagos-vivienda\/:casaId\/historial/);
});

test('Cierre anual queda como movimiento independiente de $600 y se distingue en historial',()=>{
 const lista=[
  {...cuota(3,'NOVIEMBRE',300),referencia:'ANUAL-2026',origenImportacion:'MANUAL_ANALISIS_ANUAL'},
  {...cuota(4,'DICIEMBRE',300),referencia:'ANUAL-2026',origenImportacion:'MANUAL_ANALISIS_ANUAL'}
 ];
 const movimientos=historialMantenimiento(lista);
 assert.equal(movimientos.length,1);
 assert.equal(movimientos[0].monto,600);
 assert.equal(movimientos[0].pagoAnual,true);
 assert.equal(movimientos[0].fuente,'REGISTRO_MANUAL');
 assert.deepEqual(movimientos[0].periodos.map(p=>p.mes),['NOVIEMBRE','DICIEMBRE']);
 const ordinario=historialMantenimiento([cuota(3,'DICIEMBRE',300)]);
 assert.equal(ordinario[0].pagoAnual,false);
});
