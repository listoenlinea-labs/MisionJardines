'use strict';
const {cents,fail}=require('./proyectos-extraordinarios-validacion.service');

// Reparte el presupuesto en centavos. Excepciones fijas, residuo entre otras viviendas.
function distribuirPresupuesto(padron,montoTotal,excepciones=[]){
 if(!Array.isArray(padron)||padron.length!==231)
  throw fail(409,'El padrón oficial debe contener exactamente 231 viviendas.');
 const ids=padron.map(h=>Number(h.id));
 if(new Set(ids).size!==231||ids.some(id=>!Number.isSafeInteger(id)||id<1))
  throw fail(409,'Hay identificadores de vivienda duplicados o inválidos.');
 const total=cents(montoTotal);
 if(total<231)throw fail(400,'El costo total debe permitir al menos $0.01 para cada vivienda.');
 if(!Array.isArray(excepciones)||excepciones.length>230)
  throw fail(400,'Debe quedar al menos una vivienda sin excepción para distribuir el resto.');
 const allowed=new Set(ids),fixed=new Map();
 for(const entry of excepciones){
  const id=Number(entry?.casaId);
  if(!Number.isSafeInteger(id)||!allowed.has(id)||fixed.has(id))
   throw fail(400,'Vivienda de excepción inexistente o duplicada.');
  const amount=cents(entry?.monto);
  if(amount<=0)throw fail(400,'El importe excepcional debe ser mayor a cero.');
  fixed.set(id,amount);
 }
 const remainingHouses=ids.filter(id=>!fixed.has(id)).sort((a,b)=>a-b);
 if(!remainingHouses.length)throw fail(400,'Debe existir alguna vivienda sin excepción.');
 const committed=[...fixed.values()].reduce((sum,n)=>sum+n,0);
 const remaining=total-committed;
 if(remaining<remainingHouses.length)
  throw fail(400,'Las excepciones superan el presupuesto disponible para las demás viviendas.');
 const base=Math.floor(remaining/remainingHouses.length),remainder=remaining%remainingHouses.length;
 const assigned=new Map(remainingHouses.map((id,i)=>[id,base+(i<remainder?1:0)]));
 const cargos=ids.map(casaId=>({casaId,monto:(fixed.get(casaId)??assigned.get(casaId))/100,
  esExcepcion:fixed.has(casaId)}));
 if(cargos.reduce((sum,c)=>sum+Math.round(c.monto*100),0)!==total)
  throw fail(409,'El reparto no coincide con el costo global.');
 return {montoTotal:total/100,cuotaBase:base/100,cargos,excepciones:fixed.size};
}
module.exports={distribuirPresupuesto};
