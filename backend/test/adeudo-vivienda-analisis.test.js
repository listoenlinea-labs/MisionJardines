'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {calcularAdeudoVivienda}=require('../src/services/adeudo-vivienda-analisis.service');
const agosto=[{anio:2026,mes:'AGOSTO',estatusPago:'PAGADO',montoPagado:300}];
const cobro=(mes,otros={})=>({anio:2026,mes,estatusPago:'PENDIENTE',montoPagado:0,...otros});
const calcular=(cuotas,anio=2026,mes=10,hoy='2026-10-14')=>
  calcularAdeudoVivienda(cuotas,{anio,mes,hoy});

test('Jardines 388: último agosto; septiembre y octubre $350 cada uno',()=>{
 const r=calcular(agosto);
 assert.deepEqual(r.ultimoMesPagado,{mes:'AGOSTO',anio:2026});
 assert.equal(r.mesesPendientes,2);
 assert.equal(r.recargosPendientes,100);
 assert.equal(r.saldoPendiente,700);
});
test('Antes de día 11, el mes actual no tiene recargo',()=>{
 assert.equal(calcular(agosto,2026,10,'2026-10-10').saldoPendiente,650);
 assert.equal(calcular(agosto,2026,10,'2026-10-11').saldoPendiente,700);
});
test('Mes ya pagado no se vuelve a cobrar',()=>{
 const r=calcular([...agosto,cobro('SEPTIEMBRE',{estatusPago:'PAGADO',montoPagado:350,montoCuota:350,recargo:50})]);
 assert.equal(r.saldoPendiente,350);
 assert.equal(r.ultimoMesPagado.mes,'SEPTIEMBRE');
});
test('Recargo persistido no se suma por segunda vez',()=>{
 assert.equal(calcular([...agosto,cobro('SEPTIEMBRE',{montoCuota:350,recargo:50,saldoPendiente:350})]).saldoPendiente,700);
});
test('Abono parcial descuenta principal sin perder recargo',()=>{
 const r=calcular([...agosto,cobro('SEPTIEMBRE',{estatusPago:'PAGO_PARCIAL',montoPagado:100,montoCuota:300,saldoPendiente:200})]);
 assert.equal(r.saldoPendiente,600);
});
test('Condonado y cancelado no se contabilizan; no se proyectan meses futuros',()=>{
 assert.equal(calcular([...agosto,cobro('SEPTIEMBRE',{estatusPago:'CONDONADO'})]).saldoPendiente,350);
 assert.equal(calcular([...agosto,cobro('SEPTIEMBRE',{estatusPago:'CANCELADO'})]).saldoPendiente,350);
 assert.equal(calcular(agosto,2027,1,'2026-10-14').saldoPendiente,700);
});
test('Corte anterior a septiembre 2026 no inventa mensualidades',()=>{
 assert.equal(calcular(agosto,2026,8,'2026-10-14').saldoPendiente,0);
});
test('Un último mes pagado adelantado cubre los cortes anteriores sin buscar huecos',()=>{
 const pagos=[...agosto,
  {anio:2026,mes:'OCTUBRE',estatusPago:'PAGADO',montoPagado:300},
  {anio:2026,mes:'DICIEMBRE',estatusPago:'PAGADO',montoPagado:300},
  {anio:2027,mes:'ENERO',estatusPago:'PAGADO',montoPagado:300}
 ];
 const r=calcular(pagos,2026,10);
 assert.deepEqual(r.ultimoMesPagado,{mes:'ENERO',anio:2027});
 assert.equal(r.saldoPendiente,0, 'El último corte pagado fija la cobertura');
 assert.equal(r.mesesPendientes,0);
});
test('Anticipos confirmados se distinguen de pendientes, parciales y condonados',()=>{
 const pagos=[...agosto,
  {anio:2027,mes:'FEBRERO',estatusPago:'PAGO_PARCIAL',montoPagado:100},
  {anio:2027,mes:'MARZO',estatusPago:'CONDONADO',montoPagado:300},
  {anio:2027,mes:'ABRIL',estatusPago:'PENDIENTE',montoPagado:0},
  {anio:2026,mes:'DICIEMBRE',estatusPago:'PAGADO',montoPagado:300}
 ];
 const r=calcular(pagos,2026,10);
 assert.deepEqual(r.ultimoMesPagado,{mes:'DICIEMBRE',anio:2026});
 assert.equal(r.saldoPendiente,0);
});
test('Vista y endpoint exhiben último pago y saldo acumulado sin editar cobros',()=>{
 const controller=fs.readFileSync(path.join(__dirname,'../src/controllers/finanzas.controller.js'),'utf8');
 const ui=fs.readFileSync(path.join(__dirname,'../../docs/assets/js/analisis-cuotas.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'../../docs/analisis-cuotas.html'),'utf8');
 assert.match(controller,/calcularAdeudoVivienda/);
 assert.match(controller,/historialCuotas/);
 assert.match(controller,/saldoPendiente:adeudo.saldoPendiente/);
 assert.match(html,/<th>Último mes pagado<\/th>/);
 assert.match(ui,/h.ultimoMesPagado/);
 assert.match(ui,/colspan="9"/);
});

test('Diciembre confirmado como anual se etiqueta sin inventar otros meses ni alterar deuda',()=>{
 const antes=[{anio:2026,mes:'OCTUBRE',estatusPago:'PAGADO',montoPagado:300}];
 const despues=[...antes,
  {anio:2026,mes:'NOVIEMBRE',estatusPago:'PAGADO',montoPagado:300,origenImportacion:'MANUAL_ANALISIS_ANUAL'},
  {anio:2026,mes:'DICIEMBRE',estatusPago:'PAGADO',montoPagado:300,origenImportacion:'MANUAL_ANALISIS_ANUAL'}];
 const a=calcular(antes), b=calcular(despues);
 assert.equal(a.ultimoMesPagado.mes,'OCTUBRE');
 assert.deepEqual(b.ultimoMesPagado,{mes:'DICIEMBRE',anio:2026,pagoAnual:true});
 assert.equal(b.saldoPendiente,a.saldoPendiente,'No modifica el saldo del período consultado octubre');
 const mensual=calcular([...antes,{...despues[2],origenImportacion:'MANUAL_ANALISIS'}]);
 assert.equal(mensual.ultimoMesPagado.pagoAnual,undefined,'Diciembre ordinario no se llama anual');
});
