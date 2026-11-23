'use strict';
// Prueba de compatibilidad: la paginación se reemplazó por saltos entre
// fechas con registros, por lo que la consulta ya no usa LIMIT/OFFSET.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=filename=>fs.readFileSync(path.join(root,filename),'utf8');

test('No existe paginación en el historial del Conmutador',()=>{
 const backend=read('backend/src/routes/conmutador-historial.routes.js');
 const ui=read('docs/assets/js/conmutador.js');
 const html=read('docs/conmutador.html');
 assert.doesNotMatch(backend,/PAGE_SIZE|OFFSET|LIMIT 10/);
 assert.doesNotMatch(ui,/historyPageIndicator|HISTORY_PAGE_SIZE/);
 assert.doesNotMatch(html,/id="historyPageIndicator"|id="historyPagePrevious"|id="historyPageNext"/);
 assert.match(backend,/fechaAnterior:previous\[0\]\?\.fecha\|\|null/);
 assert.match(backend,/fechaSiguiente:next\[0\]\?\.fecha\|\|null/);
 assert.match(ui,/loadHistory\(\{latest:true,force:true\}\)/);
});
