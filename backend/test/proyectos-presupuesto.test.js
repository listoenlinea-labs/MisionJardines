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

test('exención $0: reparte costo exacto entre 230 casas',()=>{
 const result=distribuirPresupuesto(casas,50000,[{casaId:1,monto:0}]);
 const exempt=result.cargos.find(h=>h.casaId===1);
 assert.equal(exempt.monto,0);
 assert.equal(exempt.esExcepcion,true);
 assert.equal(result.excepciones,1);
 assert.equal(result.cargos.filter(h=>h.monto>0).length,230);
 assert.equal(result.cargos.reduce((n,h)=>n+Math.round(h.monto*100),0),5000000);
 const ui=require('../../docs/assets/js/proyectos-presupuesto.js').distribuir(casas,50000,[{casaId:1,monto:0}]);
 const byId=new Map(result.cargos.map(h=>[h.casaId,Math.round(h.monto*100)]));
 for(const row of ui.rows)assert.equal(row.montoCentavos,byId.get(row.casaId));
});
test('varias casas exentas conservan hasta el último centavo',()=>{
 const free=[1,2,3,4,5].map(casaId=>({casaId,monto:'0'}));
 const result=distribuirPresupuesto(casas,259500.01,free);
 assert.equal(result.cargos.filter(x=>x.monto===0).length,5);
 assert.equal(result.cargos.reduce((n,h)=>n+Math.round(h.monto*100),0),25950001);
 assert.equal(result.excepciones,5);
});
test('rechaza importe omitido, negativo y todas las casas exceptuadas',()=>{
 assert.throws(()=>distribuirPresupuesto(casas,50000,[{casaId:1,monto:''}]),/importe/);
 assert.throws(()=>distribuirPresupuesto(casas,50000,[{casaId:1,monto:null}]),/importe/);
 assert.throws(()=>distribuirPresupuesto(casas,50000,[{casaId:1,monto:-10}]),/Importe/);
 assert.throws(()=>distribuirPresupuesto(casas,50000,casas.map(h=>({casaId:h.id,monto:0}))),/al menos|231/);
});
