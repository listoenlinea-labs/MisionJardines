'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'..');
const source=file=>fs.readFileSync(path.join(root,file),'utf8');
const historical=require('../backend/src/services/casa-club-historico-viviendas.service');
const cols=()=>{const x=Array(12).fill('');x[0]='No. CASA';x[1]='CALLE';x[5]='PAGO RECUPERACIÓN';x[11]='ESTATUS PAGO';return x;};
const row=(house,street,date,amount,folio,status='PAGADO')=>{
 const x=Array(12).fill('');x[0]=house;x[1]=street;x[4]=date;x[5]=amount;x[6]=folio;x[11]=status;x[3]='Octubre';return x;};
test('formatos de fecha distintos corresponden al mismo día y se muestran en español',()=>{
 assert.equal(historical.fechaISO('3 octubre, 2026'),'2026-10-03');
 assert.equal(historical.fechaISO('2026-10-03'),'2026-10-03');
 assert.equal(historical.fechaISO('03-OCT-2026'),'2026-10-03');
 assert.equal(historical.fechaLegible('2026-10-03'),'3 octubre, 2026');
});
test('duplicado mismo día, vivienda e importe se contabiliza una sola vez aunque folio cambie',()=>{
 const entries=[['CONTROL'],cols(),
 row(13,'Gardenias','3 octubre, 2026','$1,000','17'),
 row(13,'GARDENIAS','2026-10-03','$1,000','21'),
 row(13,'Gardenias','2026-11-03','$700','25'),
 row(14,'Gardenias','3 octubre, 2026','$250','22'),
 row(15,'Gardenias','2026-11-03','$700','26','CANCELADO')];
 const parsed=historical.extraerMovimientos(entries);
 assert.equal(parsed.payments.length,3);
 assert.equal(parsed.duplicados.length,1);
 assert.equal(parsed.duplicados[0].original,3);
 assert.equal(parsed.duplicados[0].fila,4);
 assert.equal(parsed.payments.reduce((s,x)=>s+x.monto,0),1950);
 assert.equal(parsed.excluded.length,1);
});
test('porcentajes de mantenimiento siempre cierran al cien con igual denominador',()=>{
 const paid=188,total=231;
 const pct=Math.round(paid*10000/total)/100;
 const rest=Math.round((100-pct)*100)/100;
 assert.equal(pct,81.39);
 assert.equal(rest,18.61);
 assert.equal(pct+rest,100);
});
test('hoja de Google sólo visible en Casa Club, y proyecto tiene editor de nombre',()=>{
 const ui=source('docs/assets/js/analisis-cuotas.js'),html=source('docs/analisis-cuotas.html');
 assert.match(ui,/sheets\.hidden=activeConcept!=='CASA_CLUB'/);
 assert.match(ui,/financialSummary/);
 assert.match(ui,/\['Sin pago registrado'/);
 assert.match(ui,/\['Total de cuotas recaudadas'/);
 assert.match(ui,/\['Con pago registrado',registered/);
 assert.match(html,/id="financeProjectRenameOpen"/);
 assert.match(html,/id="financeProjectRenameModal"/);
 assert.match(source('backend/src/routes/finanzas.routes.js'),/proyectos-extraordinarios\/:id\/nombre/);
});
test('el modal Club es independiente y soporta conceptos reales auditados',()=>{
 const html=source('docs/analisis-cuotas.html');
 const ui=source('docs/assets/js/finanzas-casa-club-conceptos.js');
 const controller=source('backend/src/controllers/casa-club-egresos.controller.js');
 assert.match(html,/id="financeClubExpenseEntry"/);
 assert.match(html,/id="financeClubExpenseOpen"/);
 assert.match(html,/id="financeClubExpenseDelete"/);
 assert.match(ui,/comprobante/);
 assert.match(ui,/\/egresos\/.*\/casa-club/);
 assert.match(controller,/EDITAR_CONCEPTO_CASA_CLUB/);
 assert.match(controller,/ELIMINAR_CONCEPTO_CASA_CLUB/);
});
test('los fondos del plan distinguen mensualidad, proyecto y Google sin conciliación',()=>{
 const ui=source('docs/assets/js/finanzas-plan.js');
 const server=source('backend/src/controllers/finanzas-plan.controller.js');
 assert.match(ui,/ingresosMantenimientoCalles\?\.mes/);
 assert.match(server,/ingresosMantenimientoCalles\?\.mes/);
 assert.match(ui,/selected\?\.id/);
 assert.match(ui,/projectFilterId/);
 assert.match(ui,/sinConciliar:annualClub/);
 assert.match(ui,/Elige primero una fuente concreta/);
 assert.match(ui,/fplanSourceDetail/);
 assert.match(server,/clubAllocated/);
});
