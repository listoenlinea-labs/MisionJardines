'use strict';
// Gmail API oficial, OAuth 2.0 con permiso gmail.readonly.
// Sólo obtiene los mensajes recientes; nunca envía, modifica ni elimina correos.
const {parseMessage}=require('./gmail-bank-mail.service');
const API='https://gmail.googleapis.com/gmail/v1/users/me';
let cache={accessToken:'',expires:0},refreshing=null;

function configurado(env=process.env){
 return Boolean(env.PAGOS_GMAIL_MAILBOX&&env.PAGOS_GMAIL_CLIENT_ID
   &&env.PAGOS_GMAIL_CLIENT_SECRET&&env.PAGOS_GMAIL_REFRESH_TOKEN);
}
async function token(){
 if(cache.accessToken&&Date.now()<cache.expires-90000)return cache.accessToken;
 if(refreshing)return refreshing;
 refreshing=(async()=>{
  const form=new URLSearchParams({
   client_id:process.env.PAGOS_GMAIL_CLIENT_ID,
   client_secret:process.env.PAGOS_GMAIL_CLIENT_SECRET,
   refresh_token:process.env.PAGOS_GMAIL_REFRESH_TOKEN,
   grant_type:'refresh_token'
  });
  const r=await fetch('https://oauth2.googleapis.com/token',{
   method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:form,signal:AbortSignal.timeout(12000)
  });
  if(!r.ok)throw Error('Google OAuth no pudo actualizar el token ('+r.status+'). Reautoriza Gmail si expiró.');
  const body=await r.json();
  if(!body.access_token||!Number.isFinite(Number(body.expires_in)))throw Error('Respuesta OAuth incompleta de Google');
  cache={accessToken:body.access_token,expires:Date.now()+Math.min(Number(body.expires_in),3600)*1000};
  return cache.accessToken;
 })();
 try{return await refreshing}finally{refreshing=null}
}
async function apiGet(path,attempt=0){
 const access=await token();
 const r=await fetch(API+path,{
  headers:{Authorization:'Bearer '+access,Accept:'application/json'},
  signal:AbortSignal.timeout(15000)
 });
 if(r.status===401&&attempt===0){
  cache={accessToken:'',expires:0};
  return apiGet(path,1);
 }
 if(!r.ok)throw Error('Gmail API no respondió correctamente (HTTP '+r.status+')');
 return r.json();
}
function decodeRaw(raw){
 const encoded=String(raw||'');
 if(!encoded||encoded.length>550000||!/^[a-z0-9_=-]+$/i.test(encoded))
  throw Error('Mensaje Gmail vacío o demasiado grande');
 return Buffer.from(encoded.replace(/-/g,'+').replace(/_/g,'/'),'base64');
}
async function leerGmail({mailbox,dias=7}){
 if(!configurado())throw Error('Configuración OAuth de Gmail incompleta');
 const expected=String(mailbox||'').trim().toLowerCase();
 const profile=await apiGet('/profile');
 if(String(profile.emailAddress||'').toLowerCase()!==expected)
  throw Error('La cuenta autorizada en Google OAuth es diferente de PAGOS_GMAIL_MAILBOX');
 const since=Math.floor((Date.now()-Math.max(1,Math.min(14,Number(dias)||7))*86400000)/1000);
 const query=new URLSearchParams({maxResults:'60',q:'in:inbox after:'+since});
 const list=await apiGet('/messages?'+query.toString());
 const messages=Array.isArray(list.messages)?list.messages:[];
 const output=[];
 for(const row of messages){
  if(!/^[a-z0-9]+$/i.test(String(row.id||'')))continue;
  const item=await apiGet('/messages/'+encodeURIComponent(row.id)+'?format=raw');
  if(item.raw){
   const parsed=parseMessage({uid:row.id,source:decodeRaw(item.raw)});
   if(parsed)output.push(parsed);
  }
 }
 return output;
}
module.exports={leerGmail,token,configurado,decodeRaw,apiGet};
