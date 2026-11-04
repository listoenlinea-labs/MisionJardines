'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const nodemailer=require('nodemailer');
const mail=require('../src/services/email.service');

const names=[
 'SMTP_HOST','SMTP_PORT','SMTP_SECURE','SMTP_USER','SMTP_PASSWORD',
 'SMTP_FROM_EMAIL','SMTP_FROM_NAME',
 'MJ_GMAIL_SMTP_HOST','MJ_GMAIL_SMTP_PORT','MJ_GMAIL_SMTP_SECURE',
 'MJ_GMAIL_SMTP_USER','MJ_GMAIL_SMTP_PASSWORD','MJ_GMAIL_SMTP_FROM_EMAIL',
 'MJ_GMAIL_SMTP_FROM_NAME'
];
function setEnvironment(t,values){
 const old=new Map(names.map(key=>[key,process.env[key]]));
 t.after(()=>{
  for(const [key,value] of old){
   if(value===undefined)delete process.env[key];
   else process.env[key]=value;
  }
 });
 for(const key of names)delete process.env[key];
 Object.assign(process.env,values);
}
const legacy={
 SMTP_HOST:'smtpout.secureserver.net',SMTP_PORT:'465',SMTP_SECURE:'true',
 SMTP_USER:'listoenlinea@example.com',SMTP_PASSWORD:'legacy-secret',
 SMTP_FROM_EMAIL:'listoenlinea@example.com',SMTP_FROM_NAME:'Listo en Línea'
};
const gmail={
 MJ_GMAIL_SMTP_HOST:'smtp.gmail.com',MJ_GMAIL_SMTP_PORT:'465',
 MJ_GMAIL_SMTP_SECURE:'true',MJ_GMAIL_SMTP_USER:'misionjardinesgdl@gmail.com',
 MJ_GMAIL_SMTP_PASSWORD:'fake-app-password-test',
 MJ_GMAIL_SMTP_FROM_EMAIL:'misionjardinesgdl@gmail.com',
 MJ_GMAIL_SMTP_FROM_NAME:'Administración Misión Jardines'
};
const receipt={
 destinatario:'residente@example.com',folio:'MJ-NOV-2026-TEST-G5-M',
 buffer:Buffer.from('%PDF-prueba'),nombreArchivo:'MJ-NOV-2026-TEST-G5-M.pdf',
 concepto:'MANTENIMIENTO',proyecto:null,casa:'Gardenias 5',monto:300
};

test('si faltan variables de Gmail, NO se envía usando el SMTP existente',async t=>{
 setEnvironment(t,legacy);
 let transports=0;
 t.mock.method(nodemailer,'createTransport',()=>{transports++;throw Error('No se debe conectar');});
 assert.doesNotThrow(()=>mail.validarConfiguracionSmtp(),'el SMTP de Listo permanece válido');
 assert.throws(()=>mail.validarConfiguracionGmailRecibos(),error=>
  error.code==='MJ_GMAIL_SMTP_CONFIG_INCOMPLETA'&&
  error.message.includes('MJ_GMAIL_SMTP_HOST')&&
  !error.message.includes('legacy-secret'));
 await assert.rejects(mail.enviarReciboAdjunto(receipt),error=>
  error.status===503&&/MJ_GMAIL_SMTP_/.test(error.message));
 assert.equal(transports,0,'nunca crea transporte Listo como respaldo de Gmail');
 assert.equal(process.env.SMTP_HOST,'smtpout.secureserver.net');
});

test('recibo por Gmail y demás notificaciones por SMTP de Listo son independientes',async t=>{
 setEnvironment(t,{...legacy,...gmail});
 const created=[],sent=[];
 t.mock.method(nodemailer,'createTransport',config=>{
  const number=created.push(config);
  return {sendMail:async options=>{
   sent.push({transport:number,...options});
   return {messageId:'mock-id-'+number,accepted:[options.to]};
  }};
 });
 const result=await mail.enviarReciboAdjunto(receipt);
 assert.equal(result.messageId,'mock-id-1');
 assert.equal(created[0].host,'smtp.gmail.com');
 assert.equal(created[0].port,465);
 assert.equal(created[0].secure,true);
 assert.equal(created[0].auth.user,'misionjardinesgdl@gmail.com');
 assert.equal(created[0].auth.pass,'fake-app-password-test');
 assert.equal(sent[0].from.address,'misionjardinesgdl@gmail.com');
 assert.equal(sent[0].from.name,'Administración Misión Jardines');
 assert.equal(sent[0].attachments[0].filename,receipt.nombreArchivo);
 assert.deepEqual(sent[0].attachments[0].content,receipt.buffer);

 const answer=await mail.enviarInvitacionPreregistro({
  destinatario:'nuevo@example.com',nombre:'Prueba',domicilio:'Gardenias 10',
  enlace:'https://example.com/invitacion'
 });
 assert.equal(answer,'mock-id-2');
 assert.equal(created.length,2,'se usan dos transportadores independientes');
 assert.equal(created[1].host,'smtpout.secureserver.net');
 assert.equal(created[1].auth.user,'listoenlinea@example.com');
 assert.equal(created[1].auth.pass,'legacy-secret');
 assert.equal(sent[1].from.address,'listoenlinea@example.com');
 assert.equal(sent[1].from.name,'Listo en Línea');
 assert.equal(process.env.SMTP_HOST,legacy.SMTP_HOST,'la configuración original no cambia');
});

test('las variables de Gmail requieren un puerto numérico y secure booleano',t=>{
 setEnvironment(t,{...legacy,...gmail,MJ_GMAIL_SMTP_PORT:'xxxx'});
 assert.throws(()=>mail.validarConfiguracionGmailRecibos(),/PORT/);
 process.env.MJ_GMAIL_SMTP_PORT='465';
 process.env.MJ_GMAIL_SMTP_SECURE='no';
 assert.throws(()=>mail.validarConfiguracionGmailRecibos(),/SECURE/);
});
