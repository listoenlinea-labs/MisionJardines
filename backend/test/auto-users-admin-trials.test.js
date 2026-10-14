const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../docs/assets/js/auto-users.js'), 'utf8');
test('administrador ve/edita pruebas aceptadas; cancelar borrado no solicita DELETE y confirmar actualiza tabla', async () => {
  const nodes = new Map(), requests = [], buttons = new Map(); let confirmed = false, deleted = false;
  const element = () => ({ value: '', textContent: '', hidden: false, innerHTML: '', listeners: {}, append() {},
    addEventListener(type, fn) { this.listeners[type] = fn; }, showModal() { this.open = true; }, close() { this.open = false; } });
  const $ = id => { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); };
  const trial = { id: 8, condominoId: 9, casaId: 10, nombre: 'Prueba', nombreUsuario: 'trial', correo: 'trial@example.com',
    cuentaAceptada: true, estatus: 'ACTIVO', creadoEn: '2026-10-13', actualizadoEn: '2026-10-13', casa: { calle: 'Prueba', numero: 'TEST-001' }, condomino: { nombreCompleto: 'Prueba' } };
  const storage = { getItem: key => key === 'misionJardinesToken' ? 'synthetic-admin' : key === 'misionJardinesUsuario' ? JSON.stringify({ rol: 'ADMINISTRADOR' }) : null, setItem() {} };
  const context = { document: { getElementById: $, createElement: element, querySelectorAll(selector) {
    if (!['[data-trial-edit]', '[data-trial-delete]'].includes(selector) || deleted) return [];
    if (!buttons.has(selector)) buttons.set(selector, { ...element(), dataset: { trialEdit: '8', trialDelete: '8' } });
    return [buttons.get(selector)];
  } }, localStorage: storage, sessionStorage: storage, crypto: { randomUUID: () => 'a'.repeat(32) }, URL,
    location: { hostname: 'example.com', href: 'https://example.com/auto-users.html' }, confirm: () => confirmed,
    fetch: async (url, options) => {
      requests.push({ url, options }); let data;
      if (url.endsWith('/config')) data = { whatsappDisponible: false };
      else if (url.includes('/viviendas')) data = { viviendas: [{ id: 10, calle: 'Prueba', numero: 'TEST-001' }] };
      else if (options.method === 'DELETE') { deleted = true; data = { mensaje: 'Prueba eliminada.' }; }
      else if (options.method === 'PATCH') data = {};
      else if (url.includes('/prueba/usuarios')) data = { registros: deleted ? [] : [trial], total: deleted ? 0 : 1 };
      else data = { registros: [], reportes: [], total: 0, totalReportes: 0 };
      return { ok: true, json: async () => ({ ok: true, ...data }) };
    } };
  await vm.runInNewContext(source, context);
  assert.match($('trialRows').innerHTML, /ACTIVO/); assert.match($('trialRows').innerHTML, /Aceptada: Sí/);
  assert.doesNotMatch($('trialRows').innerHTML, /data-trial-link/);
  buttons.get('[data-trial-edit]').listeners.click();
  assert.equal($('editPreregistration').open, true); assert.equal($('editUsername').value, 'trial');
  $('editUsername').value = 'trial-changed';
  await $('editPreregistrationForm').listeners.submit({ preventDefault() {}, submitter: { disabled: false } });
  const patch = requests.find(r => r.options.method === 'PATCH');
  assert.match(patch.url, /\/prueba\/8$/); assert.equal(JSON.parse(patch.options.body).nombreUsuario, 'trial-changed');
  await buttons.get('[data-trial-delete]').listeners.click();
  assert.ok(!requests.some(r => r.options.method === 'DELETE'));
  confirmed = true; await buttons.get('[data-trial-delete]').listeners.click();
  assert.match(requests.find(r => r.options.method === 'DELETE').url, /\/prueba\/8$/);
  assert.match($('trialRows').innerHTML, /No hay cuentas/);
  assert.ok(!requests.some(r => r.url.endsWith('/crear') || r.url.endsWith('/invitaciones')));
});
