'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {nextSort,compareHouses}=require('../../docs/assets/js/analisis-orden-viviendas.js');
const record=(id,fecha)=>({casaId:id,calle:'Gardenias',numero:String(id),
  ultimoRegistroPago:fecha?{fecha}:null});
const values=[
  record(1,'2026-10-21T08:00:00-06:00'), // A
  record(2,'2026-10-21T17:00:00-06:00'), // B
  record(3,'2026-10-20T20:00:00-06:00'), // C
  record(4,'2026-10-20T07:00:00-06:00'), // D
  record(5,null)
];
test('últimos pagos registrados: día y hora recientes primero',()=>{
 const actual=[...values].sort((a,b)=>compareHouses(a,b,{key:'registro',direction:'desc'}));
 assert.deepEqual(actual.map(x=>x.casaId),[2,1,3,4,5]);
});
test('últimos pagos registrados: día y hora más antiguos primero',()=>{
 const actual=[...values].sort((a,b)=>compareHouses(a,b,{key:'registro',direction:'asc'}));
 assert.deepEqual(actual.map(x=>x.casaId),[4,3,1,2,5]);
});
test('registro sin fecha queda al final en ambas direcciones',()=>{
 for(const direction of ['asc','desc']){
  const actual=[...values].sort((a,b)=>compareHouses(a,b,{key:'registro',direction}));
  assert.equal(actual.at(-1).casaId,5);
 }
});
test('clic en columna de registro inicia por recientes y alterna al siguiente clic',()=>{
 assert.deepEqual(nextSort({key:'calle',direction:'asc'},'registro'),{key:'registro',direction:'desc'});
 assert.deepEqual(nextSort({key:'registro',direction:'desc'},'registro'),{key:'registro',direction:'asc'});
});
