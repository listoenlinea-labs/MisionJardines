'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const crypto=require('crypto');
const root=path.resolve(__dirname,'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

test('Foto de identificación se valida, cifra y puede descifrar solo desde el servicio',async()=>{
 const database=new Map();
 const FakeFoto={
  create:async value=>{database.set(value.visitaId,value);return value;},
  findByPk:async id=>database.get(id)||null
 };
 const module={exports:{}};
 vm.runInNewContext(read('backend/src/services/visitas-identificacion.service.js'),{
  module,require:name=>{
   if(name==='crypto')return crypto;
   if(name==='../models/VisitaIdentificacionFoto')return FakeFoto;
   throw new Error('Dependencia inesperada '+name);
  },process:{env:{VISITAS_IDENTIFICACION_KEY:'clave-exclusiva-de-pruebas-minimo-32-bytes'}},
  Buffer
 });
 const service=module.exports;
 const jpeg=Buffer.concat([Buffer.from([255,216,255]),Buffer.alloc(120,33)]);
 const raw='data:image/jpeg;base64,'+jpeg.toString('base64');
 const photo=service.validatePhoto(raw);
 assert.equal(photo.mime,'image/jpeg');
 assert.equal(photo.bytes.length,jpeg.length);
 const encrypted=service.encryptPhoto(photo);
 assert.ok(!encrypted.datosCifrados.equals(jpeg),'Nunca guardar imagen en claro');
 assert.equal(encrypted.nonce.length,12);
 assert.equal(encrypted.etiqueta.length,16);
 await service.save(42,encrypted);
 const decoded=await service.findForAdmin(42);
 assert.equal(decoded.mime,'image/jpeg');
 assert.deepEqual(decoded.bytes,jpeg);
 assert.equal(await service.findForAdmin(99),null);
 const modified={...database.get(42),etiqueta:Buffer.alloc(16)};
 database.set(42,modified);
 await assert.rejects(service.findForAdmin(42),'Se debe rechazar una foto manipulada');
});

test('Se rechazan archivos ajenos a imágenes y fotos excesivas',()=>{
 const module={exports:{}};
 vm.runInNewContext(read('backend/src/services/visitas-identificacion.service.js'),{
  module,require:name=>{
   if(name==='crypto')return crypto;
   if(name==='../models/VisitaIdentificacionFoto')return {};
   throw Error(name);
  },process:{env:{JWT_SECRET:'clave-de-prueba-suficientemente-larga'}},Buffer
 });
 const service=module.exports;
 assert.throws(()=>service.validatePhoto('data:text/html;base64,AAA='));
 const forged='data:image/jpeg;base64,'+Buffer.alloc(120).toString('base64');
 assert.throws(()=>service.validatePhoto(forged));
 assert.throws(()=>service.validatePhoto('data:image/png;base64,'+Buffer.alloc(700*1024).toString('base64')));
});

test('El formulario del guardia es exclusivo del rol real y oculta los campos innecesarios',()=>{
 const html=read('docs/visitas.html');
 assert.match(html,/actualIsSecurity = actualRole === 'SEGURIDAD'/);
 assert.match(html,/document\.body\.classList\.toggle\('visit-guard',actualIsSecurity\)/);
 assert.match(html,/\.page-visitas-v2\.visit-guard #visitModal \.guard-hide\{display:none!important\}/);
 assert.match(html,/class="form-row guard-hide"[\s\S]*?id="visitStreet"[\s\S]*?id="visitNumber"/);
 assert.match(html,/id="authorizedBy"/);
 assert.match(html,/placeholder=actualIsSecurity\?'Nombre del guardia'/);
 assert.match(html,/class="form-row guard-hide"[\s\S]*?id="visitDate"[\s\S]*?id="visitTime"/);
 assert.match(html,/id="visitType"/);
 assert.match(html,/id="visitorPlate"/);
 assert.match(html,/id="guardIdPhoto" type="file" accept="image\/\*" capture="environment"/);
 assert.match(html,/id="openGuardCamera" type="button"/);
 assert.match(html,/id="removeGuardPhoto"/);
 assert.match(html,/function mexicoCurrentParts\(\)/);
 assert.match(html,/duration|tipo/);
 assert.match(html,/guardPhotoData=await compressGuardIdPhoto\(file\)/);
 assert.match(html,/if\(guardPhotoData\)payload.identificacionFoto=guardPhotoData/);
 assert.match(html,/if\(guard\)\{toast\('Visita registrada correctamente en caseta\.'\);return;\}/);
 for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)){
  if(match[1].trim())assert.doesNotThrow(()=>new vm.Script(match[1]));
 }
});

test('Endpoint de fotografía requiere rol administrador y nunca se agrega a listado de seguridad',()=>{
 const routes=read('backend/src/routes/visitas.routes.js');
 const controller=read('backend/src/controllers/visitas.controller.js');
 const server=read('backend/src/server.js');
 assert.match(routes,/router\.get\('\/:id\/identificacion-foto', autenticarToken, managers, readIdentificationPhoto\)/);
 assert.match(controller,/if \(!isManager\(req\)\) return res\.status\(403\)/);
 assert.match(controller,/return isGuard\(req\) \? publicForGuard\(value\) : value/);
 assert.match(controller,/identificacion: guard \? null/);
 assert.match(server,/VisitaIdentificacionFoto'\)\.sync\(\)/);
});
