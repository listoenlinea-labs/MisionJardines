'use strict';
// Control preventivo del bot: máximo 900 respuestas en cualquier ventana móvil
// de 31 días, siempre mensajes de servicio iniciados por el residente.
// El servidor jamás envía plantillas comerciales o de autenticación aquí.
const db=require('../config/database');
const {QueryTypes}=require('sequelize');
const CAP=900, SOFT_CAP=875;
const today=()=>new Intl.DateTimeFormat('sv-SE',{
 timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'
}).format(new Date());
function firstDay(){
 const d=new Date(today()+'T12:00:00Z');
 d.setUTCDate(d.getUTCDate()-30);
 return d.toISOString().slice(0,10);
}
const phoneId=()=>String(process.env.WHATSAPP_PHONE_NUMBER_ID||'');
function ready(){
 if(process.env.WHATSAPP_BOT_ENABLED!=='true')return false;
 if(process.env.WHATSAPP_ZERO_COST_MODE!=='true')
  throw Error('El bot exige WHATSAPP_ZERO_COST_MODE=true para impedir envíos facturables');
 if(!/^\\d{5,32}$/.test(phoneId())||!/^v\\d+\\.\\d+$/.test(process.env.WHATSAPP_GRAPH_VERSION||'')||
  !process.env.WHATSAPP_ACCESS_TOKEN)throw Error('Falta la configuración de Cloud API');
 return true;
}
async function usage(){
 if(!ready())return {used:0,remaining:CAP,limit:CAP,softCap:SOFT_CAP};
 const [row]=await db.query('SELECT COALESCE(SUM(intentos_reservados),0) AS total FROM whatsapp_bot_presupuesto_dias WHERE numero_meta=:id AND dia BETWEEN :start AND :today',{
 replacements:{id:phoneId(),start:firstDay(),today:today()},type:QueryTypes.SELECT});
 const used=Number(row?.total||0);
 return {used,remaining:Math.max(0,CAP-used),limit:CAP,softCap:SOFT_CAP};
}
async function hasRecentInbound(phone){
 // Únicamente un evento HMAC de Meta recibido en el webhook habilita una
 // respuesta. Las acciones internas no abren la ventana de 24 horas.
 const [row]=await db.query('SELECT TIMESTAMPDIFF(SECOND,MAX(creado_en),NOW()) AS segundos FROM whatsapp_bot_eventos WHERE remitente=:phone',{
 replacements:{phone},type:QueryTypes.SELECT});
 const sec=Number(row?.segundos);
 return row?.segundos!==null&&row?.segundos!==undefined&&Number.isFinite(sec)&&sec>=0&&sec<23*3600+45*60;
}
async function reserve(){
 if(!ready())return false;
 return db.transaction(async transaction=>{
  const id=phoneId(),dia=today(),desde=firstDay();
  await db.query('INSERT IGNORE INTO whatsapp_bot_presupuesto_lock(numero_meta) VALUES(:id)',{
   transaction,replacements:{id}});
  const lock=await db.query('SELECT numero_meta FROM whatsapp_bot_presupuesto_lock WHERE numero_meta=:id FOR UPDATE',{
   transaction,replacements:{id},type:QueryTypes.SELECT});
  if(!lock.length)throw Error('No se pudo bloquear el control de presupuesto');
  const [row]=await db.query('SELECT COALESCE(SUM(intentos_reservados),0) AS total FROM whatsapp_bot_presupuesto_dias WHERE numero_meta=:id AND dia BETWEEN :desde AND :dia',{
   transaction,replacements:{id,desde,dia},type:QueryTypes.SELECT});
  if(Number(row?.total||0)>=CAP)return false;
  await db.query('INSERT INTO whatsapp_bot_presupuesto_dias(numero_meta,dia,intentos_reservados) VALUES(:id,:dia,1) ON DUPLICATE KEY UPDATE intentos_reservados=intentos_reservados+1',{
   transaction,replacements:{id,dia}});
  return true;
 });
}
async function send(phone,message){
 if(!ready()||!/\\d{8,32}/.test(String(phone||'')))return false;
 if(!await hasRecentInbound(phone)){
  console.warn('[WhatsApp $0] Respuesta bloqueada fuera de ventana de 24h');return false;
 }
 // Reservar ANTES del request. No liberar en errores de red: Meta podría
 // haberlo recibido, por lo que un reintento consumiría otro envío.
 if(!await reserve()){
  console.warn('[WhatsApp $0] Límite preventivo agotado');return false;
 }
 const response=await fetch('https://graph.facebook.com/'+process.env.WHATSAPP_GRAPH_VERSION+
  '/'+phoneId()+'/messages',{method:'POST',headers:{
  Authorization:'Bearer '+process.env.WHATSAPP_ACCESS_TOKEN,'Content-Type':'application/json'
 },body:JSON.stringify({messaging_product:'whatsapp',to:phone,type:'text',
  text:{preview_url:false,body:String(message||'').slice(0,3900)}}),
  signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('Meta rechazó mensaje de servicio (HTTP '+response.status+')');
 return true;
}
const fallback='🌿 Misión Jardines: el bot está llegando al límite sin costo. Para continuar, usa nuestro portal: https://listoenlinea-labs.github.io/MisionJardines/ . Allí permanecen disponibles tus trámites.';
module.exports={send,usage,reserve,hasRecentInbound,ready,fallback,CAP,SOFT_CAP};