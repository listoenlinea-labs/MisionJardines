'use strict';

// Únicamente el mantenimiento vencido impide reservar Casa Club.
// Las aportaciones extraordinarias son voluntarias: no alteran elegibilidad.
function evaluarElegibilidadReserva(adeudos) {
 const rows=adeudos?.tipos?.MANTENIMIENTO;
 if(!Array.isArray(rows))throw new Error('No es posible confirmar los adeudos de mantenimiento');
 const conceptos=rows.filter(x=>{
  if(!Number.isFinite(Number(x?.monto)))throw new Error('Importe de adeudo de mantenimiento inválido');
  return Number(x.monto)>0;
 }).map(x=>({
  categoria:'MANTENIMIENTO',concepto:x.concepto||'Mantenimiento',
  periodo:x.periodo||null,monto:Number(x.monto),recargo:Number(x.recargo||0)
 }));
 const total=Math.round(conceptos.reduce((s,x)=>s+Math.round(x.monto*100),0))/100;
 return {puedeReservar:total===0,total,
  totales:{MANTENIMIENTO:total},tipos:{MANTENIMIENTO:conceptos}};
}
module.exports={evaluarElegibilidadReserva};
