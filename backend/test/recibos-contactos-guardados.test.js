'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.resolve(__dirname,'../..',p),'utf8');
const source=read('backend/src/services/contacto-recibos-analisis.service.js');
const ui=read('docs/assets/js/analisis-cuotas.js');
const html=read('docs/analisis-cuotas.html');
const css=read('docs/assets/css/analisis-cuotas.css');

function mockService(){
 const rows=new Map([[542,{id:542,telefono:null,correo:null}]]);
 const updates=[];
 const Casa={
  async findByPk(id){
   if(!rows.has(id))return null;
   const row=rows.get(id);
   return {...row,async update(payload,options){
    updates.push({id,payload,options});
    Object.assign(row,payload);return this;
   }};
  }
 };
 const module={exports:{}};
 new Function('module','exports','require',source)(module,module.exports,
  name=>{
   if(name==='../models')return {Casa};
   throw Error('Unexpected dependency '+name);
  });
 return {api:module.exports,rows,updates};
}
test('un telefono dictado de diez dígitos se normaliza y persiste solo en direcciones.telefono',async()=>{
 const {api,rows,updates}=mockService();
 const result=await api.guardarContacto(542,'telefono','33 1234 5678',18);
 assert.deepEqual(result,{casaId:542,campo:'telefono',valor:'523312345678',guardado:true});
 assert.equal(rows.get(542).telefono,'523312345678');
 assert.equal(rows.get(542).correo,null);
 assert.deepEqual(updates[0].payload,{telefono:'523312345678'});
 assert.deepEqual(updates[0].options.fields,['telefono']);
});
test('guardar correo usa una sola columna y no modifica el telefono de la vivienda',async()=>{
 const {api,rows,updates}=mockService();
 rows.get(542).telefono='523312345678';
 const result=await api.guardarContacto(542,'correo',' residente@example.com ',18);
 assert.equal(result.valor,'residente@example.com');
 assert.equal(rows.get(542).correo,'residente@example.com');
 assert.equal(rows.get(542).telefono,'523312345678');
 assert.deepEqual(updates[0].payload,{correo:'residente@example.com'});
 assert.deepEqual(updates[0].options.fields,['correo']);
 await api.guardarContacto(542,'correo','residente@example.com',18);
 assert.equal(updates.length,1,'no repetir escrituras si el valor ya esta guardado');
});
test('validacion del telefono acepta formatos mexicanos y rechaza texto ajeno',()=>{
 const {api}=mockService();
 assert.equal(api.telefonoMX('3312345678'),'523312345678');
 assert.equal(api.telefonoMX('+52 (33) 1234-5678'),'523312345678');
 assert.equal(api.telefonoMX('5213312345678'),'523312345678');
 for(const invalid of ['','abc3312345678','33555','55555555555555','3312345678;extra']){
  assert.throws(()=>api.telefonoMX(invalid),e=>e.status===400);
 }
});
test('guardar requiere vivienda existente, administrador y campo permitido',async()=>{
 const {api,updates}=mockService();
 await assert.rejects(api.guardarContacto(543,'telefono','3312345678',18),e=>e.status===404);
 for(const [id,campo,value,actor] of [
  [0,'telefono','3312345678',18],[542,'usuarioId','1',18],
  [542,'correo','uno@example.com,otro@example.com',18],
  [542,'correo','otro@ejemplo.com\nBCC:abc@example.com',18],
  [542,'correo','',18],
  [542,'correo','A'.repeat(150)+'@example.com',18],
  [542,'telefono','3312345678',0]
 ]){
  await assert.rejects(api.guardarContacto(id,campo,value,actor),
   e=>e.status===400);
 }
 assert.equal(updates.length,0);
});
test('la API solo esta abierta a administradores y permite guardar cada campo por separado',()=>{
 const routes=read('backend/src/routes/finanzas.routes.js');
 const ctrl=read('backend/src/controllers/contacto-recibos-analisis.controller.js');
 assert.match(routes,/router.use\(autenticarToken,autorizarRoles\('SUPER_ADMIN','ADMINISTRADOR'\)\)/);
 assert.match(routes,/router.patch\('\/viviendas\/:casaId\/contacto-recibo\/:campo',contactoRecibo.guardar\)/);
 assert.match(ctrl,/req\.usuario\.usuarioId/);
 assert.match(ctrl,/req\.body\?\.valor/);
 assert.doesNotMatch(source,/Usuario\.update|Condomino\.update/);
});
test('los contactos guardados en la vivienda tienen prioridad al abrir el recibo',()=>{
 const phone=read('backend/src/services/recibo-mantenimiento-analisis.service.js');
 const email=read('backend/src/services/recibos-correo-analisis.service.js');
 const iCasa=phone.indexOf("agregarTelefonos(destinatarios, vistos, casa.telefono");
 const iPrincipal=phone.indexOf("for (const u of usuarios.filter(item => item.esContactoPrincipal))");
 assert.ok(iCasa>=0&&iCasa<iPrincipal,'el telefono casa debe mostrarse antes del contacto vinculado');
 assert.match(email,/if\(validEmail\(casa\.correo\)\)return String\(casa\.correo\)\.trim\(\)/);
});
test('modal guarda telefono y correo con botones independientes y no guarda al enviar',()=>{
 for(const id of ['houseReceiptPhoneSave','houseReceiptEmailSave','houseReceiptPhoneInput','houseReceiptEmailInput']){
  assert.ok(html.includes('id="'+id+'"'),id);
 }
 assert.match(ui,/contacto-recibo\/'\+campo/);
 assert.match(ui,/\{valor\},'PATCH'/);
 assert.match(ui,/if\(isPhone\)receiptPhoneSaving=true;else receiptEmailSavingContact=true/);
 assert.match(ui,/receiptSavedPhone=response.data.valor/);
 assert.match(ui,/receiptSavedEmail=response.data.valor/);
 assert.match(ui,/receiptDetails\.correo=response.data.valor/);
 assert.match(ui,/updateReceiptEmail\(\)/);
 assert.match(ui,/updateReceiptPhone\(\)/);
 // El envio sigue sin invocar guardarContactoDelRecibo.
 const start=ui.indexOf("$('houseReceiptEmailSend').addEventListener");
 const end=ui.indexOf("$('financialSummary').addEventListener",start);
 assert.ok(start>0&&end>start);
 assert.doesNotMatch(ui.slice(start,end),/guardarContactoDelRecibo/);
});
test('exito SMTP despliega notificacion central transitoria y no engaña ante fallos',()=>{
 assert.match(html,/id="financeReceiptEmailSuccess"[^>]*role="status"/);
 assert.match(css,/\.finance-receipt-email-success\{position:fixed;left:50%;top:50%/);
 assert.match(css,/\.finance-receipt-email-success\[hidden\]\{display:none!important\}/);
 assert.match(ui,/if\(response\.data\?\.enviado!==true\)throw Error/);
 assert.match(ui,/showReceiptEmailCenterSuccess\(response\.data\.correo\)/);
 assert.match(ui,/setTimeout\(\(\)=>\{toast\.hidden=true;receiptEmailToastTimeout=null;\},4200\)/);
 assert.match(html,/analisis-cuotas\.js\?v=20261104-guardar-contactos-y-confirmacion-v1/);
 assert.match(html,/analisis-cuotas\.css\?v=20261104-guardar-contactos-y-confirmacion-v1/);
 assert.doesNotThrow(()=>new Function(ui));
});
