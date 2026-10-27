'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const js = fs.readFileSync(path.join(__dirname, '../../docs/assets/js/pagos.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../../docs/pagos.html'), 'utf8');
const begin = js.indexOf('    async function loadConfig() {');
const end = js.indexOf('    async function loadExtras() {', begin);
assert.ok(begin >= 0 && end > begin, 'No se encontró el inicializador de configuración');
const functionCode = js.slice(begin, end);

function harness(api) {
  const ids = ['bankName', 'bankHolder', 'bankAccount', 'bankClabe', 'bankCard',
    'bankReference', 'maintenanceRateText', 'legalTitle', 'legalText'];
  const inputs = Object.fromEntries(ids.map(id => {
    const copy = {disabled: false, setAttribute(name){if(name === 'disabled')this.disabled=true},
      removeAttribute(name){if(name === 'disabled')this.disabled=false}};
    return [id, {textContent: '', copy, closest: () => ({querySelector: () => copy})}];
  }));
  const queried = [];
  let synced = 0;
  let summarized = 0;
  const get = id => {
    queried.push(id);
    if (!inputs[id]) throw Error('DOM element missing: '+id);
    return inputs[id];
  };
  const ctor = new Function('api', 'headers', '$', 'money', 'configText', 'syncBankReference',
    'updatePaymentSummary', 'let config=null;\n'+functionCode+'\nreturn loadConfig;');
  const loadConfig = ctor(api, () => ({Authorization:'token-test'}), get,
    n => '$'+Number(n).toFixed(2), (v,fallback) => String(v||'').trim()||fallback,
    () => {synced++;inputs.bankReference.textContent='CASA DE PRUEBA'},
    () => {summarized++});
  return {loadConfig,inputs,queried,get synced(){return synced},get summarized(){return summarized}};
}

test('La pantalla no conserva el párrafo eliminado de abonos', () => {
  assert.doesNotMatch(html, /id="maintenancePaymentHint"/);
  assert.doesNotMatch(functionCode, /\$\(['"]maintenancePaymentHint['"]\)/);
});

test('La cuenta bancaria y la CLABE se muestran aunque el párrafo eliminado no exista', async () => {
  const config = {banco:'BANCO DE PRUEBA',titular:'TITULAR DE PRUEBA',
    cuenta:'00000000000001',clabe:'000000000000000001',tarjeta:'0000000000000002',
    mantenimiento:{montoBase:300,recargoTardio:50},legal:{titulo:'Fundamento legal'}};
  const h = harness(async path => {
    assert.equal(path,'/pagos/config');
    return {data:config};
  });
  await h.loadConfig();
  assert.equal(h.inputs.bankName.textContent,'BANCO DE PRUEBA');
  assert.equal(h.inputs.bankHolder.textContent,'TITULAR DE PRUEBA');
  assert.equal(h.inputs.bankAccount.textContent,'00000000000001');
  assert.equal(h.inputs.bankClabe.textContent,'000000000000000001');
  assert.equal(h.inputs.bankCard.textContent,'0000000000000002');
  assert.equal(h.inputs.bankReference.textContent,'CASA DE PRUEBA');
  assert.equal(h.inputs.bankAccount.copy.disabled,false);
  assert.equal(h.synced,1);
  assert.equal(h.summarized,1);
  assert.ok(!h.queried.includes('maintenancePaymentHint'));
});

test('Si el API bancario falla, no se mantienen textos Cargando ni se permite copiar guiones', async () => {
  const h = harness(async () => {throw Error('Servicio no disponible')});
  await assert.rejects(h.loadConfig(), /Servicio no disponible/);
  assert.equal(h.inputs.bankName.textContent,'Datos bancarios no disponibles');
  for(const id of ['bankHolder','bankAccount','bankClabe','bankCard']){
    assert.equal(h.inputs[id].textContent,'—');
    assert.equal(h.inputs[id].copy.disabled,true);
  }
});

test('La versión del recurso se actualizó para evitar caché de iOS', () => {
  assert.match(html,/pagos\.js\?v=20\d{6}-[a-z0-9-]+/);
});
