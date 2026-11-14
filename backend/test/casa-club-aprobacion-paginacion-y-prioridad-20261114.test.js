'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const load=p=>fs.readFileSync(path.resolve(__dirname,'../../',p),'utf8');

test('Aprobación tiene búsqueda única, filtro mensual y paginación',()=>{
 const html=load('docs/casa-club.html'),js=load('docs/assets/js/casa-club.js');
 for(const id of ['clubReviewSearch','clubReviewMonth','clubReviewCount',
  'clubReviewPagination','clubReviewPrevious','clubReviewNext','clubReviewPageIndicator'])
  assert.equal(html.split('id="'+id+'"').length-1,1,id);
 assert.match(js,/const reviewSize=.*matches\?3:10/);
 assert.match(js,/adminRows\.filter\(r=>r\.estatus==='PENDIENTE'\)/);
 assert.match(js,/String\(b\.fecha\|\|''\)\.localeCompare\(String\(a\.fecha\|\|''\)\)/);
 assert.match(js,/rows\.slice\(from,from\+size\)/);
 assert.match(js,/reviewText\.addEventListener\('input'/);
 assert.match(js,/reviewMonth\.addEventListener\('change'/);
 assert.match(js,/reviewPage=Math\.min\(Math\.max\(1,reviewPage\),pages\)/);
});
test('El formato móvil conserva tarjetas y controles visibles',()=>{
 const css=load('docs/assets/css/casa-club.css');
 assert.match(css,/#tab-aprobacion \.club-review-filters/);
 assert.match(css,/#tab-aprobacion \.club-review-pagination/);
 assert.match(css,/#tab-aprobacion \.reservation-grid\{grid-template-columns:1fr\}/);
});
test('MySQL toma prioridad antes de resolver o insertar el legado',()=>{
 const js=load('backend/src/services/casa-club-google-sync.service.js');
 const priority=js.indexOf('const local=occupiedByLocal.get(row.fecha)');
 const insert=js.indexOf('const created=await Reserva.create');
 const ambiguous=js.indexOf('const casaId=houseId');
 assert.ok(priority>0&&insert>priority&&ambiguous>priority);
 assert.match(js,/if\(local\)\{[\s\S]*?continue;\s*\}/);
 assert.match(js,/if\(local\.folio!==row\.folio\)conflicts\+\+/);
 assert.match(js,/if\(old\.fechaBloqueada&&old\.fechaBloqueada===row\.fecha\)/);
 assert.doesNotMatch(js,/Reserva\.update\(/);
 assert.doesNotMatch(js,/Reserva\.destroy\(/);
});
