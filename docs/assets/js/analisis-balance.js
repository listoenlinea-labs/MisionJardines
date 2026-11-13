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
  const income=centavos(project.recaudado),expense=centavos(project.egresosReales),diff=income-expense;
  return {tipo:'EXTRAORDINARIO',ingresos:income/100,egresos:expense/100,
   diferencia:diff/100,estado:clasificar(diff),
   criterio:'Aportaciones acumuladas menos gastos efectivamente registrados de este proyecto. El presupuesto se muestra por separado.'};
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
