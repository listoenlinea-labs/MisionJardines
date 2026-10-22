'use strict';
// Orden exclusivamente de consulta: no escribe TAGs ni toca el controlador.
// zk_tarjetas tiene timestamps:false: el ID creciente indica el orden de
// incorporación LOCAL, no necesariamente la fecha de alta física en C3.
// ultimaLectura indica cuándo fue observado/sincronizado, NO cuándo se editó.
const MODOS=new Set(['vivienda','alta_desc','alta_asc','lectura_desc','lectura_asc']);
function modoSeguro(value){return MODOS.has(value)?value:'vivienda';}
function fechaValida(value){
  if(!value)return null;
  const timestamp=Date.parse(value);
  return Number.isFinite(timestamp)?timestamp:null;
}
function fechaPorVivienda(row,key){
  const values=(row.tarjetas||[]).map(tag=>
    key==='alta'?Number(tag.id):fechaValida(tag.ultimaLectura))
    .filter(n=>typeof n==='number'&&Number.isFinite(n)&&n>0);
  return values.length?Math.max(...values):null;
}
function ordenarViviendasPorTags(rows,mode,compararDirecciones){
  const orden=modoSeguro(mode);
  if(orden==='vivienda')return rows.sort(compararDirecciones);
  const key=orden.startsWith('alta')?'alta':'lectura';
  const direction=orden.endsWith('_asc')?1:-1;
  return rows.sort((a,b)=>{
    const av=fechaPorVivienda(a,key),bv=fechaPorVivienda(b,key);
    if(av===null&&bv!==null)return 1;
    if(bv===null&&av!==null)return -1;
    return (av!==null&&bv!==null?direction*(av-bv):0)
      || compararDirecciones(a,b);
  });
}
module.exports={modoSeguro,fechaValida,fechaPorVivienda,ordenarViviendasPorTags};
