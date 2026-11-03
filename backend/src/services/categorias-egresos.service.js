'use strict';
// Se conserva compatibilidad con datos históricos LUZ, AGUA y PROYECTOS.
const categorias=Object.freeze(['CFE','SIAPA','JARDINERIA','MANTENIMIENTO',
 'CUOTA_EXTRAORDINARIA','PROYECTO','INTERNET','SERVICIOS','OTROS']);
const anteriores=Object.freeze(['LUZ','AGUA','PROYECTOS']);
const etiquetas=Object.freeze({
 CFE:'CFE',SIAPA:'SIAPA',JARDINERIA:'Jardinería',
 MANTENIMIENTO:'Mantenimiento',CUOTA_EXTRAORDINARIA:'Cuota extraordinaria',
 PROYECTO:'Proyecto',
 INTERNET:'Internet',SERVICIOS:'Servicios',OTROS:'Otros'
});
function canonica(value){
 const raw=String(value||'').trim().toUpperCase();
 return ({LUZ:'CFE',AGUA:'SIAPA',PROYECTOS:'CUOTA_EXTRAORDINARIA'})[raw]||raw;
}
const importe=x=>Math.round(Number(x||0)*100);
const meses=Object.freeze(['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']);

function resumenEgresos(rows,inicio,fin){
 // La gráfica principal muestra exclusivamente el período solicitado. La
 // tabla histórica se produce por separado, por categoría y desde enero
 // del AÑO ELEGIDO hasta el MES ELEGIDO, incluso cuando un mes tuvo $0.
 const anio=Number(String(inicio).slice(0,4));
 const mesFinal=Number(String(inicio).slice(5,7));
 if(!Number.isInteger(anio)||anio<2020||anio>2100||
  !Number.isInteger(mesFinal)||mesFinal<1||mesFinal>12)
  throw new Error('Período de egresos inválido');
 const primerDia=anio+'-01-01';
 const mapa=Object.fromEntries(categorias.map(c=>[c,{
  categoria:c,label:etiquetas[c],mesCents:0,totalCents:0,
  montosMensuales:Array(mesFinal).fill(0)
 }]));
 for(const row of rows||[]){
  const cat=canonica(row.categoria);
  if(!Object.hasOwn(mapa,cat))continue;
  // Las fechas de gastos son DATEONLY: evitar moverlas por UTC.
  const fecha=String(row.fecha instanceof Date
   ?row.fecha.toISOString().slice(0,10):row.fecha||'').slice(0,10);
  const monto=importe(row.monto);
  if(!/^\d{4}-\d\d-\d\d$/.test(fecha)||fecha>fin)continue;
  mapa[cat].totalCents+=monto;
  if(fecha>=inicio)mapa[cat].mesCents+=monto;
  if(fecha>=primerDia){
   const indiceMes=Number(fecha.slice(5,7))-1;
   if(indiceMes>=0&&indiceMes<mesFinal)mapa[cat].montosMensuales[indiceMes]+=monto;
  }
 }
 const conceptos=categorias.map(c=>{
  const x=mapa[c];return {categoria:c,concepto:x.label,mes:x.mesCents/100,acumulado:x.totalCents/100};
 });
 const historialMensual=Object.fromEntries(categorias.map(c=>[
  c,mapa[c].montosMensuales.map((centavos,i)=>({
   categoria:c,concepto:etiquetas[c],mes:meses[i],anio,
   periodo:anio+'-'+String(i+1).padStart(2,'0'),totalPagado:centavos/100
  }))
 ]));
 return {conceptos,mes:conceptos.reduce((a,x)=>a+importe(x.mes),0)/100,
  acumulado:conceptos.reduce((a,x)=>a+importe(x.acumulado),0)/100,
  anio,mesSeleccionado:mesFinal,historialMensual};
}
module.exports={categorias,anteriores,etiquetas,canonica,resumenEgresos};
