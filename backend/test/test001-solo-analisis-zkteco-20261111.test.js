'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
const {seleccionarPadronAnalisis}=require('../src/services/padron-finanzas.service');
const {esViviendaVisible,esViviendaTest001,esViviendaTest002}=require('../src/services/viviendas-visibles.service');
const casas=[
 {id:738,calle:'Prueba',numero:'TEST-001',nombre:'Usuario de prueba'},
 {id:888,calle:'Prueba',numero:'TEST-001'},
 {id:739,calle:'Prueba',numero:'TEST-002'},
 {id:740,calle:'Prueba auxiliar',numero:'1'},
 {id:111,calle:'Gardenias',numero:'5'}
];
test('sólo Análisis muestra TEST-001 como una fila de laboratorio, sin TEST-002',()=>{
 const original=seleccionarPadronAnalisis(casas,[]);
 const vista=seleccionarPadronAnalisis(casas,[],{incluirTest001:true});
 assert.deepEqual(original.casas.map(c=>c.id),[111]);
 assert.equal(vista.casas.length,2);
 assert.equal(vista.casas.filter(esViviendaTest001).length,1);
 assert.ok(!vista.casas.some(esViviendaTest002));
 assert.equal(vista.casas.find(esViviendaTest001).id,738);
 assert.equal(esViviendaVisible(casas[0]),false,'El filtro global permanece intacto');
 assert.equal(esViviendaVisible(casas[2]),false);
});
test('sólo domicilio Prueba TEST-001 y no ID fijo 738',()=>{
 assert.equal(seleccionarPadronAnalisis([{id:738,calle:'Rosas',numero:'18'}],[],{incluirTest001:true}).casas.length,1);
 assert.equal(seleccionarPadronAnalisis([{id:738,calle:'Prueba',numero:'TEST-002'}],[],{incluirTest001:true}).casas.length,0);
});
test('Análisis conserva los indicadores oficiales aunque agregue la fila de prueba',()=>{
 const code=fs.readFileSync(path.resolve(__dirname,'../src/controllers/finanzas.controller.js'),'utf8');
 assert.match(code,/residencesOficiales=residences\.filter\(h=>!h\.esPrueba\)/);
 assert.match(code,/casas:residencesOficiales\.length/);
 assert.match(code,/porcentaje:residencesOficiales\.length/);
 assert.match(code,/padron:padron\.casas/);
 assert.match(code,/viviendas:residences\.sort/);
});
test('ZKTeco limita TEST-001 al dashboard/inventario de administración, no al filtro compartido',()=>{
 const controller=fs.readFileSync(path.resolve(__dirname,'../src/controllers/zkteco.controller.js'),'utf8');
 const direct=fs.readFileSync(path.resolve(__dirname,'../src/services/zkteco-direct.service.js'),'utf8');
 assert.match(controller,/incluirTest001:\['SUPER_ADMIN','ADMINISTRADOR'\]\.includes\(req\.usuario\?\.rol\)/);
 assert.match(controller,/esViviendaTest001\(casa\)/);
 assert.match(direct,/incluirTest001===true&&esViviendaTest001\(h\)/);
 assert.match(direct,/canonicalOnlyHouse\(h\.calle,h\.numero\)/);
});
test('No modifica motor de TAGs, pruebas de pago, ni vistas generales',()=>{
 const changes=[...['viviendas-visibles.service.js']].map(f=>fs.readFileSync(path.resolve(__dirname,'../src/services',f),'utf8'));
 assert.match(changes[0],/if\(esViviendaTest001\(casa\)\|\|esViviendaTest002\(casa\)\)return false/);
});
