'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'../..',p),'utf8');

test('solicitud del 12-NOV-2026 para 20-NOV vence 13-NOV a fin del día',()=>{
 const avisos=require('../src/services/casa-club-avisos.service');
 const {plazoEfectivo}=require('../src/services/casa-club-plazo-efectivo.service');
 assert.equal(avisos.limitePago('2026-11-12','2026-11-20',1),'2026-11-13');
 assert.equal(plazoEfectivo({creadoEn:'2026-11-12T18:00:00Z',
  fecha:'2026-11-20',fechaLimitePago:'2026-11-15'}),'2026-11-13');
 assert.equal(plazoEfectivo({creadoEn:'2026-11-12T18:00:00Z',
  fecha:'2026-11-20',fechaLimitePago:'2026-11-12'}),'2026-11-12');
});
test('la página de Casa Club integra gestión e historial como pestañas, no botón inferior',()=>{
 const html=read('docs/casa-club.html');
 const js=read('docs/assets/js/casa-club.js');
 assert.match(html,/data-tab="tarjetas"/);
 assert.match(html,/data-tab="historial-rojas"/);
 assert.match(html,/id="clubRojasSearch"/);
 assert.match(html,/id="clubRojasHistoryRows"/);
 assert.doesNotMatch(html,/id="clubManageRedCards"/);
 assert.match(js,/MJClubRojasAdmin\?\.mostrar\(name\)/);
});
test('Seguridad muestra tarjetas en cuotas sin nombres ni datos personales',()=>{
 const sec=read('docs/seguridad.html');
 const table=read('docs/assets/js/seguridad-cuotas.js');
 const cards=read('docs/assets/js/seguridad-tarjetas-rojas.js');
 const api=read('backend/src/controllers/casa-club-tarjetas-rojas.controller.js');
 assert.match(sec,/<th>Tarjetas rojas<\/th><th>Acciones<\/th>/);
 assert.match(table,/data-red-count-id/);
 assert.match(table,/data-red-manage/);
 assert.match(cards,/t\.motivoRetiro|Motivo|Incidencia registrada para la vivienda/);
 assert.match(api,/const seguro=rolAdmin\(req\)\?detalle/);
 assert.match(api,/id:t\.id,activa:t\.activa,asignadaEn:t\.asignadaEn/);
 assert.match(api,/if\(!rolAdmin\(req\)\)return res\.status\(403\)/);
});
test('el backend corrige vencimientos previos antes de liberar la fecha',()=>{
 const controller=read('backend/src/controllers/casa-club.controller.js');
 assert.match(controller,/const pendientes=await Reserva\.findAll/);
 assert.match(controller,/plazoEfectivo\(reserva\)/);
 assert.match(controller,/fechaLimitePago:correcto/);
 assert.match(controller,/fechaLimitePago:\{\[Op\.lt\]:hoy\(\)\}/);
});
