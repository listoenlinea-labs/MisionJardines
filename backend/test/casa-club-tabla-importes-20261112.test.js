'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
Object.assign(process.env,{DB_HOST:'localhost',DB_PORT:'3306',DB_NAME:'test',DB_USER:'test',DB_PASSWORD:'test'});
const db=require('../src/config/database');
const migracion=require('../src/services/casa-club-homologar-importes.service');
const leer=archivo=>fs.readFileSync(path.resolve(__dirname,'../../',archivo),'utf8');

test('tabla administrativa muestra 14 columnas en el orden solicitado',()=>{
 const html=leer('docs/casa-club.html');
 const match=html.match(/<table class="club-table"><thead><tr>(.*?)<\/tr>/s);
 assert.ok(match,'Tabla de Administración de reservas');
 const columnas=[...match[1].matchAll(/<th>(.*?)<\/th>/g)].map(m=>m[1]);
 assert.deepEqual(columnas,[
  'Calle','No. casa','Nombre','Fecha del evento','Fecha y hora de solicitud',
  'Pago recuperación','Depósito garantía','Limpieza','Folio','Propietario',
  'Estatus pago','Observaciones','Estado','Acciones'
 ]);
 const ui=leer('docs/assets/js/casa-club.js');
 const inicio=ui.indexOf("$('clubAdminRows').innerHTML=tableRows.map(r=>");
 const fin=ui.indexOf("$('clubRequests').innerHTML=",inicio);
 assert.ok(inicio>=0&&fin>inicio,'Render de la tabla');
 const render=ui.slice(inicio,fin);
 assert.match(render,/r\.motivo\|\|'—'/,'Observaciones debe mostrar motivo del evento');
 assert.doesNotMatch(render,/r\.notas/,'No mostrar notas internas en Observaciones');
 assert.doesNotMatch(render,/data-paid|data-return/,'No mostrar cobro/devolución en acciones');
 assert.match(render,/data-delete/);
 assert.match(render,/data-release/);
 assert.match(render,/colspan="14"/);
});

test('tarifa legada no sustituye valores reales de reservas pendientes',()=>{
 const control=leer('backend/src/controllers/casa-club.controller.js');
 assert.doesNotMatch(control,/IMPORTES_LEGADOS/);
 assert.match(control,/const cargosSolicitud=row=>\(\{cuotaRecuperacion:row\.cuotaRecuperacion,depositoGarantia:row\.depositoGarantia,limpieza:row\.limpieza\}\)/);
});

test('migración respalda importes, actualiza reservas y tarifa una sola vez',async t=>{
 const statements=[];
 let aplicada=false;
 t.mock.method(db,'transaction',async cb=>cb({LOCK:{UPDATE:'UPDATE'}}));
 t.mock.method(db,'query',async (sql,options)=>{
  const st=sql.trim().replace(/\s+/g,' ');
  statements.push(st);
  if(st.startsWith('SELECT clave FROM casa_club_migraciones'))return [aplicada?[{clave:migracion.CLAVE}]:[],{}];
  if(st.startsWith('INSERT INTO casa_club_migraciones'))aplicada=true;
  if(st.startsWith('UPDATE reservas_casa_club'))return [[],{affectedRows:5}];
  return [[],{}];
 });
 const primero=await migracion.homologar();
 assert.deepEqual(primero,{aplicada:true,filasActualizadas:5});
 const backup=statements.findIndex(s=>s.startsWith('INSERT IGNORE INTO casa_club_importes_respaldo_20261112'));
 const actualiza=statements.findIndex(s=>s.startsWith('UPDATE reservas_casa_club'));
 const actualizaTarifa=statements.findIndex(s=>s.startsWith('UPDATE casa_club_tarifas'));
 assert.ok(backup>=0&&actualiza>backup,'Respaldo antes de modificar reservas');
 assert.ok(actualizaTarifa>actualiza);
 assert.match(statements[actualiza],/cuota_recuperacion=1000,deposito_garantia=700,limpieza=300/);
 assert.match(statements[actualizaTarifa],/cuota_recuperacion=1000,deposito_garantia=700,limpieza=300/);
 assert.ok(!statements.some(s=>/UPDATE pagos_reportados|UPDATE pagos_manuales/i.test(s)),'Sin alterar pagos');
 const segundo=await migracion.homologar();
 assert.deepEqual(segundo,{aplicada:false});
 assert.equal(statements.filter(s=>s.startsWith('UPDATE reservas_casa_club')).length,1);
 assert.equal(statements.filter(s=>s.startsWith('UPDATE casa_club_tarifas')).length,1);
});

test('el arranque aplica homologación después de sincronizar las tablas',()=>{
 const service=leer('backend/src/services/casa-club-schema.service.js');
 assert.match(service,/casa-club-homologar-importes\.service'\)\.homologar\(\)/);
 const model=leer('backend/src/models/TarifaCasaClub.js');
 assert.match(model,/defaultValue:1000/);
 assert.match(model,/defaultValue:300/);
});
