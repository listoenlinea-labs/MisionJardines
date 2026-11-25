const test=require('node:test');
const assert=require('node:assert/strict');
const {paginate,dateTime,zone}=require('../../docs/assets/js/infraestructura-bitacora');
const items=Array.from({length:23},(_,i)=>({at:Date.UTC(2026,10,25,18,0,i),accion:'EVT_'+i}));
test('desktop 10, móvil 3, orden reciente primero, última página parcial',()=>{
 const desktop=paginate(items,1,false),mobile=paginate(items,1,true);
 assert.equal(desktop.items.length,10);assert.equal(desktop.pages,3);assert.equal(desktop.items[0].accion,'EVT_22');
 assert.equal(mobile.items.length,3);assert.equal(mobile.pages,8);assert.equal(mobile.items[0].accion,'EVT_22');
 assert.equal(paginate(items,3,false).items.length,3);
 assert.equal(paginate(items,8,true).items.length,2);
 assert.equal(items[0].accion,'EVT_0');
});
test('conserva página válida, ajusta límites y maneja vacío',()=>{
 assert.equal(paginate(items,2,false).page,2);
 assert.equal(paginate(items,99,false).page,3);
 assert.equal(paginate(items,-2,true).page,1);
 assert.deepEqual(paginate([],2,true),{items:[],size:3,total:0,pages:1,page:1,from:0,to:0});
});
test('fecha y hora de México independientemente de la zona del navegador',()=>{
 assert.equal(zone,'America/Mexico_City');
 const sample=dateTime({at:Date.UTC(2026,10,26,2,30,15)});
 assert.equal(sample.fecha,'25/11/2026');assert.equal(sample.hora,'20:30:15');
 assert.equal(dateTime({at:Date.UTC(2026,10,25,18),finalizada:Date.UTC(2026,10,25,19)}).hora,'13:00:00');
 assert.equal(dateTime({}).fecha,'Sin registro');
});
