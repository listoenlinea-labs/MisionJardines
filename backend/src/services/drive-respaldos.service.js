'use strict';
const crypto=require('node:crypto');
const sequelize=require('../config/database');
const recibos=require('./recibos-masivos.service');
const {Casa}=require('../models');
const fail=(status,message)=>Object.assign(new Error(message),{status});
const redirect=()=>process.env.GOOGLE_DRIVE_REDIRECT_URI||'https://api-misionjardines.listoenlinea.host/api/finanzas/drive/callback';
const client=()=>{if(!process.env.GOOGLE_DRIVE_CLIENT_ID||!process.env.GOOGLE_DRIVE_CLIENT_SECRET||!process.env.JWT_SECRET)throw fail(503,'Configura GOOGLE_DRIVE_CLIENT_ID y GOOGLE_DRIVE_CLIENT_SECRET en Hostinger');return {id:process.env.GOOGLE_DRIVE_CLIENT_ID,secret:process.env.GOOGLE_DRIVE_CLIENT_SECRET};};
const encryptKey=()=>crypto.createHash('sha256').update(process.env.JWT_SECRET+':drive:2026').digest();
function encrypt(s){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',encryptKey(),iv);const content=Buffer.concat([c.update(s,'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),content]).toString('base64');}
function decrypt(s){const b=Buffer.from(s,'base64'),c=crypto.createDecipheriv('aes-256-gcm',encryptKey(),b.subarray(0,12));c.setAuthTag(b.subarray(12,28));return Buffer.concat([c.update(b.subarray(28)),c.final()]).toString();}
async function init(){
 await sequelize.query(`CREATE TABLE IF NOT EXISTS google_drive_respaldo (
  id TINYINT UNSIGNED PRIMARY KEY, refresh_token TEXT NOT NULL, folder_id VARCHAR(255) NULL,
  email VARCHAR(255) NULL, conectado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}
async function record(){const [r]=await sequelize.query('SELECT * FROM google_drive_respaldo WHERE id=1');return r[0]||null;}
function hmac(value){return crypto.createHmac('sha256',process.env.JWT_SECRET).update(value).digest('base64url');}
function loginUrl(userId){
 const {id}=client(),stamp=String(Date.now()),nonce=crypto.randomBytes(16).toString('hex');
 const payload=[userId,stamp,nonce].join(':'),state=Buffer.from(payload).toString('base64url')+'.'+hmac(payload);
 const params=new URLSearchParams({client_id:id,redirect_uri:redirect(),response_type:'code',
  scope:'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email',
  access_type:'offline',prompt:'consent',state});
 return 'https://accounts.google.com/o/oauth2/v2/auth?'+params.toString();
}
async function exchange(code){const {id,secret}=client();const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
 body:new URLSearchParams({code,client_id:id,client_secret:secret,redirect_uri:redirect(),grant_type:'authorization_code'})});
 const j=await r.json();if(!r.ok||!j.refresh_token)throw fail(502,'Google no entregó autorización persistente; reconecta aceptando permisos');return j;}
async function callback(code,state){
 const [encoded,sig]=String(state||'').split('.'),payload=Buffer.from(encoded||'','base64url').toString();
 if(!sig||sig!==hmac(payload))throw fail(403,'Estado OAuth inválido');
 const parts=payload.split(':');
 if(parts.length!==3||Date.now()-Number(parts[1])>10*60*1000||Date.now()<Number(parts[1]))throw fail(403,'La conexión expiró');
 const tokens=await exchange(code);
 const profile=await fetch('https://www.googleapis.com/oauth2/v3/userinfo',{headers:{Authorization:'Bearer '+tokens.access_token}}).then(r=>r.json()).catch(()=>({}));
 await sequelize.query('INSERT INTO google_drive_respaldo (id,refresh_token,email) VALUES (1,?,?) ON DUPLICATE KEY UPDATE refresh_token=VALUES(refresh_token),email=VALUES(email),folder_id=NULL,conectado_en=CURRENT_TIMESTAMP',
 {replacements:[encrypt(tokens.refresh_token),String(profile.email||'')]});
 return {email:profile.email||''};
}
async function access(){
 const {id,secret}=client(),r=await record();if(!r)throw fail(409,'Primero conecta una cuenta de Google Drive');
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
 body:new URLSearchParams({client_id:id,client_secret:secret,refresh_token:decrypt(r.refresh_token),grant_type:'refresh_token'})});
 const t=await response.json();if(!response.ok||!t.access_token)throw fail(502,'No se pudo renovar permiso de Drive; reconecta la cuenta');return t.access_token;
}
async function upload(token,name,mime,data,parent){
 const boundary='MJ'+crypto.randomBytes(12).toString('hex');
 const metadata={name,mimeType:mime,...(parent?{parents:[parent]}:{})};
 const part=Buffer.concat([Buffer.from('--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'+JSON.stringify(metadata)+'\r\n--'+boundary+'\r\nContent-Type: '+mime+'\r\n\r\n'),Buffer.from(data),Buffer.from('\r\n--'+boundary+'--')]);
 const response=await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink',
  {method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'multipart/related; boundary='+boundary},body:part});
 const j=await response.json();if(!response.ok)throw fail(502,'Google Drive rechazó '+name+': '+(j.error?.message||'error'));return j;
}
async function folder(token,name,parent){
 const q=new URLSearchParams({q:"name = '"+name.replace(/'/g,"\\'")+"' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"+(parent?" and '"+parent+"' in parents":''),fields:'files(id,name),nextPageToken',page_size:'100'});
 const r=await fetch('https://www.googleapis.com/drive/v3/files?'+q,{headers:{Authorization:'Bearer '+token}});
 const j=await r.json();if(!r.ok)throw fail(502,'No se pudo consultar carpetas de Drive');
 if(j.files?.length)return j.files[0].id;
 return (await upload(token,name,'application/vnd.google-apps.folder',Buffer.alloc(0),parent)).id;
}
async function status(){const r=await record();return {connected:!!r,email:r?.email||null,configured:!!process.env.GOOGLE_DRIVE_CLIENT_ID};}
async function backup({periodo,xlsx}){
 recibos.parsePeriodo(periodo);
 const bytes=Buffer.from(String(xlsx||''),'base64');if(!bytes.length||bytes.length>8*1024*1024||bytes[0]!==0x50||bytes[1]!==0x4B)throw fail(400,'El Excel del padrón no es válido (máximo 8 MB)');
 const token=await access();
 const root=await folder(token,'Misión Jardines - Respaldos');
 const dir=await folder(token,periodo,root);
 const {buffer,cantidad}=await recibos.generar(periodo);
 const zip=await upload(token,'Recibos_'+periodo+'.zip','application/zip',buffer,dir);
 const excel=await upload(token,'Padron_'+periodo+'.xlsx','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',bytes,dir);
 return {periodo,cantidad,zipId:zip.id,excelId:excel.id};
}
module.exports={init,loginUrl,callback,status,backup,fail};
