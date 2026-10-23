'use strict';
// Sólo lectura. El correo bancario es evidencia secundaria: la aprobación exige
// OAuth, remitente y autenticación alineados, clave, monto, fecha y cuenta exactos.
const {createHash}=require('node:crypto');
const {setTimeout:delay}=require('node:timers/promises');
const normal=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase();
const clave=value=>normal(value).replace(/[^A-Z0-9]/g,'');
const centavos=value=>Math.round(Number(value||0)*100);
const suffix=value=>String(value||'').replace(/\D/g,'').slice(-4);
function convertirTexto(html){
 return String(html||'').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ')
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ')
  .replace(/<\/(?:p|div|tr|td|li)>|<br\s*\/?\s*>/gi,'\n')
  .replace(/<[^>]*>/g,' ').replace(/&nbsp;|&#160;/gi,' ')
  .replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&[a-z]+;|&#\d+;/gi,' ')
  .replace(/\r/g,'').slice(0,50000);
}
const mesNumero={ENE:1,FEB:2,MAR:3,ABR:4,MAY:5,JUN:6,JUL:7,AGO:8,SEP:9,OCT:10,NOV:11,DIC:12};
function fechaDeAviso(text){
 const s=normal(text);
 let m=s.match(/\b(\d{1,2})\s*[\/.\-]\s*(\d{1,2})\s*[\/.\-]\s*(20\d{2})\b/);
 let day,month,year;
 if(m){day=+m[1];month=+m[2];year=+m[3];}
 else {
  m=s.match(/\b(\d{1,2})\s*(?:[\/.\-]|DE\s+|\s+)(ENE|FEB|MAR|ABR|MAY|JUN|JUL|AGO|SEP|SET|OCT|NOV|DIC)[A-Z]*\s*(?:[\/.\-]|DE\s+|\s+)(20\d{2})\b/);
  if(!m)return '';
  day=+m[1];month=mesNumero[m[2]==='SET'?'SEP':m[2]];year=+m[3];
 }
 const date=new Date(Date.UTC(year,month-1,day));
 if(date.getUTCFullYear()!==year||date.getUTCMonth()+1!==month||date.getUTCDate()!==day)return '';
 return year+'-'+String(month).padStart(2,'0')+'-'+String(day).padStart(2,'0');
}
function datosAviso(mensaje,config=process.env){
 const remitente=String(mensaje?.from?.emailAddress?.address||'').trim().toLowerCase();
 const emisor=String(config.PAGOS_BANK_FROM_ADDRESS||'').trim().toLowerCase();
 const asunto=normal(mensaje?.subject);
 const asuntoExigido=normal(config.PAGOS_BANK_MAIL_SUBJECT||'Notificación Banco Azteca');
 const headers=mensaje?.internetMessageHeaders||[];
 const autenticacion=headers.filter(h=>String(h.name).toLowerCase()==='authentication-results').map(h=>String(h.value||'')).join(' ');
 // DMARC debe pasar para el dominio del remitente; que aparezca un remitente
 // en el encabezado visible nunca es, por sí solo, una validación bancaria.
 const dominio=emisor.split('@')[1]||'';
 const autorizado=Boolean(emisor&&remitente===emisor&&asunto.includes(asuntoExigido)&&dominio
  &&/\bdmarc=pass\b/i.test(autenticacion)
  &&new RegExp('header\\.from='+dominio.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'(?:\\s|;|$)','i').test(autenticacion));
 const body=convertirTexto(mensaje?.body?.content||'');
 const upper=normal(body);
 const claveMatch=upper.match(/\bCLAVE\s+DE\s+RASTREO\s*[:#=\-]?\s*([A-Z0-9][A-Z0-9\s-]{10,100})/);
 const tracking=claveMatch?clave(claveMatch[1].split(/\b(?:CONSULTA|VERIFICA|REFERENCIA|CONCEPTO|TIPO|FECHA|HORA)\b/)[0].split('\n')[0]):'';
 const montoMatch=upper.match(/\bRECIBISTE\s+DE\s+(?:OTRO\s+BANCO|OTRA\s+CUENTA)[^$\n]{0,65}\$\s*([\d,]+(?:\.\d{2})?)/);
 const monto=montoMatch?Number(montoMatch[1].replace(/,/g,'')):null;
 const cuentaMatch=upper.match(/\bA\s+TU\s+CUENTA\s*\*{2,}\s*(\d{4})(?!\d)/);
 const cuenta=cuentaMatch?cuentaMatch[1]:'';
 const fecha=fechaDeAviso(upper);
 const id=String(mensaje?.id||'');
 const limite=Number(config.PAGOS_BANK_MAIL_MAX_DIAS||7);
 const received=Date.parse(mensaje?.receivedDateTime||'');
 const reciente=Number.isFinite(received)&&Date.now()-received<=Math.min(14,Math.max(1,limite))*86400000
  &&received<=Date.now()+300000;
 return {autorizado,tracking:tracking.length>=12&&tracking.length<=90?tracking:'',monto,cuenta,fecha,id,reciente};
}
function corresponde(pago,noticia,config=process.env){
 const cuenta=suffix(config.PAGOS_DESTINO_ULTIMOS4||'4409');
 return Boolean(noticia.autorizado&&noticia.reciente&&noticia.id&&noticia.tracking
  &&clave(pago?.folioOperacion)===noticia.tracking&&noticia.cuenta===cuenta
  &&cuenta.length===4&&noticia.fecha===String(pago?.fechaOperacion).slice(0,10)
  &&Number.isFinite(noticia.monto)&&centavos(noticia.monto)===centavos(pago?.monto));
}
let tokenCache={token:'',expires:0,refresh:''};
let pendingAuth=null;
function configurado(env=process.env){
 return env.PAGOS_BANK_AUTO_VALIDATE==='true'
  &&Boolean(env.PAGOS_OUTLOOK_MAILBOX&&env.PAGOS_MS_CLIENT_ID&&env.PAGOS_MS_REFRESH_TOKEN
    &&env.PAGOS_BANK_FROM_ADDRESS&&env.PAGOS_DESTINO_ULTIMOS4);
}
async function refreshToken(){
 if(tokenCache.token&&Date.now()<tokenCache.expires-90000)return tokenCache.token;
 if(pendingAuth)return pendingAuth;
 pendingAuth=(async()=>{
  const form=new URLSearchParams({client_id:process.env.PAGOS_MS_CLIENT_ID,
   grant_type:'refresh_token',refresh_token:tokenCache.refresh||process.env.PAGOS_MS_REFRESH_TOKEN,
   scope:'offline_access Mail.Read User.Read'});
  const response=await fetch('https://login.microsoftonline.com/consumers/oauth2/v2.0/token',{
   method:'POST',body:form,signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error('Microsoft OAuth no pudo renovar autorización ('+response.status+')');
  const data=await response.json();
  if(!data.access_token)throw Error('Microsoft OAuth no devolvió access_token');
  tokenCache={token:data.access_token,expires:Date.now()+Math.min(Number(data.expires_in||3600),3600)*1000,
    refresh:data.refresh_token||tokenCache.refresh||process.env.PAGOS_MS_REFRESH_TOKEN};
  return tokenCache.token;
 })();
 try{return await pendingAuth}finally{pendingAuth=null}
}
async function graphGet(path){
 const response=await fetch('https://graph.microsoft.com/v1.0'+path,{headers:{
  Authorization:'Bearer '+await refreshToken(),Accept:'application/json',
  Prefer:'outlook.body-content-type="text"'
 },signal:AbortSignal.timeout(15000)});
 if(!response.ok)throw Error('Microsoft Graph devolvió estado '+response.status);
 return response.json();
}
async function obtenerAvisos(){
 if(!configurado())return [];
 const me=await graphGet('/me?$select=mail,userPrincipalName');
 const permitida=String(process.env.PAGOS_OUTLOOK_MAILBOX||'').toLowerCase();
 if(![me.mail,me.userPrincipalName].map(x=>String(x||'').toLowerCase()).includes(permitida))
  throw Error('La cuenta Outlook autorizada no coincide con PAGOS_OUTLOOK_MAILBOX');
 const qs=new URLSearchParams({'$top':'100','$select':'id,receivedDateTime,from,subject,body,internetMessageHeaders',
  '$orderby':'receivedDateTime desc'});
 const inbox=await graphGet('/me/mailFolders/inbox/messages?'+qs);
 return (inbox.value||[]).map(m=>datosAviso(m));
}
function huellaMensaje(messageId,mailbox=process.env.PAGOS_OUTLOOK_MAILBOX){
 return createHash('sha256').update(String(mailbox||'').toLowerCase()+':'+String(messageId)).digest('hex');
}
module.exports={datosAviso,corresponde,configurado,obtenerAvisos,huellaMensaje,fechaDeAviso};
