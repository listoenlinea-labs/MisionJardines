'use strict';
// Se conserva compatibilidad con datos históricos LUZ, AGUA y PROYECTOS.
const categorias=Object.freeze(['CFE','SIAPA','JARDINERIA','MANTENIMIENTO',
 'CUOTA_EXTRAORDINARIA','INTERNET','SERVICIOS','OTROS']);
const anteriores=Object.freeze(['LUZ','AGUA','PROYECTOS']);
const etiquetas=Object.freeze({
 CFE:'CFE',SIAPA:'SIAPA',JARDINERIA:'Jardinería',
 MANTENIMIENTO:'Mantenimiento',CUOTA_EXTRAORDINARIA:'Cuota extraordinaria',
 INTERNET:'Internet',SERVICIOS:'Servicios',OTROS:'Otros'
});
function canonica(value){
 const raw=String(value||'').trim().toUpperCase();
 return ({LUZ:'CFE',AGUA:'SIAPA',PROYECTOS:'CUOTA_EXTRAORDINARIA'})[raw]||raw;
}
const importe=x=>Math.round(Number(x||0)*100);
function resumenEgresos(rows,inicio,fin){
 const mapa=Object.fromEntries(categorias.map(c=>[c,{categoria:c,label:etiquetas[c],mesCents:0,totalCents:0}]));
 for(const row of rows||[]){
  const cat=canonica(row.categoria);
  if(!mapa[cat])continue;
  const fecha=String(row.fecha||'').slice(0,10),monto=importe(row.monto);
  if(!/^\d{4}-\d\d-\d\d$/.test(fecha)||fecha>fin)continue;
  mapa[cat].totalCents+=monto;
  if(fecha>=inicio)mapa[cat].mesCents+=monto;
 }
 const conceptos=categorias.map(c=>{
  const x=mapa[c];return {categoria:c,concepto:x.label,mes:x.mesCents/100,acumulado:x.totalCents/100};
 });
 return {conceptos,mes:conceptos.reduce((a,x)=>a+importe(x.mes),0)/100,
  acumulado:conceptos.reduce((a,x)=>a+importe(x.acumulado),0)/100};
}
module.exports={categorias,anteriores,etiquetas,canonica,resumenEgresos};
