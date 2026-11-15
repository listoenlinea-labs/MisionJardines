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
  // "Incluido en presupuesto" y "Ya pagado" son independientes:
  // un concepto incluido no aumenta el costo total; solo uno pagado reduce
  // lo que resta por desembolsar. Los adicionales sí aumentan el compromiso.
  const pagados=gastos.filter(x=>x.pagado!==false).reduce((s,x)=>s+amount(x.monto),0);
  const pendientes=gastos.filter(x=>x.pagado===false).reduce((s,x)=>s+amount(x.monto),0);
  const costoComprometido=presupuesto+adicionales;
  const ingresos=amount(project.recaudado);
  const presupuestoRestante=Math.max(0,costoComprometido-pagados);
  return {presupuesto,gastosReales:reales,incluidos,adicionales,
   costoComprometido,pagados,pendientes,presupuestoRestante,
   fondosDisponibles:ingresos-pagados,
   ingresos,diferencia:ingresos-costoComprometido,
   porJustificar:Math.max(0,presupuesto-incluidos)};
 }
 const api={resumen};
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.MJCostosProyecto=api;
})(typeof window==='undefined'?globalThis:window);
