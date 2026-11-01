'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const html=fs.readFileSync(path.resolve(__dirname,'../../docs/zkteco.html'),'utf8');
const picker=fs.readFileSync(path.resolve(__dirname,'../../docs/assets/js/zkteco-calles.js'),'utf8');
const {separarDireccionZkteco}=require('../../docs/assets/js/zkteco-address-filter');

test('Calle y número es un input libre sin lista de valores o combobox',()=>{
  const field=html.match(/<input id="street"[^>]*>/);
  assert.ok(field);
  assert.match(field[0],/type="text"/);
  for(const attribute of ['role="combobox"','aria-haspopup','aria-controls','list='])assert.ok(!field[0].includes(attribute));
  assert.doesNotMatch(html,/id="streetOptions"/);
  assert.doesNotMatch(html,/id="streetHint"/);
  assert.doesNotMatch(picker,/attachStreetPicker\('street',/);
});

test('El selector del modal de edición permanece disponible y se conserva la búsqueda por dirección',()=>{
  assert.match(picker,/attachStreetPicker\('editTagStreet'/);
  assert.match(html,/MJZkAddressSearch\.separarDireccionZkteco/);
  assert.deepEqual(separarDireccionZkteco('Gardenias 5'),{calle:'Gardenias',numero:'5'});
  assert.deepEqual(separarDireccionZkteco('Rosas 27'),{calle:'Rosas',numero:'27'});
  assert.deepEqual(separarDireccionZkteco('Gardenias'),{calle:'Gardenias',numero:''});
});
