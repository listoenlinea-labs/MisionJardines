'use strict';
// Ejecutar localmente con el Client ID de una app Microsoft Entra compatible
// con cuentas personales (Mail.Read delegado + offline_access + User.Read).
// No registra tokens en archivos ni en GitHub; copia el refresh token a Hostinger.
const clientId=process.env.PAGOS_MS_CLIENT_ID;
if(!clientId)throw Error('Configura PAGOS_MS_CLIENT_ID antes de iniciar.');
const base='https://login.microsoftonline.com/consumers/oauth2/v2.0/';
const scope='Mail.Read User.Read offline_access';
async function post(uri,fields){
 const r=await fetch(base+uri,{method:'POST',body:new URLSearchParams(fields),signal:AbortSignal.timeout(12000)});
 const body=await r.json().catch(()=>({}));
 return {status:r.status,body};
}
async function main(){
 const {status,body}=await post('devicecode',{client_id:clientId,scope});
 if(status!==200)throw Error('No fue posible solicitar el código OAuth: '+(body.error||status));
 console.log('\nAbre '+body.verification_uri+' e introduce el código '+body.user_code);
 console.log('Inicia sesión únicamente con el buzón autorizado; NO compartas tus contraseñas.');
 const expires=Date.now()+Math.min(body.expires_in||900,900)*1000;
 let interval=Math.max(5,body.interval||5)*1000;
 while(Date.now()<expires){
  await new Promise(resolve=>setTimeout(resolve,interval));
  const response=await post('token',{grant_type:'urn:ietf:params:oauth:grant-type:device_code',
   client_id:clientId,device_code:body.device_code});
  if(response.status===200){
   console.log('\nAutorización concedida. Añade SOLO en variables privadas de Hostinger:');
   console.log('PAGOS_MS_REFRESH_TOKEN='+response.body.refresh_token);
   console.log('La clave anterior debe ocultarse en capturas, tickets y logs.');
   return;
  }
  if(response.body.error==='slow_down'){interval+=5000;continue}
  if(response.body.error==='authorization_pending')continue;
  throw Error('Microsoft rechazó la autorización: '+(response.body.error||response.status));
 }
 throw Error('Caducó el código temporal de Microsoft. Vuelve a ejecutar el script.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
