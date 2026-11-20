'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {domicilioDesdeCasa}=require('../src/services/vivienda-conmutador-correspondencia.service');

test('correspondencia de viviendas evita mezclar igual número en calles distintas',()=>{
 assert.deepEqual(domicilioDesdeCasa({calle:'Gardenias',numero:'20'}),{grupo:'Gardenias',numero:'20'});
 assert.deepEqual(domicilioDesdeCasa({calle:'Rosas',numero:'20'}),{grupo:'Rosas',numero:'20'});
 assert.deepEqual(domicilioDesdeCasa({calle:'Magnolias',numero:'20'}),{grupo:'Magnolias',numero:'20'});
});
test('Jardines 1, 2 y 3 se identifican con sus numeraciones oficiales',()=>{
 assert.deepEqual(domicilioDesdeCasa({calle:'Jardines',numero:'116'}),{grupo:'Jardines 1',numero:'116'});
 assert.deepEqual(domicilioDesdeCasa({calle:'Jardínes',numero:'205'}),{grupo:'Jardines 2',numero:'205'});
 assert.deepEqual(domicilioDesdeCasa({calle:'Jardines',numero:'307'}),{grupo:'Jardines 3',numero:'307'});
 assert.equal(domicilioDesdeCasa({calle:'Jardines 1',numero:'205'}),null);
 assert.equal(domicilioDesdeCasa({calle:'Jardines',numero:'999'}),null);
});
test('exteriores y viviendas no reconocidas nunca se asignan a otro domicilio',()=>{
 assert.deepEqual(domicilioDesdeCasa({calle:'Atotonilco',numero:'752'}),{grupo:'Atotonilco',numero:'752'});
 assert.deepEqual(domicilioDesdeCasa({calle:'Valle de México',numero:'3614'}),{grupo:'Valle de México',numero:'3614'});
 assert.equal(domicilioDesdeCasa({calle:'Atotonilco',numero:'20'}),null);
 assert.equal(domicilioDesdeCasa({calle:'Prueba',numero:'TEST-001'}),null);
 assert.equal(domicilioDesdeCasa({calle:'Jardines',numero:'205-2'}),null);
});
