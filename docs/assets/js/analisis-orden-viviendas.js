(function(root){
 'use strict';
 const months=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
 const collator=new Intl.Collator('es-MX',{numeric:true,sensitivity:'base'});
 const number=value=>Number.isFinite(Number(value))?Number(value):null;
 const text=value=>String(value??'').trim()||null;
 function monthIndex(value){
  const month=months.indexOf(String(value?.mes||'').toUpperCase());
  const year=Number(value?.anio);
  return month>=0&&Number.isInteger(year)&&year>=2020?year*12+month:null;
 }
 const values={
  calle:h=>text(h.calleCorrecta||h.calle),numero:h=>text(h.numero),nombre:h=>text(h.nombre),estatus:h=>text(h.estatus),
  pagado:h=>number(h.ultimoPago?.monto||0),
  registro:h=>{const value=Date.parse(h.ultimoRegistroPago?.fecha);return Number.isFinite(value)?value:null;},
  mes:h=>monthIndex(h.ultimoMesPagado),saldo:h=>number(h.saldoPendiente),
  tags:h=>(h.tags?.detalle||[]).length,pago:()=> 'Registrar pago'
 };
 function nextSort(current,key){
  if(!Object.hasOwn(values,key))return current;
  return {key,direction:current.key===key?(current.direction==='asc'?'desc':'asc'):(key==='registro'?'desc':'asc')};
 }
 function compareHouses(a,b,{key='calle',direction='asc'}={}){
  const value=values[key]||values.calle,av=value(a),bv=value(b);
  if(av===null&&bv!==null)return 1;
  if(av!==null&&bv===null)return -1;
  const cmp=av===null?0:typeof av==='number'?av-bv:collator.compare(av,bv);
  return (direction==='desc'?-cmp:cmp)
   ||collator.compare(String(a.calleCorrecta||a.calle||''),String(b.calleCorrecta||b.calle||''))
   ||collator.compare(String(a.numero??''),String(b.numero??''))
   ||Number(a.casaId)-Number(b.casaId);
 }
 const api={nextSort,compareHouses};
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.MJHouseSort=api;
})(typeof window==='undefined'?{}:window);
