'use strict';

const { randomUUID } = require('crypto');
const { BASE, RECARGO, MAX_MESES, INICIO } = require('./mensualidades-mantenimiento');
const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
const PREFIX='MJMAN:';
const fail=message=>Object.assign(new Error(message),{status:400});

// La mensualidad de octubre vence el 10 de noviembre; todas las tarjetas
// de la vivienda tendrán la misma fecha final (si el C3 confirma la escritura).
function prepararPlan({anio,mes,meses,importeMes}){
  anio=Number(anio);mes=Number(mes);meses=Number(meses);importeMes=Number(importeMes);
  if(!Number.isInteger(anio)||anio<2026||anio>2098||
     !Number.isInteger(mes)||mes<1||mes>12||
     !Number.isInteger(meses)||meses<1||meses>MAX_MESES)
    throw fail('Indica el primer mes, año y entre 1 y 36 mensualidades');
  if(![BASE,BASE+RECARGO].includes(importeMes))
    throw fail('La mensualidad debe ser de $300 o $350 (con recargo)');
  const periodos=[];
  for(let i=0;i<meses;i++){
    const fecha=new Date(Date.UTC(anio,mes-1+i,1));
    const yy=fecha.getUTCFullYear(),mm=fecha.getUTCMonth()+1;
    if(yy>2099)throw fail('Año fuera de rango');
    const periodo=`${yy}-${String(mm).padStart(2,'0')}-01`;
    if(periodo<INICIO)throw fail('Las mensualidades de este flujo comienzan en octubre de 2026');
    periodos.push({anio:yy,mes:MESES[mm-1],numeroMes:mm});
  }
  const siguiente=new Date(Date.UTC(anio,mes-1+meses,1));
  const fechaFinObjetivo=`${siguiente.getUTCFullYear()}-${String(siguiente.getUTCMonth()+1).padStart(2,'0')}-10`;
  const recargo=importeMes-BASE;
  return {periodos,fechaFinObjetivo,importeMes,recargo,total:importeMes*meses,meses};
}
function generarReferencia(fechaFinObjetivo){
  return PREFIX+fechaFinObjetivo+':'+randomUUID();
}
function fechaFinDeReferencia(ref){
  const match=/^MJMAN:(\d{4}-\d{2}-10):[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.exec(String(ref||''));
  if(!match)return null;
  const d=new Date(match[1]+'T12:00:00Z');
  if(Number.isNaN(d.getTime())||d.toISOString().slice(0,10)!==match[1])return null;
  return match[1];
}
module.exports={prepararPlan,generarReferencia,fechaFinDeReferencia};
