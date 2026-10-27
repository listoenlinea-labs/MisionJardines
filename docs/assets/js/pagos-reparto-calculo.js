/* Reglas de importes compartidas con el navegador. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;if(root)root.MJReparto=api;})(typeof window!=='undefined'?window:null,function(){
 'use strict';
 function error(message){return Object.assign(new Error(message),{status:400});}
 function centavos(value){
  const s=String(value??'').trim();
  if(!/^\d{1,10}(?:\.\d{1,2})?$/.test(s))throw error('Usa importes positivos o cero con máximo dos decimales.');
  const [whole,decimal='']=s.split('.');
  return Number(whole)*100+Number(decimal.padEnd(2,'0'));
 }
 function normalizar(rows,total,permitidas){
  if(!Array.isArray(rows)||!rows.length||rows.length>permitidas.length)throw error('Selecciona las viviendas y sus importes.');
  const seen=new Set(),result=[];let suma=0;
  for(const row of rows){
   const casaId=Number(row?.casaId);
   if(!Number.isSafeInteger(casaId)||casaId<1||!permitidas.includes(casaId))throw error('El reparto contiene una vivienda no autorizada.');
   if(seen.has(casaId))throw error('No repitas una vivienda en el reparto.');
   seen.add(casaId);const cents=centavos(row.monto);suma+=cents;
   if(cents>0)result.push({casaId,monto:cents/100});
  }
  if(!result.length||suma!==centavos(total))throw error('La suma del reparto debe ser exactamente igual al monto del comprobante.');
  return result.sort((a,b)=>a.casaId-b.casaId);
 }
 return {centavos,normalizar};
});
