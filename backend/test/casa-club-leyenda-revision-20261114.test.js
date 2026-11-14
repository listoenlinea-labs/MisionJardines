'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=name=>fs.readFileSync(path.resolve(__dirname,'../../',name),'utf8');
test('Calendario Casa Club usa cuatro leyendas y bloquea todos los días no disponibles',()=>{
 const html=read('docs/casa-club.html');
 const js=read('docs/assets/js/casa-club.js');
 for(const label of ['Disponible','Reservada','En revisión','No disponible'])
  assert.ok(html.includes('>'+label+'</span>'));
 assert.ok(!html.includes('<i class="waiting"></i>Apartada'));
 assert.match(js,/status==='APROBADA'\?'booked':status\?'waiting':'available'/);
 assert.match(js,/btn\.disabled=Boolean\(status\)\|\|past/);
 assert.match(js,/status==='APROBADA'\?'Reservada':status\?'En revisión':'Disponible'/);
 assert.match(html,/casa-club\.js\?v=20261114-en-revision/);
});
