'use strict';
// Cola de mensajes entrantes: Meta recibe 200 tras persistencia; el worker
// procesa después sin perder mensajes ante reinicios del backend.
const db=require('../config/database');
const {QueryTypes}=require('sequelize');
const flow=require('./whatsapp-bot-flujo.service');
const enabled=()=>process.env.WHATSAPP_BOT_ENABLED==='true';
let running=false,timer=null,polling=false;
async function enqueue(message){
 if(!enabled())return;
 if(!/^wamid\.[\w+/=-]{1,249}$/.test(String(message?.id||''))||
  !/^\d{8,32}$/.test(String(message.from||''))||
  !['text','interactive','image','document'].includes(message.type))return;
 const payload=JSON.stringify(message);
 if(payload.length>100000)return;
 await db.query('INSERT INTO whatsapp_bot_eventos(mensaje_id,remitente,tipo,payload) VALUES(:id,:from,:type,:payload) ON DUPLICATE KEY UPDATE mensaje_id=mensaje_id',
  {replacements:{id:message.id,from:message.from,type:message.type,payload}});
 void work();
}
async function acquire(){
 return db.transaction(async transaction=>{
  const [row]=await db.query("SELECT id,payload FROM whatsapp_bot_eventos WHERE estado IN ('PENDIENTE','ERROR') AND intentos<3 ORDER BY id ASC LIMIT 1 FOR UPDATE",
   {type:QueryTypes.SELECT,transaction});
  if(!row)return null;
  await db.query("UPDATE whatsapp_bot_eventos SET estado='PROCESANDO',intentos=intentos+1,procesando_en=NOW() WHERE id=:id",
   {replacements:{id:row.id},transaction});
  return row;
 });
}
async function work(){
 if(!enabled()||running)return;
 running=true;
 try{
  await db.query("UPDATE whatsapp_bot_eventos SET estado='ERROR' WHERE estado='PROCESANDO' AND procesando_en < DATE_SUB(NOW(),INTERVAL 10 MINUTE) AND intentos<3");
  for(let n=0;n<10;n++){
   const row=await acquire();if(!row)break;
   try{
    await flow.handle(typeof row.payload==='string'?JSON.parse(row.payload):row.payload);
    await db.query("UPDATE whatsapp_bot_eventos SET estado='PROCESADO',procesado_en=NOW() WHERE id=:id",
     {replacements:{id:row.id}});
   }catch(e){
    console.error('[WhatsApp Bot] Evento '+row.id+': '+String(e.message||e).slice(0,180));
    await db.query("UPDATE whatsapp_bot_eventos SET estado='ERROR' WHERE id=:id",{replacements:{id:row.id}});
   }
  }
 }catch(e){console.error('[WhatsApp Bot] Error en cola:',String(e.message||e).slice(0,140));}
 finally{running=false;}
}
async function pollConfirmed(){
 if(!enabled()||polling)return;
 polling=true;
 try{
  const items=await db.query("SELECT remitente FROM whatsapp_bot_sesiones WHERE estado='REVISION_CLUB' ORDER BY actualizado_en DESC LIMIT 40",
   {type:QueryTypes.SELECT});
  for(const item of items){
   try{await flow.notifyIfConfirmed(item.remitente);}
   catch(e){console.warn('[WhatsApp Bot] Consulta estado:',String(e.message).slice(0,90));}
  }
 }catch(e){console.warn('[WhatsApp Bot] Notificaciones no disponibles:',String(e.message).slice(0,90));}
 finally{polling=false;}
}
async function cleanup(){
 if(!enabled())return;
 try{
  // Borrar datos de mensajes y sesiones antiguos, sin tocar recibos del piloto anterior.
  await db.query("DELETE FROM whatsapp_bot_eventos WHERE estado IN ('PROCESADO','ERROR') AND creado_en<DATE_SUB(NOW(),INTERVAL 30 DAY)");
  await db.query("DELETE FROM whatsapp_bot_sesiones WHERE actualizado_en<DATE_SUB(NOW(),INTERVAL 30 DAY)");
 }catch(e){console.warn('[WhatsApp Bot] Limpieza pendiente:',String(e.message).slice(0,110));}
}
function start(){
 if(!enabled()||timer)return;
 if(!process.env.WHATSAPP_BOT_SESSION_SECRET||process.env.WHATSAPP_BOT_SESSION_SECRET.length<32){
  console.error('[WhatsApp Bot] Falta secreto de sesiones; piloto deshabilitado');return;
 }
 timer=setInterval(()=>void work(),15000);timer.unref?.();
 const cleanupTimer=setInterval(()=>void cleanup(),24*60*60*1000);cleanupTimer.unref?.();
 const statusTimer=setInterval(()=>void pollConfirmed(),120000);statusTimer.unref?.();
 void work();
}
module.exports={enqueue,start,work};
