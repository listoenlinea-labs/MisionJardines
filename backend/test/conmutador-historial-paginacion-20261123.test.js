'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

function setup(){
  const queries=[],handlers={};
  const rows=[
    {id:4,grupo:'Gardenias',numero:'5',fecha_hora:'2026-11-23 19:31:00'},
    {id:3,grupo:'Lirios',numero:'12',fecha_hora:'2026-11-23 19:23:00'},
    {id:2,grupo:'Rosas',numero:'18',fecha_hora:'2026-11-22 18:00:00'}
  ];
  const db={query:async(sql,options={})=>{
    queries.push({sql,options});
    if(sql.includes('CREATE TABLE'))return [];
    if(sql.includes('SELECT id'))return rows.filter(row=>row.fecha_hora.startsWith(options.replacements.fecha));
    throw Error('Consulta inesperada: '+sql);
  }};
  const router={use(){},get(route,fn){handlers.get=fn;},post(route,fn){handlers.post=fn;}};
  const mocks={
    express:{Router:()=>router},
    sequelize:{QueryTypes:{SELECT:'SELECT',INSERT:'INSERT'}},
    '../config/database':db,
    '../middlewares/auth.middleware':{autenticarToken(){}},
    '../middlewares/roles.middleware':{autorizarRoles:()=>()=>{}},
    '../services/viviendas-visibles.service':{esViviendaVisible:()=>true}
  };
  vm.runInNewContext(read('backend/src/routes/conmutador-historial.routes.js'),{
    module:{exports:{}},console:{error(){}},
    require(name){if(!(name in mocks))throw Error('Importación desconocida: '+name);return mocks[name];}
  });
  return {
    queries,
    async get(fecha){
      const response={status:200,body:null};
      const res={set(){return this;},status(code){response.status=code;return this;},
        json(body){response.body=JSON.parse(JSON.stringify(body));return this;}};
      await handlers.get({query:fecha===null?{}:{fecha}},res);
      return response;
    }
  };
}

test('Filtrar por fecha devuelve TODOS los intentos del día, sin paginación',async()=>{
  const fake=setup();
  const day=await fake.get('2026-11-23');
  assert.equal(day.status,200);
  assert.equal(day.body.fecha,'2026-11-23');
  assert.equal(day.body.total,2);
  assert.deepEqual(day.body.registros.map(x=>x.id),[4,3]);
  assert.equal((await fake.get('2026-11-22')).body.registros.length,1);
  const sql=fake.queries.find(x=>x.sql.includes('SELECT id')).sql;
  assert.match(sql,/creado_en >= :fecha/);
  assert.match(sql,/creado_en < DATE_ADD\(:fecha, INTERVAL 1 DAY\)/);
  assert.match(sql,/ORDER BY creado_en DESC, id DESC/);
  assert.doesNotMatch(sql,/DATE\(creado_en\)|LIMIT|OFFSET|COUNT\(/);
});

test('Fecha inválida se rechaza sin consultar MySQL; el resultado no contiene teléfonos',async()=>{
  const fake=setup();
  for(const value of [null,'','2026-02-30','2026/11/23','2026-00-10','foo']){
    const result=await fake.get(value);
    assert.equal(result.status,400);
  }
  assert.equal(fake.queries.length,0);
  const result=await fake.get('2026-11-23');
  assert.doesNotMatch(JSON.stringify(result.body),/telefono|correo|contacto|propietario/i);
});

test('Historial frontend por fecha sin paginación; mantiene motores de llamada',()=>{
  const html=read('docs/conmutador.html'),js=read('docs/assets/js/conmutador.js');
  for(const id of ['historyDate','historyToday','refreshHistory','historyCount','historyStatus'])
    assert.match(html,new RegExp('id="'+id+'"'));
  assert.doesNotMatch(html,/id="historyPrevious"|id="historyNext"|historyPageIndicator/);
  assert.doesNotMatch(js,/HISTORY_PAGE_SIZE|historyPrevious|historyNext|historyPageIndicator/);
  assert.match(js,/conmutador\/historial\?fecha=/);
  assert.match(js,/historyController\?\.abort\(\)/);
  assert.match(js,/renderHistory\(result\)/);
  assert.match(js,/await caseta\.llamar\(/);
  assert.match(js,/await caller\.call\(/);
});
