'use strict';

// La renta del salón depende solamente de mantenimiento y proyectos exigibles.
// Los cobros propios de casa club se mantienen visibles en Pagos, pero no
// cancelan por sí solos el derecho a solicitar otra fecha.
function evaluarElegibilidadReserva(adeudos) {
  if(!['MANTENIMIENTO','EXTRAORDINARIO'].every(tipo=>Array.isArray(adeudos?.tipos?.[tipo])))
    throw new Error('No es posible confirmar los adeudos de mantenimiento y cuotas extraordinarias');
  const tipos={},totales={};
  for(const tipo of ['MANTENIMIENTO','EXTRAORDINARIO']){
    tipos[tipo]=adeudos.tipos[tipo].filter(item=>{
      if(!Number.isFinite(Number(item?.monto)))throw new Error('Importe de adeudo inválido');
      return Number(item.monto)>0;
    }).map(item=>({categoria:tipo,concepto:item.concepto||tipo,periodo:item.periodo||null,
      monto:Number(item.monto),recargo:Number(item.recargo||0)}));
    totales[tipo]=Math.round(tipos[tipo].reduce((s,x)=>s+Math.round(x.monto*100),0))/100;
  }
  const total=Math.round((totales.MANTENIMIENTO+totales.EXTRAORDINARIO)*100)/100;
  return {puedeReservar:total===0,total,totales,tipos};
}

module.exports={evaluarElegibilidadReserva};
