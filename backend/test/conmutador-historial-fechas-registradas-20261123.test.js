'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

function testApi(entries){
 const records=[...entries].sort((a,b)=>b.fecha_hora.localeCompare(a.fecha_hora)||b.id-a.id);
 const calls=[],handlers={};
 const database={query:async(sql,opts={})=>{
  calls.push({sql,replacements:opts.replacements});
  if(sql.includes('CREATE TABLE'))return [];
  if(!sql.includes('FROM conmutador_intentos_llamada'))throw Error('SQL no esperado');
  const fecha=opts.replacements?.fecha;
  if(sql.includes('SELECT id'))return records.filter(r=>r.fecha_hora.startsWith(fecha));
  let filtered=records;
  if(sql.includes('WHERE creado_en < :fecha'))
   filtered=records.filter(r=>r.fecha_hora.slice(0,10)<fecha);
  else if(sql.includes('WHERE creado_en >= DATE_ADD'))
   filtered=records.filter(r=>r.fecha_hora.slice(0,10)>fecha).reverse();
  return filtered.slice(0,1).map(r=>({fecha:r.fecha_hora.slice(0,10)}));
 }};
 const router={use(){},get(p,fn){handlers.get=fn},post(p,fn){handlers.post=fn}};
 const modules={
  express:{Router:()=>router},
  sequelize:{QueryTypes:{SELECT:'SELECT',INSERT:'INSERT'}},
  '../config/database':database,
  '../middlewares/auth.middleware':{autenticarToken(){}},
  '../middlewares/roles.middleware':{autorizarRoles:()=>()=>{}},
  '../services/viviendas-visibles.service':{esViviendaVisible:()=>true}
 };
 vm.runInNewContext(read('backend/src/routes/conmutador-historial.routes.js'),{
  module:{exports:{}},console:{error(){}},
  require(name){if(!(name in modules))throw Error('Módulo inesperado: '+name);return modules[name];}
 });
 return {calls,handlers,async get(fecha){
  const result={status:200},res={
   set(){return this;},status(code){result.status=code;return this;},
   json(body){result.body=JSON.parse(JSON.stringify(body));return this;}
  };
  await handlers.get({query:fecha===undefined?{}:{fecha}},res);
  return result;
 }};
}

const fixtures=[
 ...Array.from({length:17},(_,i)=>({
  id:i+1,grupo:'Gardenias',numero:String(i+1),
  fecha_hora:'2026-11-20 '+String(23-i).padStart(2,'0')+':00:00'
 })),
 {id:18,grupo:'Lirios',numero:'12',fecha_hora:'2026-11-23 19:23:00'},
 {id:19,grupo:'Rosas',numero:'18',fecha_hora:'2026-11-23 19:31:00'},
 {id:20,grupo:'Magnolias',numero:'2',fecha_hora:'2026-11-26 09:30:00'}
];

test('Al iniciar selecciona último día con registros, no necesariamente hoy',async()=>{
 const api=testApi(fixtures);
 const response=await api.get();
 assert.equal(response.status,200);
 assert.equal(response.body.fecha,'2026-11-26');
 assert.equal(response.body.total,1);
 assert.equal(response.body.fechaAnterior,'2026-11-23');
 assert.equal(response.body.fechaSiguiente,null);
 assert.ok(api.calls.some(c=>c.sql.includes('ORDER BY creado_en DESC LIMIT 1')));
});

test('Las flechas saltan días vacíos y no se pagina el listado del día',async()=>{
 const api=testApi(fixtures);
 const middle=(await api.get('2026-11-23')).body;
 const oldest=(await api.get('2026-11-20')).body;
 assert.equal(middle.fechaAnterior,'2026-11-20');
 assert.equal(middle.fechaSiguiente,'2026-11-26');
 assert.equal(oldest.fechaAnterior,null);
 assert.equal(oldest.fechaSiguiente,'2026-11-23');
 assert.equal(oldest.registros.length,17);
 assert.equal(oldest.total,17);
 assert.ok(api.calls.filter(c=>c.sql.includes('SELECT id')).every(c=>
  !/LIMIT|OFFSET|COUNT\(/.test(c.sql)));
});

test('Una fecha sin registros puede navegar a los días disponibles cercanos',async()=>{
 const day=(await testApi(fixtures).get('2026-11-22')).body;
 assert.equal(day.total,0);
 assert.equal(day.fechaAnterior,'2026-11-20');
 assert.equal(day.fechaSiguiente,'2026-11-23');
});

test('Historial vacío: no hay flechas; fechas inválidas se rechazan',async()=>{
 const empty=await testApi([]).get();
 assert.equal(empty.status,200);
 assert.equal(empty.body.fecha,null);
 assert.deepEqual(empty.body.registros,[]);
 assert.equal(empty.body.fechaAnterior,null);
 assert.equal(empty.body.fechaSiguiente,null);
 const api=testApi(fixtures);
 for(const fecha of ['2026-02-30','2026-11-31','11/23/2026','','foo']){
  assert.equal((await api.get(fecha)).status,400);
 }
});

test('Interfaz accesible y motor de llamadas sin modificaciones funcionales',()=>{
 const html=read('docs/conmutador.html');
 const script=read('docs/assets/js/conmutador.js');
 for(const id of ['historyPrevious','historyNext','historyDate','historyToday','refreshHistory'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/aria-label="Ir a la fecha anterior con llamadas"/);
 assert.match(html,/aria-label="Ir a la fecha siguiente con llamadas"/);
 assert.match(html,/@media\(max-width:560px\)/);
 assert.match(script,/loadHistory\(\{latest:true,force:true\}\)/);
 assert.match(script,/historyPrevious\.addEventListener\('click'/);
 assert.match(script,/historyNext\.addEventListener\('click'/);
 assert.match(script,/historyAdjacent\[direction\]/);
 assert.match(script,/setHistoryNavigation\(true\)/);
 assert.doesNotMatch(script,/historyPageIndicator|HISTORY_PAGE_SIZE/);
 assert.match(script,/void attempt\(house\)/);
 assert.match(script,/await caseta\.llamar\(/);
 assert.match(script,/await caller\.call\(/);
});
