'use strict';

const { randomUUID } = require('crypto');
const { BASE, RECARGO, MAX_MESES } = require('./mensualidades-mantenimiento');
const {primerPendiente}=require('./cuotas-mantenimiento-calculo');
const MESES = ['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
const PREFIX='MJMAN:';
const fail=message=>Object.assign(new Error(message),{status:400});

// La mensualidad de octubre vence el 10 de noviembre; todas las tarjetas
// de la vivienda tendrán la misma fecha final (si el C3 confirma la escritura).
function prepararPlan({anio,mes,meses,importeMes,montoTotal,tarifa=BASE}){
  if(!Number.isInteger(tarifa)||tarifa<1||tarifa>10000)throw fail('Tarifa mensual inválida');
  anio=Number(anio);mes=Number(mes);meses=Number(meses);
  if(!Number.isInteger(anio)||anio<2026||anio>2098||
     !Number.isInteger(mes)||mes<1||mes>12||
     !Number.isInteger(meses)||meses<1||meses>MAX_MESES)
    throw fail('Selecciona entre 1 y 36 mensualidades válidas');
  const periodos=[];
  for(let i=0;i<meses;i++){
    const fecha=new Date(Date.UTC(anio,mes-1+i,1));
    const yy=fecha.getUTCFullYear(),mm=fecha.getUTCMonth()+1;
    if(yy>2099)throw fail('Año fuera de rango');
    periodos.push({anio:yy,mes:MESES[mm-1],numeroMes:mm});
  }
  const centavos=x=>Math.round(Number(x)*100);
  if(montoTotal===undefined||montoTotal===null||montoTotal===''){
    const porMes=importeMes===undefined?tarifa:Number(importeMes);
    if(![tarifa,tarifa+RECARGO].includes(porMes))
      throw fail('El monto por mes debe ser $'+tarifa+' o $'+(tarifa+RECARGO));
    montoTotal=porMes*meses;
  }
  const monto=Number(montoTotal),totalCentavos=centavos(monto);
  if(!Number.isFinite(monto)||Math.abs(totalCentavos/100-monto)>0.00001 ||
     totalCentavos<tarifa*meses*100||totalCentavos>(tarifa+RECARGO)*meses*100)
    throw fail('El importe de '+meses+' mes(es) debe estar entre $'+tarifa*meses+' y $'+(tarifa+RECARGO)*meses+
      '. Para registrar un abono parcial utiliza el flujo de abonos; no marques todos los meses pagados.');
  let extras=totalCentavos-tarifa*meses*100;
  const desglose=periodos.map(p=>{
    const recargoCentavos=Math.min(RECARGO*100,extras);
    extras-=recargoCentavos;
    return {...p,montoCuota:(tarifa*100+recargoCentavos)/100,recargo:recargoCentavos/100};
  });
  const siguiente=new Date(Date.UTC(anio,mes-1+meses,1));
  const fechaFinObjetivo=`${siguiente.getUTCFullYear()}-${String(siguiente.getUTCMonth()+1).padStart(2,'0')}-10`;
  return {periodos:desglose,fechaFinObjetivo,importeMes:null,tarifaMensual:tarifa,montoMinimo:tarifa*meses,montoMaximo:(tarifa+RECARGO)*meses,
    recargo:(totalCentavos-tarifa*meses*100)/100,total:totalCentavos/100,meses};
}

// Selecciona el mes final y deduce los pendientes posteriores al último
// período COMPLETAMENTE pagado. El estado del TAG no se usa como historial
// contable: el NVR/C3 puede estar desincronizado con las cuotas.
function indice(anio,mes){return Number(anio)*12+Number(mes)-1;}
function siguienteDelUltimo(cuotas, anio, mes) {
  let ultimo=null;
  for(const c of cuotas||[]){
    const mm=MESES.indexOf(String(c.mes||'').toUpperCase())+1;
    const yy=Number(c.anio);
    if(!mm||!Number.isInteger(yy))continue;
    const n=indice(yy,mm);
    // Considerar también los anticipos posteriores al mes solicitado. Si se
    // omiten, se puede intentar registrar por segunda vez un período cubierto.
    if(String(c.estatusPago||'').toUpperCase()==='PAGADO' && Number(c.montoPagado||0)>0 &&
      (!ultimo||n>ultimo.indice)){
      ultimo={indice:n,anio:yy,mes:mm,nombre:MESES[mm-1],fechaPago:c.fechaPago||null};
    }
  }
  return ultimo;
}
function prepararDesdeHistorial({cuotas=[],anio,mes,montoTotal,tarifa=BASE}){
  anio=Number(anio);mes=Number(mes);
  const actual=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/Mexico_City',year:'numeric'}).format(new Date()));
  if(!Number.isInteger(anio)||anio<actual||anio>2098||!Number.isInteger(mes)||mes<1||mes>12)
    throw fail('El año del último mes que paga debe tener cuatro dígitos y ser igual o mayor al año actual');
  const ultimo=siguienteDelUltimo(cuotas,anio,mes);
  const fin=indice(anio,mes);
  const inicio=primerPendiente(cuotas);
  const meses=fin-inicio+1;
  if(meses<1)throw fail('Este mes ya está cubierto por el último pago confirmado; selecciona uno posterior');
  if(meses>MAX_MESES)throw fail('Existen más de 36 meses por cubrir. Registra los períodos en varios movimientos.');
  const anioInicio=Math.floor(inicio/12),mesInicio=inicio%12+1;
  const plan=prepararPlan({anio:anioInicio,mes:mesInicio,meses,montoTotal,tarifa});
  return {...plan,ultimoMesPagado:ultimo,desde:{anio:anioInicio,mes:mesInicio,nombre:MESES[mesInicio-1]},
    hasta:{anio,mes,nombre:MESES[mes-1]},montoSugerido:tarifa*meses};
}

// El servidor decide qué es un cierre anual; un cliente no puede etiquetar
// un pago ordinario de noviembre o un año distinto como anual.
function validarPagoAnual(datos,{anioActual=Number(new Intl.DateTimeFormat('en-US',
    {timeZone:'America/Mexico_City',year:'numeric'}).format(new Date()))}={}){
  if(datos?.pagoAnual===undefined)return false;
  if(typeof datos.pagoAnual!=='boolean')throw fail('Indicador de pago anual inválido');
  if(datos.pagoAnual&&(Number(datos.anio)!==anioActual||Number(datos.mes)!==12))
    throw fail('Pago anual solo puede liquidar hasta diciembre del año actual');
  return datos.pagoAnual;
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
module.exports={prepararPlan,prepararDesdeHistorial,siguienteDelUltimo,validarPagoAnual,generarReferencia,fechaFinDeReferencia};
