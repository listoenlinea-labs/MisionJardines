'use strict';
// Ejecutar localmente, nunca en Hostinger. Requiere cliente OAuth tipo Escritorio.
const http=require('node:http');
const {randomBytes,createHash}=require('node:crypto');
const ID=process.env.PAGOS_GMAIL_CLIENT_ID;
const SECRET=process.env.PAGOS_GMAIL_CLIENT_SECRET;
const MAILBOX=String(process.env.PAGOS_GMAIL_MAILBOX||'misionjardines.gdl@gmail.com').toLowerCase();
if(!ID||!SECRET){console.error('Configura PAGOS_GMAIL_CLIENT_ID y PAGOS_GMAIL_CLIENT_SECRET');process.exit(1)}
const b64=data=>Buffer.from(data).toString('base64url');
const verifier=b64(randomBytes(48)),challenge=b64(createHash('sha256').update(verifier).digest());
const state=b64(randomBytes(24));
async function main(){
 const server=http.createServer();
 await new Promise((resolve,reject)=>server.listen(0,'127.0.0.1',e=>e?reject(e):resolve()));
 const redirect='http://127.0.0.1:'+server.address().port+'/oauth';
 const url=new URL('https://accounts.google.com/o/oauth2/v2/auth');
 for(const [k,v] of Object.entries({
  client_id:ID,redirect_uri:redirect,response_type:'code',
  scope:'https://www.googleapis.com/auth/gmail.readonly',
  access_type:'offline',prompt:'consent',state,code_challenge:challenge,code_challenge_method:'S256'
 }))url.searchParams.set(k,v);
 console.log('\n1. Abre esta dirección en tu navegador:\n'+url+'\n');
 console.log('2. Autoriza exclusivamente '+MAILBOX+' y revisa el permiso de lectura.');
 let done=false;
 const code=await new Promise((resolve,reject)=>{
  const timeout=setTimeout(()=>{server.close();reject(Error('Expiró la autorización local'))},180000);
  server.on('request',(req,res)=>{
   const uri=new URL(req.url,redirect);
   if(done||uri.pathname!=='/oauth'){res.writeHead(404).end('No disponible');return}
   done=true;clearTimeout(timeout);
   if(uri.searchParams.get('state')!==state||!uri.searchParams.get('code')){
    res.writeHead(400,{'Content-Type':'text/plain'}).end('No se autorizó Gmail');
    server.close();reject(Error('Estado OAuth no válido o acceso rechazado'));return;
   }
   res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'}).end('Autorización recibida. Vuelve a PowerShell.');
   server.close();resolve(uri.searchParams.get('code'));
  });
 });
 const response=await fetch('https://oauth2.googleapis.com/token',{
  method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
  body:new URLSearchParams({client_id:ID,client_secret:SECRET,code,code_verifier:verifier,
   redirect_uri:redirect,grant_type:'authorization_code'}),signal:AbortSignal.timeout(12000)
 });
 if(!response.ok)throw Error('Google no pudo emitir tokens. Estado HTTP '+response.status);
 const token=await response.json();
 if(!token.refresh_token||!token.access_token)throw Error('Falta refresh token; revisa los permisos y ejecuta de nuevo');
 const check=await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile',{
  headers:{Authorization:'Bearer '+token.access_token},signal:AbortSignal.timeout(12000)
 });
 if(!check.ok)throw Error('No fue posible verificar el buzón autorizado ('+check.status+')');
 const profile=await check.json();
 if(String(profile.emailAddress||'').toLowerCase()!==MAILBOX)throw Error('Cuenta equivocada: no se emitirá token para ese buzón');
 console.log('\nBuzón autorizado: '+MAILBOX);
 console.log('Guarda SOLO en las variables privadas de Hostinger:');
 console.log('PAGOS_GMAIL_REFRESH_TOKEN='+token.refresh_token);
 console.log('\nNO pegues este valor en ChatGPT, GitHub, screenshots o correos.');
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
