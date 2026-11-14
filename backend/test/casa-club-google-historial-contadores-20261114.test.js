'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const read=p=>fs.readFileSync(path.join(__dirname,'../..',p),'utf8');
const source=read('backend/src/services/casa-club-google-historial.service.js');
const exported={exports:{}};
vm.runInNewContext(source,{module:exported,require}, {filename:'casa-club-google-historial.service.js'});
const build=exported.exports.build;
const houseId=(row,casas)=>{
 const normalize=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/^mision\s+/,'').trim();
 const matches=casas.filter(c=>String(c.numero)===String(row[3])&&
  normalize(c.calle)===normalize(row[4]));
 return matches.length===1?matches[0].id:null;
};
const casas=[{id:1,numero:'20',calle:'Gardenias'},
 {id:2,numero:'25',calle:'Gardenias'}, {id:3,numero:'181',calle:'Jardines'}];
const mj=(folio,fecha,calle,numero,name,email='')=>({values:[
 folio,'10/11/2026 18:10:41',email,numero,calle,name,'3312345678','SÍ',fecha,'Noviembre'
]});
test('Incluye Google antiguo sin convertirlo en reserva MySQL ni pago',()=>{
 const rows=[mj('MJ-20260824-135502','2026-08-29','Gardenias','20','Maria'),
  mj('MJ-20261111-201041','2026-12-31','Mision Jardines','181','Reyna')];
 const out=build({sheetRows:rows,casas,existing:[],today:'2026-11-14',houseId});
 assert.equal(out.historial.length,2);
 assert.equal(out.historial[0].estatus,'HISTORICA_GOOGLE');
 assert.equal(out.historial[0].soloLectura,true);
 assert.equal(out.historial[0].fecha,'2026-08-29');
 assert.equal(out.historial[1].estatus,'EN_REVISION_GOOGLE');
 assert.equal(out.historial[1].casa.numero,'181');
 assert.equal(out.counts.solicitudes,2);
});
test('No duplica un registro exportado CC, mismo folio o misma vivienda y fecha',()=>{
 const present=[{id:3,folio:null,fecha:'2026-11-21',casaId:1,estatus:'APROBADA',
  solicitante:'Jorge',correo:'jorge@example.com',telefono:'3312345678',
  fechaBloqueada:'2026-11-21'}];
 const sheets=[mj('MJ-20261014-191630','2026-11-21','Gardenias','20','Jorge Hermosillo'),
  {values:['CC-3','11/11/2026 19:42:20','jorge@example.com','20','Gardenias','Jorge','3312345678','NO','2026-11-21','Noviembre']}];
 const out=build({sheetRows:sheets,casas,existing:present,today:'2026-11-14',houseId});
 assert.equal(out.historial.length,0);
 assert.equal(out.counts.solicitudes,1);
 assert.equal(out.counts.reservadas,1);
});
test('Si Google difiere de MySQL por vivienda, conserva evidencia sin sobreescribir la fecha',()=>{
 const local=[{id:2,folio:null,fecha:'2026-12-31',fechaBloqueada:'2026-12-31',
  estatus:'PENDIENTE',casaId:1,solicitante:'Jorge'}];
 const out=build({sheetRows:[mj('MJ-20261111-201041','2026-12-31','Jardines','181','Reyna')],
  casas,existing:local,today:'2026-11-14',houseId});
 assert.equal(out.historial[0].estatus,'CONFLICTO_GOOGLE');
 assert.equal(out.counts.enRevision,1);
 assert.equal(local[0].estatus,'PENDIENTE');
});
test('Los contadores distinguen solicitudes de personas distintas (estimación)',()=>{
 const local=[{id:2,fecha:'2026-11-22',estatus:'PENDIENTE',solicitante:'Maria',correo:'maria@example.com'},
  {id:3,fecha:'2026-12-22',estatus:'APROBADA',solicitante:'Maria',correo:'maria@example.com'}];
 const out=build({sheetRows:[mj('MJ-20261014-191630','2026-08-29','Gardenias','20','Jorge','jorge@example.com')],
  casas,existing:local,today:'2026-11-14',houseId});
 assert.equal(out.counts.solicitudes,3);
 assert.equal(out.counts.personas,2);
 assert.equal(out.counts.enRevision,1);
});
test('Se conserva la tabla administrativa y las filas antiguas no tienen acciones destructivas',()=>{
 const ctrl=read('backend/src/controllers/casa-club.controller.js');
 const js=read('docs/assets/js/casa-club.js');
 const html=read('docs/casa-club.html');
 const client=read('backend/src/services/casa-club-google-client.service.js');
 assert.match(ctrl,/historialGoogle:googleResult\.historialGoogle/);
 assert.match(js,/historicGoogleRows=\(d\.historialGoogle\|\|\[\]\)/);
 assert.match(js,/const acciones=r\.soloLectura\?/);
 assert.match(js,/r\.soloLectura\?'—':money\(r\.cuotaRecuperacion\)/);
 assert.match(js,/clubReviewSummary/);
 assert.match(html,/id="clubReviewSummary"/);
 assert.match(client,/!K1:L5/);
 assert.match(client,/if\(first!==summaryMarker && hasOtherContent\)/);
 assert.match(client,/valueInputOption=RAW/);
 assert.doesNotMatch(client,/batchUpdate/);
});
