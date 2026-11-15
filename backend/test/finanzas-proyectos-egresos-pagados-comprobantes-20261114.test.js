'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const {resumen}=require(path.join(root,'docs/assets/js/costos-presupuesto-proyecto.js'));
const balance=require(path.join(root,'docs/assets/js/analisis-balance.js'));
const html=fs.readFileSync(path.join(root,'docs/analisis-cuotas.html'),'utf8');
const view=fs.readFileSync(path.join(root,'docs/assets/js/finanzas-ambitos-vista.js'),'utf8');
const script=fs.readFileSync(path.join(root,'docs/assets/js/analisis-cuotas.js'),'utf8');
const controller=fs.readFileSync(path.join(root,'backend/src/controllers/finanzas.controller.js'),'utf8');
const routes=fs.readFileSync(path.join(root,'backend/src/routes/finanzas.routes.js'),'utf8');
const schema=fs.readFileSync(path.join(root,'backend/src/services/finanzas-schema.service.js'),'utf8');

test('Ejemplo del barandal: 138600 menos 29300 pagados = 109300 restantes',()=>{
 const p={presupuestoBase:138600,recaudado:62700,gastosConceptos:[
  {monto:29300,incluidoPresupuesto:true,pagado:true}]};
 const c=resumen(p);
 assert.equal(c.presupuesto,138600);
 assert.equal(c.gastosReales,29300);
 assert.equal(c.costoComprometido,138600);
 assert.equal(c.pagados,29300);
 assert.equal(c.presupuestoRestante,109300);
 assert.equal(c.fondosDisponibles,33400);
 const b=balance.proyecto({...p,egresosComprometidos:c.costoComprometido,gastosPagados:c.pagados});
 assert.equal(b.ingresos,33400);
 assert.equal(b.egresos,109300);
 assert.equal(b.diferencia,-75900); // sin duplicar el gasto en ambos lados
 assert.equal(b.estado,'SALDO_EN_CONTRA');
});

test('Los conceptos pendientes no restan del presupuesto hasta que se pagan',()=>{
 const p={presupuestoBase:138600,recaudado:62700,gastosConceptos:[
  {monto:29300,incluidoPresupuesto:true,pagado:false}]};
 const c=resumen(p);
 assert.equal(c.gastosReales,29300);
 assert.equal(c.pagados,0);
 assert.equal(c.pendientes,29300);
 assert.equal(c.presupuestoRestante,138600);
});

test('Adicional pagado eleva el compromiso una vez; incluido pagado no lo eleva',()=>{
 const c=resumen({presupuestoBase:138600,recaudado:62700,gastosConceptos:[
  {monto:29300,incluidoPresupuesto:true,pagado:true},
  {monto:6000,incluidoPresupuesto:false,pagado:true},
  {monto:5000,incluidoPresupuesto:false,pagado:false}]});
 assert.equal(c.costoComprometido,149600);
 assert.equal(c.pagados,35300);
 assert.equal(c.pendientes,5000);
 assert.equal(c.presupuestoRestante,114300);
 assert.equal(c.fondosDisponibles,27400);
 assert.equal(c.diferencia,-86900);
});

test('UI: casillas independientes y marcadas por defecto, carga posterior del comprobante',()=>{
 for(const id of ['financeProjectExpenseIncluded','financeProjectExpensePaid'])
  assert.match(html,new RegExp('id="'+id+'"[^>]*checked'));
 for(const id of ['financeProjectProofUploadFile','financeProjectProofUploadSave',
  'financeProjectProofPaid','financeProjectProofPaymentSave'])
  assert.ok(html.includes('id="'+id+'"'));
 assert.match(html,/\.pdf,\.png,\.jpg,\.jpeg/);
 assert.match(script,/pagado:\$\('financeProjectExpensePaid'\)\.checked/);
 assert.match(script,/encodeProjectExpenseFile\(file\)/);
 assert.match(script,/\/egresos\/'\+id\+'\/comprobante'/);
 assert.match(script,/\/egresos\/'\+id\+'\/pagado'/);
 assert.match(view,/Presupuesto restante por pagar/);
 assert.match(view,/presupuestoRestante/);
});

test('Backend: endpoints autenticados, estado auditado y migración compatible',()=>{
 assert.match(routes,/router\.use\(autenticarToken,autorizarRoles\('SUPER_ADMIN','ADMINISTRADOR'\)\)/);
 assert.match(routes,/router\.patch\('\/egresos\/:id\/pagado',controller\.actualizarPagoEgreso\)/);
 assert.match(routes,/router\.put\('\/egresos\/:id\/comprobante',controller\.adjuntarComprobanteEgreso\)/);
 assert.match(controller,/async function actualizarPagoEgreso/);
 assert.match(controller,/async function adjuntarComprobanteEgreso/);
 assert.match(controller,/archivosEgresos\.guardar\(req\.body\.comprobante\)/);
 assert.match(schema,/if\(!names\.has\('pagado'\)\)/);
 assert.match(schema,/ADD COLUMN pagado TINYINT\(1\) NOT NULL DEFAULT 1/);
});

test('No se alteran pagos de mantenimiento ni la lógica de reservar Casa Club',()=>{
 assert.match(controller,/ambito:'EXTRAORDINARIO'/);
 assert.match(controller,/row\.categoria!=='PROYECTO'/);
 assert.doesNotMatch(script,/window\.MJFinanceAmbitosUI\.guardarPagoBancario/);
});
