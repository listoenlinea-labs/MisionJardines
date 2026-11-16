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
 // El saldo compara aportaciones con conceptos reales, no contra la meta estimada.
 function proyecto(project){
  if(!project)return null;
  const income=centavos(project.recaudado);
  const expense=centavos(project.egresosReales??(project.gastosConceptos||[]).reduce((s,c)=>s+Number(c.monto||0),0));
  const diff=income-expense;
  return {tipo:'EXTRAORDINARIO',ingresos:income/100,egresos:expense/100,
   diferencia:diff/100,estado:clasificar(diff),
   criterio:'Aportaciones acumuladas menos conceptos de gasto realmente registrados. La meta estimada no se considera gasto. No equivale al saldo bancario.'};
 }
 // Las garantías reembolsables del club no se consideran ingresos operativos.
 function casaClub(scope){
  if(!scope)return null;
  const income=centavos(scope.ingresos),expense=centavos(scope.egresos),diff=income-expense;
  return {tipo:'CASA_CLUB',ingresos:income/100,egresos:expense/100,
   diferencia:diff/100,estado:clasificar(diff),
   criterio:scope.criterioHistorico||'Sólo recuperación cobrada menos gastos registrados y limpieza prevista no registrada (para no duplicarla). Garantías reembolsables excluidas; no equivale a saldo bancario.'};
 }
 const api={mensual,proyecto,casaClub,clasificar,importe};
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.MJFinanceBalance=api;
})(typeof window==='undefined'?globalThis:window);
