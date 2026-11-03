(function(root){
 'use strict';
 const fail=message=>{throw Error(message);};
 const cents=value=>{
  if(value===''||value==null)return fail('Ingresa el costo total o un importe de excepción.');
  const n=Number(value),rounded=Math.round(n*100);
  if(!Number.isFinite(n)||!Number.isSafeInteger(rounded)||n<0||n>10000000||Math.abs(n*100-rounded)>0.001)
   return fail('Los importes deben ser válidos, positivos y tener como máximo dos decimales.');
  return rounded;
 };
 function distribuir(houses,totalAmount,exceptions=[]){
  if(!Array.isArray(houses)||houses.length!==231)return fail('El padrón debe contener 231 viviendas.');
  const ids=houses.map(h=>Number(h.casaId??h.id));
  if(new Set(ids).size!==231||ids.some(x=>!Number.isSafeInteger(x)||x<1))
   return fail('Hay viviendas duplicadas o inválidas en el padrón.');
  const total=cents(totalAmount);
  if(total<231)return fail('El costo total debe cubrir al menos $0.01 por vivienda.');
  if(!Array.isArray(exceptions)||exceptions.length>230)return fail('Deja al menos una vivienda sin excepción.');
  const idSet=new Set(ids),fixed=new Map();
  for(const e of exceptions){
   const id=Number(e.casaId);
   if(!idSet.has(id)||fixed.has(id))return fail('Hay excepciones duplicadas o ajenas al padrón.');
   const amount=cents(e.monto);
   if(amount<=0)return fail('Cada excepción debe ser mayor a cero.');
   fixed.set(id,amount);
  }
  const others=ids.filter(id=>!fixed.has(id)).sort((a,b)=>a-b);
  if(!others.length)return fail('Deja al menos una vivienda para distribuir el importe restante.');
  const remaining=total-[...fixed.values()].reduce((a,b)=>a+b,0);
  if(remaining<others.length)return fail('Las excepciones exceden el presupuesto; no queda una cuota positiva para todas las viviendas.');
  const base=Math.floor(remaining/others.length),remainder=remaining%others.length;
  const standard=new Map(others.map((id,i)=>[id,base+(i<remainder?1:0)]));
  const rows=ids.map(casaId=>({
   casaId,montoCentavos:fixed.get(casaId)??standard.get(casaId),esExcepcion:fixed.has(casaId)
  }));
  if(rows.reduce((sum,r)=>sum+r.montoCentavos,0)!==total)return fail('El reparto no coincide con el costo del proyecto.');
  return {rows,totalCentavos:total,cuotaBaseCentavos:base,excepciones:fixed.size};
 }
 const api={distribuir};
 if(root)root.MJProjectBudget=api;
 if(typeof module==='object'&&module.exports)module.exports=api;
})(typeof window==='undefined'?null:window);
