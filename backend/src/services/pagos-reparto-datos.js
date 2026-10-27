'use strict';
const esReparto=p=>p?.version===3&&Array.isArray(p.distribuciones);
function resumen(p){return esReparto(p)?p.distribuciones.map(d=>({casaId:d.casaId,calle:d.calle,numero:d.numero,monto:d.monto,recargo:d.plan.recargo,meses:d.plan.meses,fechaFinal:d.plan.fechaFinalObjetivo,aplicado:!!d.plan.aplicado})):[];}
function desglosar(rows){
 return rows.flatMap(row=>{
  const p=row.toJSON?row.toJSON():row;
  if(!esReparto(p.aplicacionCuotas))return [p];
  return p.aplicacionCuotas.distribuciones.map(d=>({...p,casaId:d.casaId,monto:d.monto,recargo:d.plan.recargo,
   calleSnapshot:d.calle,numeroCasaSnapshot:d.numero,aplicacionCuotas:d.plan,depositoTotal:p.monto}));
 });
}
function paraCasa(rows,id){return rows.flatMap(p=>esReparto(p.aplicacionCuotas)?desglosar([p]).filter(d=>Number(d.casaId)===Number(id)):[p]);}
function planParaCasa(p,id){
 if(!p?.aplicacionCuotas?.aplicado)return null;
 if(esReparto(p.aplicacionCuotas))return p.aplicacionCuotas.distribuciones.find(d=>Number(d.casaId)===Number(id))?.plan||null;
 return Number(p.casaId)===Number(id)?p.aplicacionCuotas:null;
}
module.exports={esReparto,resumen,desglosar,paraCasa,planParaCasa};
