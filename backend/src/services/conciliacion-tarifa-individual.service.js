'use strict';

// Reconocimiento CONTABLE (no es un nuevo cobro): cuotas que eran parciales
// bajo la tarifa general, pero ya cubrían íntegramente la tarifa individual.
// Requiere confirmación administrativa al registrar la siguiente mensualidad.
// Conserva importe pagado, fecha, referencia, folio y cualquier evento C3.
const {fechaMexico}=require('./vigencia-calculo');
const {TARIFA_GENERAL}=require('./tarifa-mantenimiento.service');
const MESES=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
const centavos=n=>Math.round(Number(n)*100);

function fechaContable(value){
  if(!value)return null;
  const d=value instanceof Date?value:new Date(value);
  if(!Number.isFinite(d.getTime()))return null;
  return fechaMexico(d);
}
function conciliacionesTarifa(cuotas,tarifa){
  if(!Number.isInteger(tarifa)||tarifa<=0||tarifa>=TARIFA_GENERAL)return [];
  const elegibles=[];
  for(const row of cuotas||[]){
    const c=typeof row.get==='function'?row.get({plain:true}):row;
    const mes=MESES.indexOf(String(c.mes||'').toUpperCase())+1;
    const anio=Number(c.anio);
    const fecha=fechaContable(c.fechaPago);
    if(!mes||!Number.isInteger(anio)||anio<2026||
       (anio===2026&&mes<9)||!fecha||
       fecha>String(anio)+'-'+String(mes).padStart(2,'0')+'-10'||
       fecha.slice(0,7)!==String(anio)+'-'+String(mes).padStart(2,'0'))continue;
    if(String(c.estatusPago||'').toUpperCase()!=='PAGO_PARCIAL'||
       (c.tipoPago&&String(c.tipoPago).toUpperCase()!=='MANTENIMIENTO')||
       centavos(c.montoPagado)!==tarifa*100||centavos(c.recargo||0)!==0)continue;
    elegibles.push({id:Number(c.id),anio,mes:MESES[mes-1],
      montoPagado:tarifa,fechaPago:fecha});
  }
  return elegibles;
}
function historialConTarifaConciliada(cuotas,conciliaciones){
  const ids=new Set(conciliaciones.map(c=>c.id));
  return (cuotas||[]).map(row=>{
    const c=typeof row.get==='function'?row.get({plain:true}):row;
    return ids.has(Number(c.id))?{...c,estatusPago:'PAGADO',montoCuota:c.montoPagado,saldoPendiente:0}:c;
  });
}
module.exports={conciliacionesTarifa,historialConTarifaConciliada,fechaContable};
