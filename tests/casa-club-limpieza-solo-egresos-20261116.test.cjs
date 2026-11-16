'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {resumenEgresosCasaClub}=require('../docs/assets/js/finanzas-ambitos-vista.js');
const {casaClub}=require('../docs/assets/js/analisis-balance.js');

const diferencia=(ingresos,desglose)=>casaClub({ingresos,egresos:desglose.otros});

test('limpieza prevista se muestra en Egresos, pero no se descuenta de la tarjeta central',()=>{
 const gasto=resumenEgresosCasaClub([],8400);
 assert.equal(gasto.limpiezaPendiente,8400);
 assert.equal(gasto.total,8400); // Tarjeta derecha
 assert.equal(gasto.otros,0); // Tarjeta central
 const balance=diferencia(24550,gasto);
 assert.equal(balance.egresos,0);
 assert.equal(balance.diferencia,24550);
});

test('registrar limpieza reemplaza la provisión y sigue sin afectar la diferencia',()=>{
 const gasto=resumenEgresosCasaClub([
  {concepto:'Limpieza de Casa Club',categoria:'SERVICIOS',monto:300,pagado:true},
  {concepto:'Servicio de aseo del salón',categoria:'OTROS',monto:500,pagado:false}
 ],8400);
 assert.equal(gasto.limpiezaRegistrada,800);
 assert.equal(gasto.limpiezaPendiente,7600);
 assert.equal(gasto.total,8400);
 assert.equal(gasto.otros,0);
 assert.equal(diferencia(24550,gasto).diferencia,24550);
});

test('únicamente los conceptos ajenos a limpieza, pagados o pendientes, se restan',()=>{
 const gasto=resumenEgresosCasaClub([
  {concepto:'Limpieza salón',categoria:'SERVICIOS',monto:300,pagado:true},
  {concepto:'Aseo general',categoria:'OTROS',monto:500,pagado:true},
  {concepto:'Reparación de luminarias',categoria:'MANTENIMIENTO',monto:1500,pagado:true},
  {concepto:'Pintura de puertas',categoria:'OTROS',monto:500,pagado:false},
  {concepto:'Material',categoria:'LIMPIEZA',monto:100,pagado:true}
 ],8400);
 assert.equal(gasto.limpiezaRegistrada,900);
 assert.equal(gasto.limpiezaPendiente,7500);
 assert.equal(gasto.otros,2000);
 assert.equal(gasto.total,10400);
 assert.equal(diferencia(24550,gasto).diferencia,22550);
});

test('la interfaz comunica que limpieza es informativa y excluye su importe del balance',()=>{
 const source=fs.readFileSync(path.join(__dirname,'../docs/assets/js/finanzas-ambitos-vista.js'),'utf8');
 assert.match(source,/egresos:window\.MJClubAnnualExpense\?\.otros\?\?0/);
 assert.match(source,/Egresos sin limpieza/);
 assert.match(source,/La limpieza registrada o prevista se muestra exclusivamente en Egresos/);
 assert.match(source,/Total de egresos sin limpieza/);
 assert.match(source,/expenseFooter=expense\.otros/);
 assert.match(source,/Casa Club · gastos registrados/);
 assert.match(source,/Limpieza prevista sin registrar · informativa/);
});


test('el total de Egresos excluye limpieza sin ocultar otros gastos registrados',()=>{
 const gasto=resumenEgresosCasaClub([
  {concepto:'Limpieza del salón',categoria:'SERVICIOS',monto:800,pagado:true},
  {concepto:'Reparación de techo',categoria:'MANTENIMIENTO',monto:1200,pagado:true},
  {concepto:'Pintura de muros',categoria:'OTROS',monto:300,pagado:false}
 ],8400);
 assert.equal(gasto.limpiezaRegistrada,800);
 assert.equal(gasto.limpiezaPendiente,7600);
 assert.equal(gasto.total,9900); // Sólo desglose informativo, NO total visual
 assert.equal(gasto.otros,1500); // Total visible en la tarjeta derecha
 assert.equal(diferencia(24550,gasto).diferencia,23050);
});
