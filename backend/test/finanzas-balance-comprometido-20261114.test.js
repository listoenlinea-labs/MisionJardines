'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {resumen}=require('../../docs/assets/js/costos-presupuesto-proyecto.js');
const balance=require('../../docs/assets/js/analisis-balance.js');
const view=fs.readFileSync(path.resolve(__dirname,'../../docs/assets/js/finanzas-ambitos-vista.js'),'utf8');
const html=fs.readFileSync(path.resolve(__dirname,'../../docs/analisis-cuotas.html'),'utf8');

test('Tarjeta central: $62,700 - $138,600 = -$75,900; tarjeta derecha $109,300',()=>{
 const p={presupuestoBase:138600,recaudado:62700,gastosConceptos:[
  {monto:29300,incluidoPresupuesto:true,pagado:true}]};
 const costs=resumen(p);
 const b=balance.proyecto({...p,egresosComprometidos:costs.costoComprometido,gastosPagados:costs.pagados,presupuestoRestante:costs.presupuestoRestante});
 assert.equal(b.ingresos,62700);
 assert.equal(b.egresos,138600);
 assert.equal(b.diferencia,-75900);
 assert.equal(b.estado,'SALDO_EN_CONTRA');
 assert.equal(costs.presupuestoRestante,109300);
 assert.equal(costs.fondosDisponibles,33400);
});

test('Pagar un concepto incluido NO altera los totales de la tarjeta central',()=>{
 const p={presupuestoBase:138600,recaudado:62700};
 const sinPagar=resumen({...p,gastosConceptos:[{monto:29300,incluidoPresupuesto:true,pagado:false}]});
 const pagado=resumen({...p,gastosConceptos:[{monto:29300,incluidoPresupuesto:true,pagado:true}]});
 for(const c of [sinPagar,pagado]){
  const b=balance.proyecto({...p,egresosComprometidos:c.costoComprometido,gastosPagados:c.pagados});
  assert.equal(b.ingresos,62700);
  assert.equal(b.egresos,138600);
  assert.equal(b.diferencia,-75900);
 }
 assert.equal(sinPagar.presupuestoRestante,138600);
 assert.equal(pagado.presupuestoRestante,109300);
});

test('Adicionales sí aumentan el egreso una vez, los incluidos no',()=>{
 const p={presupuestoBase:138600,recaudado:62700,gastosConceptos:[
  {monto:29300,incluidoPresupuesto:true,pagado:true},
  {monto:6000,incluidoPresupuesto:false,pagado:true},
  {monto:5000,incluidoPresupuesto:false,pagado:false}]};
 const c=resumen(p);
 const b=balance.proyecto({...p,egresosComprometidos:c.costoComprometido,gastosPagados:c.pagados});
 assert.equal(c.costoComprometido,149600);
 assert.equal(b.ingresos,62700);
 assert.equal(b.egresos,149600);
 assert.equal(b.diferencia,-86900);
 assert.equal(c.presupuestoRestante,114300);
});

test('UI central rotula Ingresos / Egresos, sin tocar el pie de presupuesto restante',()=>{
 assert.match(view,/financeBalanceExpenseLabel'\)\.textContent='Egresos'/);
 assert.match(view,/document\.createTextNode\('Ingresos'\)/);
 assert.match(view,/financeBalanceSubtitle'\)\.textContent=project\?'Proyecto · Ingresos menos egresos comprometidos'/);
 assert.match(view,/expenseFooter=Number\(costos\?\.presupuestoRestante/);
 assert.match(view,/project\?'Presupuesto restante por pagar':'Total de egresos'/);
 assert.match(html,/analisis-balance\.js\?v=20261114-balance-comprometido-v2/);
 assert.match(html,/finanzas-ambitos-vista\.js\?v=20261114-balance-comprometido-v2/);
});
