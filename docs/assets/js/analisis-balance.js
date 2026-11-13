(function(root){
 'use strict';
 const centavos=value=>Math.round(Number(value||0)*100);
 const importe=value=>centavos(value)/100;
 function clasificar(diferencia){
  return diferencia>0?'SALDO_A_FAVOR':diferencia<0?'SALDO_EN_CONTRA':'EN_EQUILIBRIO';
 }
 // El balance informativo coincide exactamente con las dos gráficas visibles:
 // cuotas de mantenimiento por mes CUBIERTO menos egresos del mes seleccionado.
 // Es distinto al flujo de caja por FECHA DE COBRO del servidor.
 function mensual(data){
  const ingresos=data?.ingresosMantenimientoCalles?.mes;
  const egresos=data?.finanzasAmbitos?.MANTENIMIENTO?.egresos ?? data?.egresosPorConcepto?.mes;
  if(!Number.isFinite(Number(ingresos))||!Number.isFinite(Number(egresos))||
   ingresos==null||egresos==null)return null;
  const ingresosCentavos=centavos(ingresos),egresosCentavos=centavos(egresos);
  const diferenciaCentavos=ingresosCentavos-egresosCentavos;
  return {
   tipo:'MANTENIMIENTO',ingresos:ingresosCentavos/100,egresos:egresosCentavos/100,
   diferencia:diferenciaCentavos/100,estado:clasificar(diferenciaCentavos),
   criterio:'Cuotas atribuidas al mes cubierto menos egresos del mismo mes; no representa el saldo bancario.'
  };
 }
 // En extraordinarias NO hay egresos atribuidos a cada proyecto en la BD.
 // Comparar las aportaciones con la meta es útil, pero no es balance de caja.
 function proyecto(project){
   if(!project)return null;
   const ingresosCentavos=centavos(project.recaudado);
   const egresosCentavos=centavos(project.egresosReales);
   const diferenciaCentavos=ingresosCentavos-egresosCentavos;
   return {
    tipo:'EXTRAORDINARIO',ingresos:ingresosCentavos/100,egresos:egresosCentavos/100,
    diferencia:diferenciaCentavos/100,estado:clasificar(diferenciaCentavos),
    criterio:'Aportaciones acumuladas menos gastos efectivamente registrados de este proyecto. El presupuesto se muestra por separado.'
   };
  }
  function casaClub(scope){
   if(!scope)return null;
   const ingresosCentavos=centavos(scope.ingresos);
   const egresosCentavos=centavos(scope.egresos);
   const diferenciaCentavos=ingresosCentavos-egresosCentavos;
   return {tipo:'CASA_CLUB',ingresos:ingresosCentavos/100,egresos:egresosCentavos/100,
    diferencia:diferenciaCentavos/100,estado:clasificar(diferenciaCentavos),
    criterio:'Cuotas de recuperación y limpieza recibidas menos gastos de Casa Club del período; no se contabilizan garantías como ingreso.'};
  };
 }
 const api={mensual,proyecto,casaClub,clasificar,importe};
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.MJFinanceBalance=api;
})(typeof window==='undefined'?globalThis:window);
