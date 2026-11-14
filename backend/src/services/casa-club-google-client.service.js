'use strict';
// Independiente de la integración histórica de solo lectura: usa la hoja ORIGINAL.
const crypto=require('node:crypto');
const BASE='https://sheets.googleapis.com/v4/spreadsheets/';
let tokenCache=null;
const b64=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
function enabled(){return process.env.CASA_CLUB_GOOGLE_SYNC_ENABLED==='true';}
function config(){
 const id=String(process.env.CASA_CLUB_GOOGLE_SHEETS_ID||'').trim();
 const tab=String(process.env.CASA_CLUB_GOOGLE_SHEETS_TAB||'RESERVACIONES').trim();
 const encoded=process.env.CASA_CLUB_GOOGLE_CREDENTIALS_BASE64||'';
 if(!/^[A-Za-z0-9_-]{20,130}$/.test(id)||!/^[\p{L}\p{N}_ -]{1,60}$/u.test(tab)||!encoded)
  throw Error('Faltan variables CASA_CLUB_GOOGLE_*');
 let key;
 try{key=JSON.parse(Buffer.from(encoded,'base64').toString('utf8'));}
 catch(_){throw Error('Credenciales de Casa Club no son JSON válido');}
 if(key.type!=='service_account'||!key.client_email||!key.private_key||
    key.token_uri!=='https://oauth2.googleapis.com/token')
  throw Error('La cuenta de servicio de Casa Club no es válida');
 return {id,tab,key};
}
async function limitedFetch(url,options={}){
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),12000);
 try{return await fetch(url,{...options,signal:controller.signal});}
 finally{clearTimeout(timer);}
}
async function token(key){
 if(tokenCache?.email===key.client_email&&tokenCache.expires>Date.now()+60000)return tokenCache.value;
 const now=Math.floor(Date.now()/1000);
 const assertion=b64({alg:'RS256',typ:'JWT'})+'.'+b64({
  iss:key.client_email,scope:'https://www.googleapis.com/auth/spreadsheets',
  aud:key.token_uri,iat:now,exp:now+3600
 });
 const signed=assertion+'.'+crypto.sign('RSA-SHA256',Buffer.from(assertion),key.private_key).toString('base64url');
 const response=await limitedFetch(key.token_uri,{method:'POST',
  headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:signed})});
 if(!response.ok)throw Error('No se pudo autenticar la cuenta de servicio de Casa Club (HTTP '+response.status+')');
 const body=await response.json();
 if(!body.access_token)throw Error('Google OAuth no devolvió access_token');
 tokenCache={email:key.client_email,value:body.access_token,
  expires:Date.now()+Math.min(3600,Number(body.expires_in)||3600)*1000};
 return tokenCache.value;
}
async function query(method,suffix,body){
 const cfg=config(),bearer=await token(cfg.key);
 const url=BASE+encodeURIComponent(cfg.id)+suffix;
 const response=await limitedFetch(url,{method,headers:{
  Authorization:'Bearer '+bearer,...(body?{'Content-Type':'application/json'}:{})
 },...(body?{body:JSON.stringify(body)}:{})});
 if(!response.ok){
  let googleCode='',googleMessage='';
  try{
   const fault=await response.json();
   googleCode=String(fault?.error?.status||'');
   googleMessage=String(fault?.error?.message||'').slice(0,250);
  }catch(_){}
  const source=response.status===404?
   'Documento no encontrado o no accesible para esta cuenta de servicio. Revisa el ID exacto y el permiso Editor.':
   response.status===400?'El rango o nombre de pestaña es incorrecto.':
   response.status===403?'La cuenta de servicio no tiene permisos suficientes o la API está restringida.':
   'Google Sheets devolvió un error.';
  const error=new Error('Google Sheets Casa Club HTTP '+response.status+': '+source+
   (googleCode?' ['+googleCode+']':'')+(googleMessage?' '+googleMessage:''));
  error.statusCode=response.status;
  error.code='CASA_CLUB_GOOGLE_SHEETS';
  throw error;
 }
 return response.json();
}
const range=tab=>encodeURIComponent("'"+tab.replace(/'/g,"''")+"'!A1:J5000");
async function read(){
 const {tab}=config();
 const result=await query('GET','/values/'+range(tab)+'?valueRenderOption=FORMATTED_VALUE');
 const values=Array.isArray(result.values)?result.values:[];
 if(values.length>5000)throw Error('Hoja excede 5000 filas: revisar rango');
 const header=(values[0]||[]).map(x=>String(x||'').trim().toUpperCase());
 if(header[0]!=='FOLIO'||!header[8]?.includes('FECHA RESERVACI'))
  throw Error('La pestaña RESERVACIONES cambió columnas A-J; sincronización detenida');
 return values.slice(1).map((row,index)=>({row:index+2,
  values:Array.from({length:10},(_,i)=>String(row[i]??'').trim().slice(0,300))}))
  .filter(x=>x.values.some(Boolean));
}
async function append(rows){
 if(!rows.length)return{updates:{updatedRows:0}};
 const {tab}=config();
 return query('POST','/values/'+range(tab)+':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS',
  {majorDimension:'ROWS',values:rows});
}
// Pequeño resumen dentro de la MISMA pestaña, fuera de las columnas A:J
// del formulario antiguo. No sobreescribir contenido ajeno de K:L.
const summaryMarker='RESUMEN CASA CLUB (AUTOMATICO)';
async function updateSummary(summary){
 const {tab}=config();
 const address=encodeURIComponent("'"+tab.replace(/'/g,"''")+"'!K1:L5");
 const snapshot=await query('GET','/values/'+address+'?valueRenderOption=FORMATTED_VALUE');
 const current=snapshot.values||[];
 const first=String(current[0]?.[0]||'').trim();
 const hasOtherContent=current.some(r=>r.some(x=>String(x??'').trim()));
 if(first!==summaryMarker && hasOtherContent){
  console.warn('[CasaClub Google] Resumen omitido: las columnas K:L ya contienen información');
  return {skipped:true};
 }
 const rows=[
  [summaryMarker,''],
  ['Solicitudes únicas (ambos sistemas)',Number(summary.solicitudes)||0],
  ['Personas distintas (estimación)',Number(summary.personas)||0],
  ['En revisión',Number(summary.enRevision)||0],
  ['Reservadas',Number(summary.reservadas)||0]
 ];
 return query('PUT','/values/'+address+'?valueInputOption=RAW',
  {range:"'"+tab.replace(/'/g,"''")+"'!K1:L5",majorDimension:'ROWS',values:rows});
}
module.exports={enabled,config,read,append,updateSummary};
