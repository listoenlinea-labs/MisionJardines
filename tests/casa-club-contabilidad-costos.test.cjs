'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {resumenFinancieroClub}=require('../backend/src/services/casa-club-contabilidad-costos.service');
const {resumenAutorizaciones}=require('../backend/src/services/casa-club-autorizaciones-finanzas.service');
const paid=(id,overrides={})=>({
 id,pagado:true,cuotaRecuperacion:1000,depositoGarantia:700,limpieza:300,
 garantiaDevuelta:false,...overrides
});
test('dos reservas pagadas: $2,000 recuperación, $600 limpieza y $1,400 garantía',()=>{
 const result=resumenFinancieroClub({reservasPagadas:[paid(1),paid(2)],egresos:[]});
 assert.equal(result.ingresos,2000);
 assert.equal(result.egresos,600);
 assert.equal(result.diferencia,1400);
 assert.equal(result.garantiasRecibidas,1400);
 assert.equal(result.garantiasPorDevolver,1400);
 assert.equal(result.limpiezaPorProvisionar,600);
});
test('un gasto real de limpieza evita provisión doble',()=>{
 const result=resumenFinancieroClub({reservasPagadas:[paid(1),paid(2)],
  egresos:[{concepto:'Servicio de limpieza Casa Club',categoria:'SERVICIOS',monto:600}]});
 assert.equal(result.egresos,600);
 assert.equal(result.limpiezaRegistrada,600);
 assert.equal(result.limpiezaPorProvisionar,0);
 assert.equal(result.diferencia,1400);
});
test('si ya se registró parte de la limpieza, sólo se provisiona la diferencia',()=>{
 const result=resumenFinancieroClub({reservasPagadas:[paid(1),paid(2)],
  egresos:[{concepto:'Limpieza de salón',categoria:'OTROS',monto:200}]});
 assert.equal(result.limpiezaPorProvisionar,400);
 assert.equal(result.egresos,600);
});
test('los gastos ajenos a limpieza se muestran sin ocultarlos',()=>{
 const result=resumenFinancieroClub({reservasPagadas:[paid(1)],
  egresos:[{concepto:'Reparación de ventanas',categoria:'MANTENIMIENTO',monto:150}]});
 assert.equal(result.egresos,450);
 assert.equal(result.ingresos,1000);
});
test('se respeta el importe histórico guardado sin imponer tarifas de 2026 a meses anteriores',()=>{
 const result=resumenFinancieroClub({reservasPagadas:[paid(3,{cuotaRecuperacion:700,limpieza:0,depositoGarantia:250})]});
 assert.equal(result.ingresos,700);
 assert.equal(result.egresos,0);
 assert.equal(result.garantiasPorDevolver,250);
});
test('la garantía devuelta no se convierte en un egreso operativo',()=>{
 const result=resumenFinancieroClub({reservasPagadas:[paid(1,{garantiaDevuelta:true})]});
 assert.equal(result.ingresos,1000);
 assert.equal(result.garantiasDevueltas,700);
 assert.equal(result.garantiasPorDevolver,0);
});
test('el compromiso autorizado cuenta solamente recuperación y no implica cobro',()=>{
 const reserva={...paid(1,{pagado:false}),estatus:'APROBADA',fecha:'2026-11-25',fechaLimitePago:'2026-11-24'};
 const result=resumenAutorizaciones({reservas:[reserva],anio:2026,mes:11});
 assert.equal(result.ingresosAutorizados,1000);
 assert.equal(result.limpiezaAutorizada,300);
 assert.equal(result.garantiasComprometidas,700);
 assert.equal(result.ingresosNoAcreditados,1000);
});
