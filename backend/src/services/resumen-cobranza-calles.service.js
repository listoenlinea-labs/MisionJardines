'use strict';
// Resumen de dinero cobrado, no de meses cubiertos. El movimiento se reconoce
// una sola vez en la fecha de recepción, incluso si es un pago anual adelantado.
const {historialMantenimiento}=require('./historial-pagos-vivienda.service');
const {normalizarCalle}=require('./padron-finanzas.service');

// Solo las ocho calles oficiales del padrón; su orden nunca depende de filas
// de MySQL ni del año o mes seleccionado.
const CALLES=Object.freeze([
 'Atotonilco','Gardenias','Guadalajara','Jardines',
 'Lirios','Magnolias','Rosas','Valle de México'
]);
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
 const streets=new Map(CALLES.map(calle=>[
  normalizarCalle(calle),{calle,acumuladoCentavos:0,mesCentavos:0,movimientos:0}
 ]));
 let sinFecha=0,fueraDeCalles=0;
 for(const casa of padron){
  const calle=String(casa.calleCorrecta||casa.calle||'').trim();
  const key=normalizarCalle(calle);
  const st=streets.get(key);
  if(!st){fueraDeCalles++;continue;}
  const movimientos=historialMantenimiento(byHouse.get(String(casa.id))||[],pagosByHouse.get(String(casa.id))||[]);
  for(const m of movimientos){
   const amount=CENTS(m.monto);
   if(amount<=0)continue; // pagos anulados, condonaciones y registros vacíos
   const fecha=fechaCobro(m.fecha);
   // El total acumulado es lo que YA figura pagado en la base de datos, sin
   // depender de que el histórico importado tenga fecha o de cuál período
   // esté seleccionado. No inventar fechas para atribuirlo a un mes.
   st.acumuladoCentavos+=amount;
   st.movimientos++;
   if(!fecha){sinFecha++;continue;}
   if(fecha>=inicio&&fecha<=fin)st.mesCentavos+=amount;
  }
 }
 const calles=[...streets.values()].map(({calle,acumuladoCentavos,mesCentavos,movimientos})=>({
  calle,acumulado:acumuladoCentavos/100,mes:mesCentavos/100,movimientos
 }));
 return {calles,acumulado:calles.reduce((sum,x)=>sum+CENTS(x.acumulado),0)/100,
  mes:calles.reduce((sum,x)=>sum+CENTS(x.mes),0)/100,sinFecha,fueraDeCalles,
  criterio:'Acumulado de mantenimiento pagado en las ocho calles oficiales, incluso cuotas históricas sin fecha; una sola vez por movimiento'};
}
module.exports={CALLES,fechaCobro,agrupacionMantenimiento};
