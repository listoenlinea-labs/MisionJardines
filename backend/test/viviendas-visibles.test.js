'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {normalizarCalle,esViviendaVisible,esDepartamentoVisible,filtrarViviendasVisibles}=
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
 assert.match(buscar,/esViviendaVisible\(\{calle:grupo,numero\}\)/);
 assert.match(viviendas,/filtrarViviendasVisibles/);
 assert.match(auto,/filtrarViviendasVisibles/);
 const zkteco=read('controllers/zkteco.controller.js');
 assert.match(zkteco,/esDepartamentoVisible\(r\.departamento\)/);
 const padron=read('services/padron-finanzas.service.js');
 assert.match(padron,/'valle de mexico': '3614'/);
});

test('Valle de México muestra exclusivamente 3614, independientemente del prefijo y acentos',()=>{
  const casasValle=[
    {id:20,calle:'Valle de México',numero:'88.5'},
    {id:21,calle:'Av. Valle de México',numero:'3614'},
    {id:22,calle:'Avenida Valle de Mexico',numero:'3614'},
    {id:23,calle:'AV VALLE DE MEXICO',numero:'3615'},
    {id:24,calle:'Valle de México',calleCorrecta:'Av. Valle de México',numero:'88.5'},
    {id:25,calle:'Gardenias',numero:'88.5'},
    {id:26,calle:'Guadalajara',numero:'707'}
  ];
  assert.equal(normalizarCalle('Avenida Valle de México'),'valle de mexico');
  assert.deepEqual(filtrarViviendasVisibles(casasValle).map(c=>c.id),[21,22,25,26]);
  assert.equal(esViviendaVisible({calle:'Valle de México',numero:'88.5'}),false);
  assert.equal(esViviendaVisible({calle:'Valle de México',numero:'3614'}),true);
  assert.equal(esViviendaVisible({calle:'Av. Guadalajara',numero:'789'}),false);
  assert.equal(esViviendaVisible({calle:'Av. Guadalajara',numero:'707'}),true);
});

test('Departamento ZKTeco sin casaId respeta Valle 3614 y Guadalajara 707',()=>{
  assert.equal(esDepartamentoVisible('Valle de México 88.5'),false);
  assert.equal(esDepartamentoVisible('Av. Valle de Mexico 3614'),true);
  assert.equal(esDepartamentoVisible('Avenida Valle de México 3615'),false);
  assert.equal(esDepartamentoVisible('Guadalajara 789'),false);
  assert.equal(esDepartamentoVisible('Guadalajara 707'),true);
  assert.equal(esDepartamentoVisible('Jardines 142'),true);
  assert.equal(esDepartamentoVisible(null),true);
});

test('El padrón financiero mantiene Valle de México 3614 y no incluye 88.5',()=>{
  const casasValle=[
    {id:90,calle:'Valle de México',numero:'88.5'},
    {id:91,calle:'Av. Valle de México',numero:'3614'},
    {id:92,calle:'Guadalajara',numero:'707'}
  ];
  const seleccion=seleccionarPadronAnalisis(casasValle,[]);
  assert.deepEqual(seleccion.casas.map(c=>c.id).sort((a,b)=>a-b),[91,92]);
  assert.equal(seleccion.excluidas,1);
});
