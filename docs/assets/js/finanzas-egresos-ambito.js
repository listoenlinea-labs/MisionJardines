(function(root){
 'use strict';
 // Cada área financiera es independiente. Los presupuestos históricos de
 // PROYECTO/PROYECTOS no son egresos ordinarios de mantenimiento ni Casa Club.
 const categoriasDeProyecto=new Set(['PROYECTO','PROYECTOS','CUOTA_EXTRAORDINARIA']);
 const categoriaDeProyecto=category=>categoriasDeProyecto.has(String(category||'').trim().toUpperCase());

 function egresosDelAmbito(data,ambito,proyectoId){
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
  const egresos=(data?.egresos||[]).filter(e=>
   e.ambito===ambito&&!categoriaDeProyecto(e.categoria)&&!e.proyectoId);
  return {proyecto:null,egresos};
 }
 const api={egresosDelAmbito,categoriaDeProyecto};
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.MJExpenseScope=api;
})(typeof window==='undefined'?globalThis:window);
