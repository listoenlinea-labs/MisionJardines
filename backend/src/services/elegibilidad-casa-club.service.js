'use strict';
function evaluarElegibilidadReserva(adeudos) {
 const tipos={};
 for(const categoria of ['MANTENIMIENTO','EXTRAORDINARIO']){
  const rows=adeudos?.tipos?.[categoria];
  if(!Array.isArray(rows))throw new Error('No es posible confirmar los adeudos de '+categoria.toLowerCase());
  tipos[categoria]=rows.filter(x=>{
   if(!Number.isFinite(Number(x?.monto)))throw new Error('Importe de adeudo inválido');
   return Number(x.monto)>0;
  }).map(x=>({categoria,concepto:x.concepto||categoria,periodo:x.periodo||null,monto:Number(x.monto),recargo:Number(x.recargo||0)}));
 }
 const totales=Object.fromEntries(Object.entries(tipos).map(([k,rows])=>[k,Math.round(rows.reduce((s,x)=>s+x.monto*100,0))/100]));
 const total=Math.round(Object.values(totales).reduce((s,n)=>s+n*100,0))/100;
 return {puedeReservar:total===0,total,totales,tipos};
}
module.exports={evaluarElegibilidadReserva};
