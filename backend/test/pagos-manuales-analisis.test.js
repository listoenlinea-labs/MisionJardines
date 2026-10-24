'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {prepararPlan,prepararDesdeHistorial,validarPagoAnual,generarReferencia,fechaFinDeReferencia}=require('../src/services/pago-manual-analisis.service');
const ultimoAgosto=[{anio:2026,mes:'AGOSTO',estatusPago:'PAGADO',montoPagado:300}];

test('Agosto pagado, octubre elegido: septiembre y octubre por $600; C3 al 10 noviembre',()=>{
 const plan=prepararDesdeHistorial({cuotas:ultimoAgosto,anio:2026,mes:10});
 assert.equal(plan.ultimoMesPagado.nombre,'AGOSTO');
 assert.deepEqual(plan.periodos.map(p=>p.mes),['SEPTIEMBRE','OCTUBRE']);
 assert.equal(plan.meses,2);
 assert.equal(plan.montoSugerido,600);
 assert.equal(plan.total,600);
 assert.equal(plan.fechaFinObjetivo,'2026-11-10');
});
test('Se permite un total editable con recargo distribuido sin acreditar meses adicionales',()=>{
 const plan=prepararDesdeHistorial({cuotas:ultimoAgosto,anio:2026,mes:10,montoTotal:650});
 assert.equal(plan.total,650);assert.equal(plan.recargo,50);
 assert.deepEqual(plan.periodos.map(p=>p.montoCuota),[350,300]);
 assert.equal(plan.meses,2);assert.equal(plan.fechaFinObjetivo,'2026-11-10');
});
test('No se marcan dos meses pagados con monto insuficiente o recargo mayor al permitido',()=>{
 assert.throws(()=>prepararDesdeHistorial({cuotas:ultimoAgosto,anio:2026,mes:10,montoTotal:599}));
 assert.throws(()=>prepararDesdeHistorial({cuotas:ultimoAgosto,anio:2026,mes:10,montoTotal:701}));
 assert.throws(()=>prepararDesdeHistorial({cuotas:ultimoAgosto,anio:2026,mes:10,montoTotal:'600.005'}));
});
test('Si septiembre ya está pagado, sólo octubre se cotiza y no se duplica septiembre',()=>{
 const plan=prepararDesdeHistorial({cuotas:[...ultimoAgosto,{anio:2026,mes:'SEPTIEMBRE',estatusPago:'PAGADO',montoPagado:300}],anio:2026,mes:10});
 assert.equal(plan.meses,1);assert.equal(plan.total,300);
 assert.deepEqual(plan.periodos.map(p=>p.mes),['OCTUBRE']);
});
test('Tres meses cruzan el año y obtienen fecha común para todos los TAGs',()=>{
 const plan=prepararDesdeHistorial({cuotas:[{anio:2026,mes:'NOVIEMBRE',estatusPago:'PAGADO',montoPagado:300}],anio:2027,mes:2,montoTotal:1050});
 assert.deepEqual(plan.periodos.map(p=>p.mes),['DICIEMBRE','ENERO','FEBRERO']);
 assert.equal(plan.total,1050);assert.equal(plan.fechaFinObjetivo,'2027-03-10');
});
test('El registro manual usa septiembre solo como base sin historial',()=>{
 const plan=prepararPlan({anio:2026,mes:9,meses:2,montoTotal:600});
 assert.equal(plan.fechaFinObjetivo,'2026-11-10');
 const sinHistorial=require('../src/services/pago-manual-analisis.service').prepararDesdeHistorial({cuotas:[],anio:2026,mes:10});
 assert.equal(sinHistorial.desde.mes,9);
 const conHistorial=require('../src/services/pago-manual-analisis.service').prepararDesdeHistorial({cuotas:[{anio:2026,mes:'JULIO',estatusPago:'PAGADO',montoPagado:300}],anio:2026,mes:10});
 assert.equal(conHistorial.desde.mes,8);
 assert.throws(()=>prepararPlan({anio:2026,mes:9,meses:0,montoTotal:300}));
});
test('Referencia MJMAN tiene fecha final y UUID de evento único',()=>{
 const a=generarReferencia('2026-11-10'),b=generarReferencia('2026-11-10');
 assert.notEqual(a,b);
 assert.equal(fechaFinDeReferencia(a),'2026-11-10');
 assert.equal(fechaFinDeReferencia('BANCARIO:99'),null);
});
test('Backend usa una transacción y un evento durable C3 por pago, no por mensualidad',()=>{
 const controller=fs.readFileSync(path.resolve(__dirname,'../src/controllers/pagos-manuales-analisis.controller.js'),'utf8');
 const vigencia=fs.readFileSync(path.resolve(__dirname,'../src/services/vigencia-mantenimiento.service.js'),'utf8');
 const worker=fs.readFileSync(path.resolve(__dirname,'../src/services/zkteco-vigencias.service.js'),'utf8');
 const routes=fs.readFileSync(path.resolve(__dirname,'../src/routes/finanzas.routes.js'),'utf8');
 assert.match(controller,/sequelize\.transaction\(/);
 assert.match(controller,/Cuota\.findAll\(/);
 assert.match(controller,/registrarLoteManual\(/);
 assert.doesNotMatch(controller,/vigenciaService\.actualizar\(/);
 assert.match(controller,/mesesEsperados!==plan\.meses/);
 assert.match(vigencia,/async function registrarLoteManual/);
 assert.match(vigencia,/for\(const t of tags\)/);
 assert.match(worker,/fechaFinDeReferencia\(event\.referencia\)/);
 assert.match(worker,/fechaObjetivo<fechaAntes/);
 assert.match(routes,/\/pagos-vivienda\/:casaId\/cotizar/);
});
test('UI muestra último pagado, rango automático y total editable',()=>{
 const html=fs.readFileSync(path.resolve(__dirname,'../../docs/analisis-cuotas.html'),'utf8');
 const ui=fs.readFileSync(path.resolve(__dirname,'../../docs/assets/js/analisis-cuotas.js'),'utf8');
 for(const id of ['houseLastPayment','housePaymentMonth','housePaymentYear','housePaymentCount','housePaymentAmount','housePaymentReview'])assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/housePaymentCount" readonly/);
 assert.match(html,/Monto total recibido/);
 assert.match(ui,/currentPaymentQuote/);
 assert.match(ui,/mesesEsperados:currentPaymentQuote\.meses/);
 assert.match(ui,/\/cotizar\?anio=/);
});

test('El modal se cierra solo si el POST confirma el pago; error de refresco no pide cobrar de nuevo',()=>{
 const ui=fs.readFileSync(path.resolve(__dirname,'../../docs/assets/js/analisis-cuotas.js'),'utf8');
 const start=ui.indexOf('async function submitHousePayment(event)');
 const end=ui.indexOf("'financeHouseRows'",start);
 const flow=ui.slice(start,end);
 const request=flow.indexOf("await request('/pagos-vivienda',payload)");
 const close=flow.indexOf('closeHousePayment();',request);
 const refresh=flow.indexOf('const refreshed=await load();',close);
 assert.ok(request>=0&&request<close&&close<refresh,
   'Cerrar modal después de POST exitoso y antes de recargar');
 assert.match(flow,/notice\(message\+\(historialConfirmado/);
 assert.match(flow,/El pago fue confirmado, pero no se pudo refrescar/);
 assert.match(flow,/catch\(error\)\{[\s\S]*?housePaymentStatus/);
 assert.equal((flow.match(/request\('\/pagos-vivienda',payload\)/g)||[]).length,1);
});

test('Pago anual 2026 de vivienda al corriente hasta octubre solo cobra noviembre y diciembre',()=>{
 const cuotas=[{anio:2026,mes:'OCTUBRE',estatusPago:'PAGADO',montoPagado:300}];
 const plan=prepararDesdeHistorial({cuotas,anio:2026,mes:12,tarifa:300});
 assert.deepEqual(plan.periodos.map(p=>p.mes),['NOVIEMBRE','DICIEMBRE']);
 assert.equal(plan.meses,2);
 assert.equal(plan.montoSugerido,600);
 assert.equal(plan.fechaFinObjetivo,'2027-01-10');
 assert.equal(validarPagoAnual({pagoAnual:true,anio:2026,mes:12},{anioActual:2026}),true);
 assert.throws(()=>prepararDesdeHistorial({cuotas:[...cuotas,...plan.periodos.map(p=>({...p,estatusPago:'PAGADO',montoPagado:300}))],anio:2026,mes:12}),
  /ya está cubierto/);
});
test('Solo diciembre del año actual acepta el distintivo pago anual',()=>{
 assert.equal(validarPagoAnual({anio:2026,mes:12},{anioActual:2026}),false);
 assert.equal(validarPagoAnual({pagoAnual:false,anio:2026,mes:11},{anioActual:2026}),false);
 assert.throws(()=>validarPagoAnual({pagoAnual:true,anio:2026,mes:11},{anioActual:2026}),/diciembre/);
 assert.throws(()=>validarPagoAnual({pagoAnual:true,anio:2027,mes:12},{anioActual:2026}),/año actual/);
 assert.throws(()=>validarPagoAnual({pagoAnual:'true',anio:2026,mes:12},{anioActual:2026}),/inválido/);
});
test('El cierre anual se persiste en cuotas existentes sin SQL y preserva el flujo de éxito',()=>{
 const ctl=fs.readFileSync(path.resolve(__dirname,'../src/controllers/pagos-manuales-analisis.controller.js'),'utf8');
 const ui=fs.readFileSync(path.resolve(__dirname,'../../docs/assets/js/analisis-cuotas.js'),'utf8');
 const html=fs.readFileSync(path.resolve(__dirname,'../../docs/analisis-cuotas.html'),'utf8');
 assert.match(ctl,/origenImportacion:pagoAnual\?'MANUAL_ANALISIS_ANUAL'/);
 assert.match(ctl,/const pagoAnual=validarPagoAnual/);
 assert.match(ctl,/mesesEsperados!==plan.meses/);
 assert.match(ui,/pagoAnual:annualPaymentSelected/);
 assert.match(ui,/const refreshed=await load\(\)/);
 assert.match(ui,/historialConfirmado/);
 assert.match(html,/id="housePaymentAnnual"/);
 assert.match(html,/Pago anual/);
});

test('Los pagos manuales pueden aplicar el corte exacto sin importar una vigencia posterior',()=>{
 const ctl=fs.readFileSync(path.resolve(__dirname,'../src/controllers/pagos-manuales-analisis.controller.js'),'utf8');
 const worker=fs.readFileSync(path.resolve(__dirname,'../src/services/zkteco-vigencias.service.js'),'utf8');
 assert.doesNotMatch(ctl,/if\(!pagoAnual && tarjetas\.some/);
 assert.match(worker,/esLoteManualConfirmado\(event,fechaObjetivo,transaction\)/);
 assert.match(worker,/fechaObjetivo<fechaAntes && !loteManual/);
 assert.match(worker,/MANUAL_ANALISIS_ANUAL/);
});
