'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {distribuirPresupuesto}=require('../src/services/proyectos-presupuesto.service');
const casas=Array.from({length:231},(_,i)=>({id:i+1}));

test('reparte el total entre 231 sin perder centavos',()=>{
 const r=distribuirPresupuesto(casas,1000);
 assert.equal(r.cargos.length,231);
 assert.equal(r.cargos.reduce((n,h)=>n+Math.round(h.monto*100),0),100000);
 assert.equal(r.cargos[0].monto,4.33);
 assert.equal(r.cargos.at(-1).monto,4.32);
});
test('aplica una cuota excepcional y redistribuye el saldo',()=>{
 const r=distribuirPresupuesto(casas,231000,[{casaId:20,monto:150}]);
 assert.equal(r.cargos.find(h=>h.casaId===20).monto,150);
 assert.equal(r.cargos.reduce((n,h)=>n+Math.round(h.monto*100),0),23100000);
 assert.equal(r.excepciones,1);
});
test('rechaza padrón incorrecto, duplicados y exceso de excepciones',()=>{
 assert.throws(()=>distribuirPresupuesto(casas.slice(1),100),/231/);
 assert.throws(()=>distribuirPresupuesto(casas,2),/costo total/);
 assert.throws(()=>distribuirPresupuesto(casas,100,[{casaId:1,monto:3},{casaId:1,monto:5}]),/duplicada/);
 assert.throws(()=>distribuirPresupuesto(casas,100,[{casaId:900,monto:3}]),/inexistente/);
 assert.throws(()=>distribuirPresupuesto(casas,100,[{casaId:1,monto:99.99}]),/superan/);
});

test('el navegador y el backend distribuyen los mismos centavos',()=>{
 const ui=require('../../docs/assets/js/proyectos-presupuesto.js');
 const escenarios=[
  {total:231000,excepciones:[]},
  {total:1000,excepciones:[]},
  {total:259500.99,excepciones:[{casaId:20,monto:150.55},{casaId:31,monto:1000}]},
  {total:2.31,excepciones:[]}
 ];
 for(const item of escenarios){
  const backend=distribuirPresupuesto(casas,item.total,item.excepciones);
  const frontend=ui.distribuir(casas,item.total,item.excepciones);
  const displayed=new Map(frontend.rows.map(c=>[c.casaId,c.montoCentavos]));
  for(const house of backend.cargos){
   assert.equal(displayed.get(house.casaId),Math.round(house.monto*100),
    'Diferencia en vivienda '+house.casaId);
  }
 }
});
