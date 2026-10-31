'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {separarDireccionZkteco}=require('../../docs/assets/js/zkteco-address-filter.js');

test('Calle y número se interpretan en una sola entrada',()=>{
  assert.deepEqual(separarDireccionZkteco('Gardenias 5'),{calle:'Gardenias',numero:'5'});
  assert.deepEqual(separarDireccionZkteco('Jardines 141'),{calle:'Jardines',numero:'141'});
  assert.deepEqual(separarDireccionZkteco('Av. Guadalajara 707'),{calle:'Av. Guadalajara',numero:'707'});
  assert.deepEqual(separarDireccionZkteco('Av. Valle de México 3614'),{calle:'Av. Valle de México',numero:'3614'});
  assert.deepEqual(separarDireccionZkteco('Gardenias 88.5'),{calle:'Gardenias',numero:'88.5'});
});

test('Búsqueda solo por calle y calle con números dentro del nombre',()=>{
  assert.deepEqual(separarDireccionZkteco('Gardenias'),{calle:'Gardenias',numero:''});
  assert.deepEqual(separarDireccionZkteco('5 de Mayo'),{calle:'5 de Mayo',numero:''});
  assert.deepEqual(separarDireccionZkteco('  Rosas   27  '),{calle:'Rosas',numero:'27'});
  assert.deepEqual(separarDireccionZkteco(''),{calle:'',numero:''});
});

test('El formulario envía calle y número al API y no muestra el filtro antiguo',()=>{
  const html=fs.readFileSync(path.resolve(__dirname,'../../docs/zkteco.html'),'utf8');
  assert.match(html,/id="street"/);
  assert.match(html,/CALLE Y NÚMERO/);
  assert.doesNotMatch(html,/id="houseNumber"/);
  assert.match(html,/MJZkAddressSearch\.separarDireccionZkteco/);
  assert.match(html,/if\(direccion\.calle\)q\.set\('calle',direccion\.calle\)/);
  assert.match(html,/if\(direccion\.numero\)q\.set\('numero',direccion\.numero\)/);
  assert.match(html,/const syncResponse=notify\?await syncBeforePageLoad\(\{notify\}\):null/);
});
