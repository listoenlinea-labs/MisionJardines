(function(root){
 'use strict';
 const centavos=value=>Math.round(Number(value||0)*100);
 const importe=value=>centavos(value)/100;
 function clasificar(diferencia){
  return diferencia>0?'SALDO_A_FAVOR':diferencia<0?'SALDO_EN_CONTRA':'EN_EQUILIBRIO';
 }
 // Solo cuotas cubiertas en el mes y gastos imputados a mantenimiento.
 function mensual(data){
  const ingresos=data?.ingresosMantenimientoCalles?.mes;
  const egresos=data?.finanzasAmbitos?.MANTENIMIENTO?.egresos ?? data?.egresosPorConcepto?.mes;
  if(ingresos==null||egresos==null||
   !Number.isFinite(Number(ingresos))||!Number.isFinite(Number(egresos)))return null;
  const income=centavos(ingresos),expense=centavos(egresos),diff=income-expense;
  return {tipo:'MANTENIMIENTO',ingresos:income/100,egresos:expense/100,
   diferencia:diff/100,estado:clasificar(diff),
   criterio:'Cuotas del mes cubierto menos egresos del mismo mes, únicamente de mantenimiento; no representa el saldo bancario.'};
 }
 // Los presupuestos no equivalen a dinero gastado. Comparar con egresos REALES.
 function proyecto(project){
  if(!project)return null;
  const income=centavos(project.recaudado),expense=centavos(project.egresosComprometidos??project.totalEsperado),diff=income-expense;
  // Evitar descontar dos veces lo pagado: reducir en la misma cantidad los
  // fondos disponibles y el presupuesto pendiente mantiene el faltante real.
  const tienePagos=project.gastosPagados!=null||project.presupuestoRestante!=null;
  const paid=tienePagos?centavos(project.gastosPagados):0;
  const available=income-paid;
  const remaining=tienePagos?Math.max(0,expense-paid):expense;
  return {tipo:'EXTRAORDINARIO',ingresos:available/100,egresos:remaining/100,
   recaudado:income/100,pagado:paid/100,
   diferencia:diff/100,estado:clasificar(diff),
   criterio:tienePagos?
    'Recaudado menos gastos pagados = fondos disponibles. Costo comprometido menos gastos pagados = presupuesto pendiente. El faltante a financiar se mantiene consistente, sin descontar dos veces el mismo gasto; no equivale al saldo bancario.':
    'Balance presupuestario: aportaciones acumuladas menos presupuesto base y costos adicionales; los gastos incluidos no se suman dos veces. No equivale al saldo bancario.'};
 }
 // Las garantías reembolsables del club no se consideran ingresos operativos.
 function casaClub(scope){
  if(!scope)return null;
  const income=centavos(scope.ingresos),expense=centavos(scope.egresos),diff=income-expense;
  return {tipo:'CASA_CLUB',ingresos:income/100,egresos:expense/100,
   diferencia:diff/100,estado:clasificar(diff),
   criterio:'Recuperación y limpieza cobradas menos gastos registrados de Casa Club en el período, excluyendo garantías.'};
 }
 const api={mensual,proyecto,casaClub,clasificar,importe};
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.MJFinanceBalance=api;
})(typeof window==='undefined'?globalThis:window);
