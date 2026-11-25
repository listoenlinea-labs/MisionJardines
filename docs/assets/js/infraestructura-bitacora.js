/* Helpers sin dependencias, compartidos con las pruebas de regresión. */
(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.MJInfraBitacora=api;
})(typeof window!=='undefined'?window:globalThis,function(){
  'use strict';
  const zone='America/Mexico_City';
  const dates=new Intl.DateTimeFormat('es-MX',{timeZone:zone,day:'2-digit',month:'2-digit',year:'numeric'});
  const times=new Intl.DateTimeFormat('es-MX',{timeZone:zone,hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
  const timestamp=item=>item?.finalizada??item?.at??item?.creada??item?.fecha??null;
  function dateValue(item){
    const value=timestamp(item);
    if(value===null||value==='')return null;
    // No interpretar fechas sin zona según la ubicación del navegador.
    const raw=typeof value==='string'&&/^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(value)?value.replace(' ','T')+'Z':value;
    const date=new Date(raw);
    return Number.isFinite(date.getTime())?date:null;
  }
  function dateTime(item){
    const date=dateValue(item);
    return date?{fecha:dates.format(date),hora:times.format(date),iso:date.toISOString()}:{fecha:'Sin registro',hora:'—',iso:null};
  }
  function paginate(values,requested=1,mobile=false){
    const ordered=(Array.isArray(values)?values:[]).slice().sort((a,b)=>(dateValue(b)?.getTime()??-Infinity)-(dateValue(a)?.getTime()??-Infinity));
    const size=mobile?3:10,total=ordered.length,pages=Math.max(1,Math.ceil(total/size));
    const page=Math.min(pages,Math.max(1,Math.trunc(Number(requested)||1)));
    const offset=(page-1)*size;
    return {items:ordered.slice(offset,offset+size),size,total,pages,page,from:total?offset+1:0,to:Math.min(offset+size,total)};
  }
  return {dateTime,paginate,zone};
});
