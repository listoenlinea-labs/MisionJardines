(function(root){
 'use strict';
 const amount=v=>Math.round(Number(v||0));
 function resumen(project){
  if(!project)return null;
  const presupuesto=amount(project.presupuestoBase??project.totalEsperado);
  const gastos=Array.isArray(project.gastosConceptos)?project.gastosConceptos:[];
  const incluidos=gastos.filter(x=>x.incluidoPresupuesto!==false).reduce((s,x)=>s+amount(x.monto),0);
  const adicionales=gastos.filter(x=>x.incluidoPresupuesto===false).reduce((s,x)=>s+amount(x.monto),0);
  const reales=incluidos+adicionales;
  return {presupuesto,gastosReales:reales,incluidos,adicionales,
   costoComprometido:presupuesto+adicionales,
   ingresos:amount(project.recaudado),
   diferencia:amount(project.recaudado)-presupuesto-adicionales,
   porJustificar:Math.max(0,presupuesto-incluidos)};
 }
 const api={resumen};
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.MJCostosProyecto=api;
})(typeof window==='undefined'?globalThis:window);
