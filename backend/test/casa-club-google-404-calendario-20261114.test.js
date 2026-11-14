'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.resolve(__dirname,'../..',p),'utf8');

test('Google 404 da diagnóstico explícito sin exponer clave',()=>{
 const client=read('backend/src/services/casa-club-google-client.service.js');
 assert.match(client,/response\.status===404/);
 assert.match(client,/Documento no encontrado o no accesible/);
 assert.match(client,/response\.status===400/);
 assert.match(client,/response\.status===403/);
 assert.doesNotMatch(client,/console\.log\(.*private_key/);
});

test('El calendario conserva ocupación local cuando falla Google',()=>{
 const controller=read('backend/src/controllers/casa-club.controller.js');
 const start=controller.indexOf('async function fechas(req,res)');
 const end=controller.indexOf('async function domicilios(req,res)',start);
 const code=controller.slice(start,end);
 assert.match(code,/try\{google=await googleCasaClub\.sync\(\);\}/);
 assert.match(code,/catch\(syncError\)/);
 assert.match(code,/Reserva\.findAll/);
 assert.match(code,/disponibilidadVerificada:googleDisponible/);
 assert.match(code,/ocupadas:\[\.\.\.dates\.values\(\)\]/);
});

test('Sin verificación externa se muestran reservas conocidas, sin habilitar fechas libres',()=>{
 const js=read('docs/assets/js/casa-club.js');
 const html=read('docs/casa-club.html');
 assert.match(js,/response\.disponibilidadVerificada!==false/);
 assert.match(js,/calendarReady=googleVerificado/);
 assert.match(js,/btn\.disabled=Boolean\(status\)\|\|past\|\|!googleVerificado/);
 assert.match(js,/selectedDate='';\$\('clubDate'\)\.value=''/);
 assert.match(js,/No se pudo verificar Google Sheets/);
 assert.match(html,/casa-club\.js\?v=20261114-google-404-calendario/);
});
