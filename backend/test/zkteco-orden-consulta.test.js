'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {modoSeguro,ordenarViviendasPorTags}=require('../src/services/zkteco-orden-consulta.service');
const byId=(a,b)=>a.id-b.id;
const houses=[
 {id:1,tarjetas:[{id:20,ultimaLectura:'2026-10-19T10:00:00Z'}]},
 {id:2,tarjetas:[{id:99,ultimaLectura:'2026-10-18T10:00:00Z'}]},
 {id:3,tarjetas:[{id:30,ultimaLectura:'2026-10-20T10:00:00Z'}]},
 {id:4,tarjetas:[]}
];
test('predeterminado ordena viviendas igual que antes',()=>{
 assert.deepEqual(ordenarViviendasPorTags([...houses],'vivienda',byId).map(r=>r.id),[1,2,3,4]);
 assert.equal(modoSeguro('injection'),'vivienda');
});
test('TAG local incorporado: mayor ID primero o menor ID primero',()=>{
 assert.deepEqual(ordenarViviendasPorTags([...houses],'alta_desc',byId).map(r=>r.id),[2,3,1,4]);
 assert.deepEqual(ordenarViviendasPorTags([...houses],'alta_asc',byId).map(r=>r.id),[1,3,2,4]);
});
test('Última lectura C3 ordena timestamps completos sin confundir fechas de vencimiento',()=>{
 assert.deepEqual(ordenarViviendasPorTags([...houses],'lectura_desc',byId).map(r=>r.id),[3,1,2,4]);
 assert.deepEqual(ordenarViviendasPorTags([...houses],'lectura_asc',byId).map(r=>r.id),[2,1,3,4]);
});
test('sin TAG o sin lectura va al final, con desempate estable',()=>{
 const records=[{id:4,tarjetas:[]},{id:5,tarjetas:[{id:2,ultimaLectura:null}]},{id:1,tarjetas:[{id:8,ultimaLectura:'2026-10-20T12:00:00Z'}]}];
 assert.deepEqual(ordenarViviendasPorTags(records,'lectura_desc',byId).map(x=>x.id),[1,4,5]);
});
