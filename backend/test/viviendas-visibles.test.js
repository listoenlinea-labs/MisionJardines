'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {normalizarCalle,esViviendaVisible,filtrarViviendasVisibles}=
  require('../src/services/viviendas-visibles.service');
const {seleccionarPadronAnalisis}=require('../src/services/padron-finanzas.service');
const casas=[
  {id:1,calle:'Guadalajara',numero:'789'},
  {id:2,calle:'Avenida Guadalajara',numero:'88.5'},
  {id:3,calle:'Av. Guadalajara',numero:'707'},
  {id:4,calle:'Gardenias',numero:'789'},
  {id:5,calle:'Av. Atotonilco',numero:'752'},
  {id:6,calle:'Guadalajara',calleCorrecta:'Av. Guadalajara',numero:'789'},
  {id:7,calle:'Av Guadalajara',numero:'707'}
];
test('Guadalajara solo casa 707, incluyendo variantes de avenida',()=>{
 assert.equal(normalizarCalle('Avenida Guadalajara'),'guadalajara');
 assert.equal(normalizarCalle('Av. Guadalajara'),'guadalajara');
 assert.equal(normalizarCalle('AV GUADALAJARA'),'guadalajara');
 assert.deepEqual(filtrarViviendasVisibles(casas).map(x=>x.id),[3,4,5,7]);
 assert.equal(esViviendaVisible({calle:'Guadalajara',numero:'88.5'}),false);
 assert.equal(esViviendaVisible({calle:'Guadalajara',numero:'707'}),true);
 assert.equal(esViviendaVisible({calle:'Gardenias',numero:'789'}),true);
});
test('Filtrado de lectura no altera los registros originales',()=>{
 const before=JSON.stringify(casas);
 const filtradas=filtrarViviendasVisibles(casas);
 assert.equal(JSON.stringify(casas),before);
 assert.notEqual(filtradas,casas);
});
test('Padron de análisis excluye 789 y 88.5 e incluye solamente Guadalajara 707',()=>{
 const r=seleccionarPadronAnalisis(casas,[]);
 const guad=r.casas.filter(c=>normalizarCalle(c.calleCorrecta||c.calle)==='guadalajara');
 assert.equal(guad.length,1,'se agrupan variantes duplicadas del 707');
 assert.equal(guad[0].numero,'707');
 assert.equal(r.casas.some(c=>c.id===1||c.id===2||c.id===6),false);
});
test('El criterio se aplica en consultas de API, no solamente en la interfaz',()=>{
 const read=p=>fs.readFileSync(path.resolve(__dirname,'../src',p),'utf8');
 const finanzas=read('services/padron-finanzas.service.js');
 const seguridad=read('controllers/seguridad-cuotas.controller.js');
 const casas=read('controllers/casas.controller.js');
 const cuotas=read('controllers/cuotas.controller.js');
 const buscar=read('routes/busqueda.routes.js');
 const viviendas=read('routes/viviendas.routes.js');
 const auto=read('routes/auto-users.routes.js');
 assert.match(finanzas,/guadalajara: '707'/);
 assert.match(seguridad,/filtrarViviendasVisibles\(casas\)/);
 assert.match(casas,/filtrarViviendasVisibles\(casas\)/);
 assert.match(cuotas,/cuotas\.filter\(c => esViviendaVisible\(c\.casa\)\)/);
 assert.match(buscar,/filtrarViviendasVisibles\(casas\)/);
 assert.match(buscar,/grupo==='Guadalajara' && numero!=='707'/);
 assert.match(viviendas,/filtrarViviendasVisibles/);
 assert.match(auto,/filtrarViviendasVisibles/);
});
