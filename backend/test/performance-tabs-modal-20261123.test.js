'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=filename=>fs.readFileSync(path.join(root,filename),'utf8');

test('Pestañas de Casa Club reutilizan lectura sin omitir cambios reales',()=>{
 const script=read('docs/assets/js/casa-club.js');
 assert.match(script,/let adminListPending=null,adminListUpdatedAt=0/);
 assert.match(script,/Date\.now\(\)-adminListUpdatedAt<12000/);
 assert.equal((script.match(/adminList\(false,true\)/g)||[]).length,3);
 assert.match(script,/adminList\(true\)/);
 assert.match(script,/adminListUpdatedAt=Date\.now\(\)/);
});
test('Calendario evita parpadeos y no permite reservar con datos sin verificar',()=>{
 const script=read('docs/assets/js/casa-club.js');
 assert.match(script,/calendarGrid\.inert=true/);
 assert.match(script,/calendarPaintedMonth!==currentMonth/);
 assert.match(script,/calendarReady=false;syncSubmit\(\)/);
 assert.match(script,/days\.inert=false/);
 assert.match(script,/googleVerificado=response\.disponibilidadVerificada!==false/);
});
test('Contadores se centralizan en shell y llegan mensajes desde iframes dinámicos',()=>{
 const script=read('docs/assets/js/site-sidebar.js');
 assert.match(script,/if\(!embeddedShell\)/);
 assert.match(script,/await Promise\.all\(tasks\)/);
 assert.match(script,/const activeFrame=document\.querySelector\('\.mj-app-frame\.is-active'\)/);
 assert.match(script,/if\(queuedForce\)/);
 assert.match(script,/window\.addEventListener\('message'/);
});
test('Historial ya no pagina, filtra por día y preserva llamadas',()=>{
 const route=read('backend/src/routes/conmutador-historial.routes.js');
 const page=read('docs/conmutador.html');
 const ui=read('docs/assets/js/conmutador.js');
 assert.match(route,/creado_en >= :fecha/);
 assert.match(route,/creado_en < DATE_ADD\(:fecha, INTERVAL 1 DAY\)/);
 assert.doesNotMatch(route,/LIMIT 10|OFFSET :offset|PAGE_SIZE/);
 assert.match(page,/id="historyDate"/);
 assert.match(page,/id="historyToday"/);
 assert.doesNotMatch(page,/id="historyPrevious"|id="historyNext"|id="historyPageIndicator"/);
 assert.match(ui,/historyController\?\.abort\(\)/);
 assert.match(ui,/historyCache\.delete\(historyDate\.value\)/);
 assert.match(ui,/await caseta\.llamar\(/);
 assert.match(ui,/await caller\.call\(/);
});
