'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=file=>fs.readFileSync(path.join(root,file),'utf8');

function setup(total=23){
  const calls=[],routes={};
  const rows=Array.from({length:total},(_,index)=>({
    id:total-index,grupo:'Gardenias',numero:String(total-index),
    fecha_hora:'2026-11-23 10:30:00'
  }));
  const database={query:async(sql,options={})=>{
    calls.push({sql,offset:options.replacements?.offset});
    if(sql.includes('CREATE TABLE'))return [];
    if(sql.includes('COUNT(*)'))return [{total}];
    if(sql.includes('ORDER BY id DESC LIMIT 10'))return rows.slice(options.replacements.offset,options.replacements.offset+10);
    throw Error('SQL no esperado: '+sql);
  }};
  const fakeRouter={
    use(){},
    get(route,fn){routes.get=fn;},
    post(route,fn){routes.post=fn;}
  };
  const stub={
    express:{Router:()=>fakeRouter},
    sequelize:{QueryTypes:{SELECT:'SELECT',INSERT:'INSERT'}},
    '../config/database':database,
    '../middlewares/auth.middleware':{autenticarToken(){}},
    '../middlewares/roles.middleware':{autorizarRoles:()=>()=>{}},
    '../services/viviendas-visibles.service':{esViviendaVisible:()=>true}
  };
  const module={exports:{}};
  vm.runInNewContext(read('backend/src/routes/conmutador-historial.routes.js'),{
    require(name){if(!(name in stub))throw Error('Dependencia desconocida: '+name);return stub[name];},
    module,console:{error(){}}
  });
  async function get(pagina){
    const result={};
    const response={
      set(){return this;},
      status(status){result.status=status;return this;},
      json(body){result.body=JSON.parse(JSON.stringify(body));return this;}
    };
    await routes.get({query:pagina==null?{}:{pagina}},response);
    return result;
  }
  return {get,calls,routes};
}

test('Devuelve exactamente 10 intentos por página en cualquier dispositivo',async()=>{
 const mock=setup(23);
 const first=await mock.get('1'),second=await mock.get('2'),third=await mock.get('3');
 assert.equal(first.body.porPagina,10);
 assert.equal(first.body.registros.length,10);
 assert.equal(first.body.total,23);
 assert.equal(first.body.paginas,3);
 assert.equal(second.body.registros.length,10);
 assert.equal(second.body.registros[0].id,13);
 assert.equal(third.body.registros.length,3);
 assert.ok(mock.calls.filter(c=>c.sql.includes('ORDER BY id DESC')).every(c=>c.sql.includes('LIMIT 10')));
 assert.ok(mock.calls.some(c=>c.sql.includes('COUNT(*)')));
});

test('Valida número de página, conserva última página y evita información privada',async()=>{
 const mock=setup(23);
 assert.equal((await mock.get('0')).status,400);
 assert.equal((await mock.get('999999')).status,400);
 assert.equal((await mock.get('foo')).status,400);
 const last=await mock.get('9');
 assert.equal(last.body.pagina,3);
 assert.equal(last.body.registros.length,3);
 assert.doesNotMatch(JSON.stringify(last.body),/telefono|correo|contacto|propietario/i);
 const empty=await setup(0).get('1');
 assert.equal(empty.body.pagina,1);
 assert.equal(empty.body.total,0);
 assert.deepEqual(empty.body.registros,[]);
});

test('UI tiene paginador de 10 en escritorio y móvil sin alterar el motor de llamadas',()=>{
 const html=read('docs/conmutador.html'),js=read('docs/assets/js/conmutador.js');
 for(const id of ['historyPrevious','historyNext','historyPageIndicator','historyCount'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/Paginación del historial de llamadas/);
 assert.match(html,/@media\(max-width:560px\).*\.history-pager/);
 assert.match(js,/HISTORY_PAGE_SIZE=10/);
 assert.match(js,/HISTORY_CACHE_MS=15000/);
 assert.match(js,/\/conmutador\/historial\?pagina=/);
 assert.match(js,/historyCache\.clear\(\)/);
 assert.match(js,/void attempt\(house\)/);
 assert.match(js,/await caseta\.llamar\(/);
 assert.match(js,/await caller\.call\(/);
});
