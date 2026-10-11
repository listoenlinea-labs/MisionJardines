'use strict';
// Acceso privado del backend a Google Sheets; nunca se entrega la llave al navegador.
const crypto=require('node:crypto');
const BASE='https://sheets.googleapis.com/v4/spreadsheets/';
const TYPES=new Set(['pagos','ingresos','egresos']);
const ranges={pagos:'GOOGLE_SHEETS_RANGO_PAGOS',ingresos:'GOOGLE_SHEETS_RANGO_INGRESOS',egresos:'GOOGLE_SHEETS_RANGO_EGRESOS'};
let cachedToken=null;
function config() {
  const spreadsheetId=process.env.GOOGLE_SHEETS_SPREADSHEET_ID||'';
  const base64=process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON_BASE64||'';
  if(!/^[A-Za-z0-9_-]{20,120}$/.test(spreadsheetId)||!base64) {
    const error=new Error('Google Sheets no está configurado en el servidor');error.status=503;throw error;
  }
  let key;
  try{key=JSON.parse(Buffer.from(base64,'base64').toString('utf8'));}catch(e){const err=new Error('Credenciales de Google Sheets inválidas');err.status=503;throw err;}
  if(key.type!=='service_account'||!key.client_email||!key.private_key||key.token_uri!=='https://oauth2.googleapis.com/token'){
    const error=new Error('La cuenta de servicio de Google Sheets no es válida');error.status=503;throw error;
  }
  return {spreadsheetId,key};
}
function assertType(tipo){
  if(!TYPES.has(tipo)){const error=new Error('Tipo de hoja no permitido');error.status=400;throw error;}
  const range=process.env[ranges[tipo]];
  if(!range||range.length>120||!/^'?[^!']{1,70}'?![A-Z]{1,2}1:[A-Z]{1,2}[1-9]\d{0,4}$/.test(range)){
    const error=new Error('Configura un rango A1 válido para '+tipo+' (por ejemplo Pagos!A1:H500)');
    error.status=503;throw error;
  }
  return range;
}
const b64=(x)=>Buffer.from(JSON.stringify(x)).toString('base64url');
async function fetchSafe(url,options={}){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),12000);
  try{return await fetch(url,{...options,signal:controller.signal});}
  finally{clearTimeout(timeout);}
}
async function accessToken(key){
  if(cachedToken&&cachedToken.email===key.client_email&&cachedToken.expires>Date.now()+60000)return cachedToken.value;
  const now=Math.floor(Date.now()/1000);
  const jwt=b64({alg:'RS256',typ:'JWT'})+'.'+b64({
    iss:key.client_email,scope:'https://www.googleapis.com/auth/spreadsheets.readonly',
    aud:key.token_uri,iat:now,exp:now+3600
  });
  const signed=jwt+'.'+crypto.sign('RSA-SHA256',Buffer.from(jwt),key.private_key).toString('base64url');
  const response=await fetchSafe(key.token_uri,{method:'POST',
    headers:{'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:signed})});
  if(!response.ok){const e=new Error('No se pudo autenticar la cuenta de Google Sheets; revisa permisos y llave');e.status=502;throw e;}
  const json=await response.json();
  if(!json.access_token)throw Error('Google no devolvió un token');
  cachedToken={value:json.access_token,email:key.client_email,expires:Date.now()+Math.min(3600,json.expires_in||3600)*1000};
  return cachedToken.value;
}
async function readSheet(tipo) {
  const range=assertType(tipo),{spreadsheetId,key}=config();
  const token=await accessToken(key);
  const response=await fetchSafe(BASE+encodeURIComponent(spreadsheetId)+'/values/'+encodeURIComponent(range)+'?valueRenderOption=FORMATTED_VALUE',{
    headers:{Authorization:'Bearer '+token}
  });
  if(!response.ok){const error=new Error(response.status===403||response.status===404?'La hoja no está compartida con la cuenta de servicio o su ID/rango es incorrecto':'Google Sheets no respondió correctamente');error.status=502;throw error;}
  const raw=await response.json();
  const values=Array.isArray(raw.values)?raw.values:[];
  if(values.length>5001){const error=new Error('El rango excede 5000 registros: reduce el rango');error.status=413;throw error;}
  const text=x=>String(x??'').trim().slice(0,400);
  const encabezados=(values[0]||[]).slice(0,40).map(text);
  if(!encabezados.length){return{tipo,encabezados:[],filas:[],total:0,range,spreadsheetId};}
  const filas=values.slice(1,5001).map((row,index)=>({
    fila:index+2,valores:encabezados.map((_,i)=>text(row[i])),
  })).filter(v=>v.valores.some(Boolean));
  return {tipo,encabezados,filas,total:filas.length,range,spreadsheetId};
}
module.exports={readSheet,assertType,config};
