'use strict';

// Pantalla estática de WhatsApp Flows: recibe solo disponibilidad pública.
// No necesita endpoint de datos ni credenciales; el webhook firmado recibe
// la fecha al completar. Siempre se vuelve a verificar antes de avanzar.
const {createHash,randomBytes,timingSafeEqual}=require('node:crypto');
const free=require('./whatsapp-presupuesto-cero.service');
const {fechaISO}=require('./whatsapp-bot-fechas.service');

const SCREEN='FECHA_CASA_CLUB';
const hash=v=>createHash('sha256').update(String(v)).digest('hex');
const flowId=()=>String(process.env.WHATSAPP_CASA_CLUB_FLOW_ID||'').trim();
const enabled=()=>/^\d{5,32}$/.test(flowId());
const hoyMexico=(now=new Date())=>new Intl.DateTimeFormat('sv-SE',{
 timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'
}).format(now);
function sumarDias(iso,dias){
 const date=new Date(iso+'T12:00:00Z');
 date.setUTCDate(date.getUTCDate()+dias);
 return date.toISOString().slice(0,10);
}
function datosValidos(ocupadas,desde,hasta){
 if(!Array.isArray(ocupadas)||ocupadas.length>370)throw Error('Calendario inválido');
 return [...new Set(ocupadas.map(row=>row?.fecha).filter(date=>
  typeof date==='string'&&fechaISO(date)===date&&date>=desde&&date<=hasta))].sort();
}
async function consultarDisponibilidad(){
 const hoy=hoyMexico(),desde=sumarDias(hoy,1),hasta=sumarDias(hoy,365);
 const base=process.env.APP_BASE_URL||'https://api-misionjardines.listoenlinea.host';
 const url=new URL('/api/casa-club/publico/fechas',base);
 url.searchParams.set('desde',desde);url.searchParams.set('hasta',hasta);
 const response=await fetch(url,{signal:AbortSignal.timeout(30000)});
 if(!response.ok)throw Error('No se pudo consultar la disponibilidad');
 const data=await response.json();
 // Si Google no se verificó, nunca presentar fechas como disponibles.
 if(data?.ok!==true||data.disponibilidadVerificada!==true)
  throw Error('Disponibilidad incompleta');
 return {min_date:desde,max_date:hasta,
  unavailable_dates:datosValidos(data.ocupadas,desde,hasta)};
}
function payload({token,data,id=flowId()}){
 if(!/^\d{5,32}$/.test(String(id)))throw Error('Falta el Flow ID publicado');
 if(!/^[a-f0-9]{64}$/.test(String(token)))throw Error('Token de calendario inválido');
 return {type:'interactive',interactive:{
  type:'flow',
  header:{type:'text',text:'Misión Jardines'},
  body:{text:'🏡 Elige en el calendario el día de Casa Club. Los días ocupados no pueden seleccionarse. Después elegirás tu vivienda en el chat.'},
  action:{name:'flow',parameters:{
   flow_message_version:'3',
   flow_id:String(id),
   flow_token:token,
   flow_cta:'Abrir calendario',
   flow_action:'navigate',
   flow_action_payload:{screen:SCREEN,data}
  }}
 }};
}
async function enviar(phone,save){
 if(!enabled())return false;
 const data=await consultarDisponibilidad();
 const token=randomBytes(32).toString('hex');
 // Guardar la huella antes de enviar: un completion antiguo no puede
 // reabrir una reserva, y el número de WhatsApp se toma del webhook firmado.
 await save(phone,'FECHA',{flowTokenHash:hash(token)});
 return free.sendPayload(phone,payload({token,data}));
}
function fechaRespuesta(message,ctx){
 if(message?.type!=='interactive'||message?.interactive?.type!=='nfm_reply')return null;
 let body;
 try{body=JSON.parse(message.interactive.nfm_reply?.response_json||'');}
 catch{return null;}
 if(!body||typeof body!=='object'||Array.isArray(body))return null;
 const token=String(body.flow_token||'');
 const expected=String(ctx?.flowTokenHash||'');
 if(!/^[a-f0-9]{64}$/.test(token)||!/^[a-f0-9]{64}$/.test(expected))return null;
 const current=Buffer.from(hash(token),'hex'),saved=Buffer.from(expected,'hex');
 if(!timingSafeEqual(current,saved))return null;
 const value=body.fecha;
 return typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)
  ?fechaISO(value):null;
}
module.exports={SCREEN,enabled,hoyMexico,sumarDias,datosValidos,consultarDisponibilidad,payload,enviar,fechaRespuesta};
