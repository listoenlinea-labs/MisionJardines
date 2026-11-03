'use strict';
// Resumen de dinero cobrado, no de meses cubiertos. El movimiento se reconoce
// una sola vez en la fecha de recepción, incluso si es un pago anual adelantado.
const {historialMantenimiento}=require('./historial-pagos-vivienda.service');
const {normalizarCalle}=require('./padron-finanzas.service');

const CENTS=n=>Math.round(Number(n||0)*100);
const MX_TIME=new Intl.DateTimeFormat('en-US',{
 timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'
});
function fechaCobro(valor){
 if(!valor)return null;
 if(typeof valor==='string'){
  // SQL DATE/DATETIME sin zona: fecha civil guardada por la aplicación.
  const match=/^(\d{4}-\d{2}-\d{2})(?:$|[ T](?!.*(?:Z|[+-]\d{2}:?\d{2})$))/.exec(valor);
  if(match)return match[1];
 }
 const date=new Date(valor);
 if(!Number.isFinite(date.getTime()))return null;
 const parts=Object.fromEntries(MX_TIME.formatToParts(date).map(p=>[p.type,p.value]));
 return parts.year+'-'+parts.month+'-'+parts.day;
}
function agrupacionMantenimiento({padron=[],cuotas=[],comprobantes=[],inicio,fin}){
 const byHouse=new Map();
 const pagosByHouse=new Map();
 for(const c of cuotas){
  const key=String(c.casaId);
  if(!byHouse.has(key))byHouse.set(key,[]);
  byHouse.get(key).push(c);
 }
 for(const p of comprobantes){
  const key=String(p.casaId);
  if(!pagosByHouse.has(key))pagosByHouse.set(key,[]);
  pagosByHouse.get(key).push(p);
 }
 const streets=new Map();
 let sinFecha=0;
 for(const casa of padron){
  const calle=String(casa.calleCorrecta||casa.calle||'Sin calle').trim();
  const key=normalizarCalle(calle);
  if(!streets.has(key))streets.set(key,{calle,acumuladoCentavos:0,mesCentavos:0,movimientos:0});
  const st=streets.get(key);
  const movimientos=historialMantenimiento(byHouse.get(String(casa.id))||[],pagosByHouse.get(String(casa.id))||[]);
  for(const m of movimientos){
   const amount=CENTS(m.monto);
   if(amount<=0)continue;
   const fecha=fechaCobro(m.fecha);
   if(!fecha){sinFecha++;continue;}
   if(fecha>fin)continue; // jamás proyectar ingreso por un mes futuro abonado
   st.acumuladoCentavos+=amount;
   st.movimientos++;
   if(fecha>=inicio)st.mesCentavos+=amount;
  }
 }
 const calles=[...streets.values()].map(({calle,acumuladoCentavos,mesCentavos,movimientos})=>({
  calle,acumulado:acumuladoCentavos/100,mes:mesCentavos/100,movimientos
 })).sort((a,b)=>a.calle.localeCompare(b.calle,'es-MX',{numeric:true,sensitivity:'base'}));
 return {calles,acumulado:calles.reduce((s,x)=>s+CENTS(x.acumulado),0)/100,
  mes:calles.reduce((s,x)=>s+CENTS(x.mes),0)/100,sinFecha,
  criterio:'Fecha del cobro registrado; pagos manuales y bancarios conciliados; cada movimiento cuenta una sola vez'};
}
module.exports={fechaCobro,agrupacionMantenimiento};
