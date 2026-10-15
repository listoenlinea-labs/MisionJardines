'use strict';

const { fechaMexico } = require('./vigencia-calculo');
const cincoMinutos = 5 * 60 * 1000;
const clave = value => {
  const text=String(value??'').trim();
  const digits=text.replace(/\D/g,'');
  return digits?digits.replace(/^0+(?=\d)/,''):text.toLowerCase();
};
const controles = text => String(text||'').split(/[\s,;|/]+/).map(s=>s.trim()).filter(Boolean);

// Misma cautela que ZKTeco: una lectura antigua no confirma el estado físico
// presente. "ACTIVO"/"INACTIVO" aquí son estados de la última lectura reciente,
// no una verificación en vivo. El modal consulta directamente el C3.
function estadoTag(tag,{hoy=fechaMexico(),ahora=Date.now()}={}){
  if(!tag.enControlador)return {codigo:'SIN_CONFIRMAR',etiqueta:'No confirmado en C3'};
  const lectura=tag.ultimaLectura?new Date(tag.ultimaLectura).getTime():NaN;
  if(!Number.isFinite(lectura)||lectura>ahora+60000||ahora-lectura>cincoMinutos)
    return {codigo:'SIN_CONFIRMAR',etiqueta:'Lectura por verificar'};
  if(tag.bloqueado)return {codigo:'INACTIVO',etiqueta:'Bloqueado (última lectura)'};
  if(tag.fechaFin&&String(tag.fechaFin).slice(0,10)<hoy)
    return {codigo:'INACTIVO',etiqueta:'Vigencia vencida'};
  if(!Number(tag.puertasAutorizadas))
    return {codigo:'SIN_CONFIRMAR',etiqueta:'Permisos por verificar'};
  return {codigo:'ACTIVO',etiqueta:'Activo según última lectura'};
}

function resumenTags(tags){
  const r={total:tags.length,activos:0,inactivos:0,sinConfirmar:0};
  for(const tag of tags){
    const codigo=tag.estado.codigo;
    if(codigo==='ACTIVO')r.activos++;
    else if(codigo==='INACTIVO')r.inactivos++;
    else r.sinConfirmar++;
  }
  return r;
}

function tagsParaViviendas(casas,tarjetas,opciones={}){
  const porCasa=new Map();
  const porNumero=new Map();
  for(const tag of tarjetas){
    const casaId=Number(tag.casaId);
    if(Number.isSafeInteger(casaId)&&casaId>0){
      if(!porCasa.has(casaId))porCasa.set(casaId,[]);
      porCasa.get(casaId).push(tag);
    }
    const k=clave(tag.numeroTarjeta);
    if(k&&!porNumero.has(k))porNumero.set(k,[]);
    if(k)porNumero.get(k).push(tag);
  }
  const resultado=new Map();
  for(const casa of casas){
    const id=Number(casa.id);
    const encontrados=new Map((porCasa.get(id)||[]).map(tag=>[String(tag.id),tag]));
    const sinVincular=[];
    for(const numero of controles(casa.controles)){
      const matching=(porNumero.get(clave(numero))||[]).find(t=>!t.casaId||Number(t.casaId)===id);
      if(matching)encontrados.set(String(matching.id),matching);
      else sinVincular.push(numero);
    }
    const detalles=[...encontrados.values()].sort((a,b)=>String(a.numeroTarjeta).localeCompare(String(b.numeroTarjeta),'es-MX',{numeric:true})).map(t=>({
      id:t.id,numeroTarjeta:String(t.numeroTarjeta),nombre:t.nombreDispositivo||t.departamento||null,
      fechaInicio:t.fechaInicio||null,fechaFin:t.fechaFin||null,
      bloqueado:Boolean(t.bloqueado),enControlador:Boolean(t.enControlador),
      puertasAutorizadas:t.puertasAutorizadas??null,ultimaLectura:t.ultimaLectura||null,
      estado:estadoTag(t,opciones)
    }));
    resultado.set(String(id),{...resumenTags(detalles),detalle:detalles,
      controlesNoEnlazados:sinVincular});
  }
  return resultado;
}

module.exports={clave,estadoTag,resumenTags,tagsParaViviendas};
