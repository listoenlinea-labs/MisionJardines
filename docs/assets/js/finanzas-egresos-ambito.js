(function(root){
 'use strict';
 // Cada área financiera es independiente. Los presupuestos históricos de
 // PROYECTO/PROYECTOS no son egresos ordinarios de mantenimiento ni Casa Club.
 const categoriasDeProyecto=new Set(['PROYECTO','PROYECTOS','CUOTA_EXTRAORDINARIA']);
 const categoriaDeProyecto=category=>categoriasDeProyecto.has(String(category||'').trim().toUpperCase());
 // Permite revisar los proyectos en la tabla de Mantenimiento SIN sumarlos al
 // ámbito contable. Se utilizan solo egresos del período servido por la API.
 const esMovimientoDeProyecto=e=>Boolean(e&&(
  categoriaDeProyecto(e.categoria)||e.ambito==='EXTRAORDINARIO'||
  (Number.isSafeInteger(Number(e.proyectoId))&&Number(e.proyectoId)>0)));

 function egresosDelAmbito(data,ambito,proyectoId,categoriaFiltro=''){
  if(ambito==='EXTRAORDINARIO'){
   const id=Number(proyectoId);
   const proyecto=Number.isSafeInteger(id)&&id>0?
    (data?.proyectosExtraordinarios||[]).find(p=>Number(p.id)===id):null;
   // Gastos efectivamente asentados en el proyecto, nunca la meta presupuestada.
   const egresos=(proyecto?.gastosConceptos||[]).map(e=>({
    ...e,ambito:'EXTRAORDINARIO',categoria:'PROYECTO',proyectoId:id
   }));
   return {proyecto:proyecto||null,egresos};
  }
  if(!['MANTENIMIENTO','CASA_CLUB'].includes(ambito))
   return {proyecto:null,egresos:[]};
  // Vista de SOLO lectura en la pestaña Mantenimiento, activada explícitamente
  // con el filtro «Proyectos». «Todas» nunca mezcla estos movimientos.
  if(ambito==='MANTENIMIENTO'&&categoriaFiltro==='PROYECTO')
   return {proyecto:null,egresos:(data?.egresos||[]).filter(esMovimientoDeProyecto)};
  const egresos=(data?.egresos||[]).filter(e=>
   e.ambito===ambito&&!esMovimientoDeProyecto(e));
  return {proyecto:null,egresos};
 }
 const api={egresosDelAmbito,categoriaDeProyecto,esMovimientoDeProyecto};
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.MJExpenseScope=api;
})(typeof window==='undefined'?globalThis:window);
