'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const UUID='12345678-1234-1234-1234-123456789abc';
function service(){
 const events=[],queries=[];
 const QueryTypes={SELECT:'SELECT',INSERT:'INSERT'};
 const db={query:async(sql,opt={})=>{
  queries.push(sql);
  if(sql.includes('CREATE TABLE'))return [];
  if(sql.startsWith('SELECT solicitud'))return [{solicitud:UUID}];
  if(sql.startsWith('SELECT evento FROM'))return events.map(e=>({evento:e.evento}));
  if(sql.startsWith('INSERT IGNORE')){
   if(!events.some(e=>e.evento===opt.replacements.evento))events.push(opt.replacements);
   return [null,1];
  }
  if(sql.includes('SELECT grupo,numero,estado'))return [{
   grupo:'Gardenias',numero:'5',estado:'ENVIADA',
   inicio:'2026-11-24 08:30:00',confirmado:'2026-11-24 08:30:02'
  }];
  if(sql.includes('SELECT evento,motivo,duracion_segundos'))return events.map((e,i)=>({
   evento:e.evento,motivo:e.motivo,duracionSegundos:e.duracion,
   fechaHora:'2026-11-24 08:30:'+String(i+3).padStart(2,'0')
  }));
  throw Error('SQL inesperado: '+sql);
 }};
 const module={exports:{}};
 vm.runInNewContext(read('backend/src/services/conmutador-telemetria.service.js'),{
  module,require:mod=>mod==='sequelize'?{QueryTypes}:db
 });
 return {api:module.exports,events,queries};
}
test('Solo se aceptan eventos comprobados y no se inventa una llamada contestada',async()=>{
 const {api,events}=service();
 await api.registrar({solicitud:UUID,evento:'TIMBRANDO'});
 await api.registrar({solicitud:UUID,evento:'CONTESTADA'});
 await api.registrar({solicitud:UUID,evento:'FINALIZADA',duracionSegundos:68});
 assert.deepEqual(events.map(e=>e.evento),['TIMBRANDO','CONTESTADA','FINALIZADA']);
 assert.equal(events[2].duracion,68);
 const d=await api.detalle(UUID);
 assert.equal(d.vivienda,'Gardenias 5');
 assert.equal(d.duracionSegundos,68);
 assert.equal(d.telemetriaDisponible,true);
 assert.equal(d.etapas.length,5);
 assert.doesNotMatch(JSON.stringify(d),/telefono|celular|contacto/i);
});
test('Falla u ocupado no puede convertirse después en contestada',async()=>{
 const {api,events}=service();
 await api.registrar({solicitud:UUID,evento:'OCUPADO'});
 await api.registrar({solicitud:UUID,evento:'CONTESTADA'});
 await api.registrar({solicitud:UUID,evento:'FINALIZADA',duracionSegundos:20});
 assert.deepEqual(events.map(e=>e.evento),['OCUPADO']);
});
test('Nunca se indica duración si no existe CONTESTADA y FINALIZADA válidas',async()=>{
 const {api,events}=service();
 await api.registrar({solicitud:UUID,evento:'FINALIZADA',duracionSegundos:90});
 assert.equal(events.length,0);
 const detail=await api.detalle(UUID);
 assert.equal(detail.duracionSegundos,null);
 assert.equal(detail.telemetriaDisponible,false);
});
test('Los eventos duplicados no crean filas o duraciones inconsistentes',async()=>{
 const {api,events}=service();
 await api.registrar({solicitud:UUID,evento:'CONTESTADA'});
 await api.registrar({solicitud:UUID,evento:'CONTESTADA'});
 await api.registrar({solicitud:UUID,evento:'FINALIZADA',duracionSegundos:31});
 await api.registrar({solicitud:UUID,evento:'FINALIZADA',duracionSegundos:500});
 assert.equal(events.length,2);
 assert.equal(events[1].duracion,31);
});
test('Modal solo lee un detalle por UUID, sin afectar la acción de llamada',()=>{
 const js=read('docs/assets/js/conmutador.js');
 const html=read('docs/conmutador.html');
 const backend=read('backend/src/routes/conmutador-caseta.routes.js');
 for(const id of ['historyDetailModal','historyDetailTitle','historyDetailNotice',
  'historyDetailTimeline','historyDetailDuration','historyDetailClose'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(js,/historyList'\)\.addEventListener\('click'/);
 assert.match(js,/conmutador\/historial\/'\+encodeURIComponent\(solicitud\)/);
 assert.match(js,/await caseta\.llamar\(domicilio, contactos\[0\]\)/);
 assert.match(backend,/router\.post\('\/agente\/telemetria', agente/);
 assert.match(backend,/router\.post\('\/agente\/resultado', habilitado, agente/);
});
