'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {resumenConceptos}=require('../backend/src/services/resumen-conceptos-analisis.service');
const {resumenAutorizaciones}=require('../backend/src/services/casa-club-autorizaciones-finanzas.service');
const casa={casaId:25};
const reserva=(id,overrides={})=>({
 id,casaId:25,estatus:'APROBADA',fecha:'2026-12-24',
 fechaLimitePago:'2026-12-23',actualizadoEn:'2026-11-16T10:00:00.000Z',
 cuotaRecuperacion:1000,depositoGarantia:700,limpieza:300,pagado:false,
 ...overrides
});
const detail=(reservas,mes=11,flag=true)=>resumenConceptos({
 viviendas:[casa],cargos:[],reportados:[],manuales:[],aportaciones:[],
 reservas,anio:2026,mes,aprobacionCuentaComoPagoVisual:flag
}).CASA_CLUB[0];
test('APROBADA sin comprobante muestra PAGADO con marca administrativa pero sin dinero bancario',()=>{
 const x=detail([reserva(1)]);
 assert.equal(x.estatus,'PAGADO');
 assert.equal(x.saldoPendiente,0);
 assert.equal(x.montoAutorizado,1000);
 assert.equal(x.limpiezaAsignada,300);
 assert.equal(x.garantiaReembolsable,700);
 assert.equal(x.autorizacionSinAcreditar,true);
 assert.equal(x.montoPagado,0);
});
test('el mes de autorización permite visualizar futura reserva, sin adelantar el flujo financiero mensual',()=>{
 const r=reserva(2);
 assert.equal(detail([r],11).estatus,'PAGADO');
 const totals=resumenAutorizaciones({reservas:[r],anio:2026,mes:11});
 assert.equal(totals.ingresosAutorizadosVigentes,1000);
 assert.equal(totals.limpiezaComprometidaVigente,300);
 assert.equal(totals.ingresosAutorizados,0);
 assert.equal(totals.ingresosNoAcreditadosVigentes,1000);
 assert.equal(totals.garantiasComprometidasVigentes,700);
 const dec=resumenAutorizaciones({reservas:[r],anio:2026,mes:12});
 assert.equal(dec.ingresosAutorizados,1000);
 assert.equal(dec.limpiezaAutorizada,300);
 assert.equal(dec.aprobadas,1);
});
test('no duplicar reservas, excluir rechazadas y no sumar garantías como ingresos',()=>{
 const r=reserva(7,{fecha:'2026-11-22',fechaLimitePago:'2026-11-21'});
 const totals=resumenAutorizaciones({reservas:[r,r,reserva(8,{estatus:'RECHAZADA'})],anio:2026,mes:11});
 assert.equal(totals.aprobadasVigentes,1);
 assert.equal(totals.ingresosAutorizadosVigentes,1000);
 assert.equal(totals.limpiezaComprometidaVigente,300);
 assert.equal(totals.garantiasComprometidasVigentes,700);
});
test('un pago verificado permanece separado de la autorización visual',()=>{
 const r=reserva(3,{pagado:true,fecha:'2026-11-25',fechaLimitePago:'2026-11-24'});
 const row=detail([r]);
 assert.equal(row.montoPagado,2000);
 assert.equal(row.autorizacionSinAcreditar,false);
 const totals=resumenAutorizaciones({reservas:[r],anio:2026,mes:11});
 assert.equal(totals.ingresosConAcreditacion,1000);
 assert.equal(totals.ingresosNoAcreditados,0);
});
test('sin el flag, se conserva el criterio original de pago bancario',()=>{
 const r=reserva(4,{fecha:'2026-11-25',fechaLimitePago:'2026-11-24'});
 assert.equal(detail([r],11,false).estatus,'PENDIENTE');
});
test('UI elimina la tarjeta antigua, muestra fuentes diferenciadas y estado Drive visible',()=>{
 const js=fs.readFileSync(path.join(__dirname,'../docs/assets/js/analisis-cuotas.js'),'utf8');
 const html=fs.readFileSync(path.join(__dirname,'../docs/analisis-cuotas.html'),'utf8');
 const chart=fs.readFileSync(path.join(__dirname,'../docs/assets/js/finanzas-ambitos-vista.js'),'utf8');
 assert.doesNotMatch(js,/Reservas pagadas en MySQL/);
 assert.match(js,/Recuperación autorizada · vigente/);
 assert.match(js,/Recuperación cobrada \(MySQL\)/);
 assert.match(js,/Google Drive · respaldos:/);
 assert.match(js,/mj_casa_club_aprobacion_revision/);
 assert.match(html,/id="financeSheetsState"/);
 assert.match(html,/id="financeDriveState"/);
 assert.match(chart,/Recuperación autorizada/);
});
