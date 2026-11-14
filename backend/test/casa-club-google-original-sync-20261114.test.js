'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.resolve(__dirname,'../..',p),'utf8');

function syncHelpers(){
 const source=read('backend/src/services/casa-club-google-sync.service.js');
 const module={exports:{}};
 const requireStub=p=>{
  if(p==='sequelize')return{Op:{gte:'gte',in:'in',or:'or'}};
  if(p==='../models/ReservaCasaClub')return {};
  if(p==='../models')return {Casa:{}};
  if(p==='./casa-club-google-client.service')return {};
  if(p==='./casa-club-tarifas.service')return {obtener:async()=>({})};
  throw Error('Unexpected dependency '+p);
 };
 vm.runInNewContext(source,{module,require:requireStub,process:{env:{}},
  Intl,Date,console,setInterval,clearInterval,Number,String,Map,Set,Promise,
  Buffer,Error,RegExp},{filename:'casa-club-google-sync.service.js'});
 return module.exports;
}
test('Google API usa hoja original con acceso de escritura por cuenta de servicio',()=>{
 const client=read('backend/src/services/casa-club-google-client.service.js');
 assert.match(client,/CASA_CLUB_GOOGLE_SHEETS_ID/);
 assert.match(client,/CASA_CLUB_GOOGLE_SHEETS_TAB/);
 assert.match(client,/CASA_CLUB_GOOGLE_CREDENTIALS_BASE64/);
 assert.match(client,/https:\/\/www\.googleapis\.com\/auth\/spreadsheets/);
 assert.match(client,/valueInputOption=RAW/);
 assert.match(client,/insertDataOption=INSERT_ROWS/);
 assert.match(client,/header\[0\]!=='FOLIO'/);
});
test('fecha y folio legado se interpretan sin convertir reservas antiguas en pagadas',()=>{
 const {legacy,date}=syncHelpers();
 assert.equal(date('2026-11-21'),'2026-11-21');
 assert.equal(date('21/11/2026'),'2026-11-21');
 assert.equal(date('31/02/2026'),null);
 const row=legacy({values:['MJ-20261109-222708','09/11/2026 20:27:09',
  'example@gmail.com','25','Gardenias','Victor','3324551095','SÍ','2026-12-24','Diciembre']});
 assert.equal(row.fecha,'2026-12-24');
 assert.equal(row.numero,'25');
 assert.equal(row.propietario,true);
 const code=read('backend/src/services/casa-club-google-sync.service.js');
 assert.match(code,/estatus:'PENDIENTE',pagado:false,fechaLimitePago:null/);
 assert.match(code,/fechaBloqueada:row\.fecha/);
 assert.match(code,/if\(old&&\['RECHAZADA','CANCELADA'\]\.includes\(old\.estatus\)\)continue/);
});
test('resuelve calles del padrón sin adivinar casas con números duplicados',()=>{
 const {houseId}=syncHelpers();
 const casas=[{id:10,calle:'Gardenias',numero:'20'},
  {id:11,calle:'Rosas',numero:'20'}, {id:12,calle:'Jardines',numero:'181'}];
 assert.equal(houseId(['folio','','','20','Gardenias'],casas),10);
 assert.equal(houseId(['folio','','','20','MISIÓN GARDENIAS'],casas),10);
 assert.equal(houseId(['folio','','','181','Misión Jardines'],casas),12);
 assert.equal(houseId(['folio','','','20','Misión Jardines'],casas),null);
 assert.equal(houseId(['folio','','','20',''],casas),null);
});
test('dos altas y consultas de calendario reutilizan sincronización y rechazo de conflictos',()=>{
 const controller=read('backend/src/controllers/casa-club.controller.js');
 const worker=read('backend/src/server.js');
 const service=read('backend/src/services/casa-club-google-sync.service.js');
 assert.match(controller,/googleCasaClub\.beforeBooking\(fecha\)/);
 assert.ok(controller.split('googleCasaClub.beforeBooking(fecha)').length===3);
 assert.match(controller,/googleCasaClub\.sync\(\{force:true\}\)/);
 assert.match(controller,/await googleCasaClub\.sync\(\)/);
 assert.match(controller,/const dates=new Map/);
 assert.match(service,/FECHA_OCUPADA/);
 assert.match(worker,/casa-club-google-sync\.service'\)\.start\(\)/);
});
test('idempotencia por folio y fecha, sin tocar registros existentes',()=>{
 const service=read('backend/src/services/casa-club-google-sync.service.js');
 assert.match(service,/byFolio\.get\(row\.folio\)/);
 assert.match(service,/occupiedByLocal\.get\(row\.fecha\)/);
 assert.match(service,/SequelizeUniqueConstraintError/);
 assert.match(service,/!folios\.has\('CC-'\+r\.id\)/);
 assert.match(service,/if\(rows\.length\)await sheets\.append\(rows\)/);
 assert.doesNotMatch(service,/Reserva\.(destroy|update)\(/);
});
