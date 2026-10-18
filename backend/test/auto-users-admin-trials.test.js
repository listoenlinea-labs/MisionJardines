const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../../docs/assets/js/auto-users.js'), 'utf8');
test('administrador ve/edita pruebas aceptadas; confirma en panel propio, muestra errores/timeout, permite reintentar y actualiza tabla', async () => {
  const nodes = new Map(), requests = [], buttons = new Map(); let deleted = false, deleteMode = 'success', timeoutCallback;
  const element = () => ({ value: '', textContent: '', hidden: false, innerHTML: '', listeners: {}, append() {}, setAttribute() {},
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
    location: { hostname: 'example.com', href: 'https://example.com/auto-users.html' }, AbortController, setTimeout: fn => { timeoutCallback = fn; return 1; }, clearTimeout() {},
    fetch: async (url, options) => {
      requests.push({ url, options }); let data;
      if (url.includes('/auth/cuentas?')) data = { total: 1, solicitudes: [{ usuario: { nombre: 'Solicitud <segura>', correo: 'new@example.com', telefono: '3312345678' }, calle: 'Prueba', numeroCasa: '5' }] };
      else if (url.endsWith('/config')) data = { correoDisponible: false };
      else if (url.includes('/viviendas')) data = { viviendas: [{ id: 10, calle: 'Prueba', numero: 'TEST-001' }] };
      else if (options.method === 'DELETE') {
        if (deleteMode === 'failure') return { ok: false, status: 409, json: async () => ({ ok: false, message: 'Tiene historial asociado.' }) };
        if (deleteMode === 'invalid') return { ok: false, status: 404, json: async () => { throw Error('HTML response'); } };
        if (deleteMode === 'hang') return new Promise((resolve, reject) => options.signal.addEventListener('abort', () => reject(Object.assign(Error('abort'), { name: 'AbortError' }))));
        deleted = true; data = { mensaje: 'Prueba eliminada.' };
      }
      else if (options.method === 'PATCH') data = {};
      else if (url.endsWith('/prueba/crear')) data = { usuarioId: 8, cuentaAceptada: false };
      else if (url.endsWith('/crear') || url.endsWith('/invitaciones')) data = { resultados: [], siguiente: null };
      else if (url.includes('/prueba/usuarios')) data = { registros: deleted ? [] : [trial], total: deleted ? 0 : 1 };
      else data = { registros: [], reportes: [], total: 0, totalReportes: 0 };
      return { ok: true, json: async () => ({ ok: true, ...data }) };
    } };
  await vm.runInNewContext(source, context);
  assert.match($('pendingRequestsState').textContent, /1 solicitud/);
  assert.match($('pendingRequestsList').innerHTML, /Solicitud &lt;segura&gt;/);
  assert.match($('trialRows').innerHTML, /ACTIVO/); assert.match($('trialRows').innerHTML, /Aceptada: Sí/);
  assert.doesNotMatch($('trialRows').innerHTML, /data-trial-link/);
  buttons.get('[data-trial-edit]').listeners.click();
  assert.equal($('editPreregistration').open, true); assert.equal($('editUsername').value, 'trial');
  $('editUsername').value = 'trial-changed';
  await $('editPreregistrationForm').listeners.submit({ preventDefault() {}, submitter: { disabled: false } });
  const patch = requests.find(r => r.options.method === 'PATCH');
  assert.match(patch.url, /\/prueba\/8$/); assert.equal(JSON.parse(patch.options.body).nombreUsuario, 'trial-changed');
  await buttons.get('[data-trial-delete]').listeners.click();
  assert.equal($('deleteTrialDialog').open, true);
  await $('cancelDeleteTrial').listeners.click();
  assert.equal($('deleteTrialDialog').open, false);
  assert.ok(!requests.some(r => r.options.method === 'DELETE'));
  await buttons.get('[data-trial-delete]').listeners.click();
  deleteMode = 'failure'; await $('confirmDeleteTrial').listeners.click();
  assert.equal($('deleteTrialDialog').open, true);
  assert.equal($('deleteTrialMessage').textContent, 'Tiene historial asociado.');
  assert.equal($('confirmDeleteTrial').disabled, false);
  deleteMode = 'invalid'; await $('confirmDeleteTrial').listeners.click();
  assert.match($('deleteTrialMessage').textContent, /HTTP 404/);
  deleteMode = 'hang'; const pendingDelete = $('confirmDeleteTrial').listeners.click();
  assert.match($('deleteTrialMessage').textContent, /Borrando/);
  assert.equal($('confirmDeleteTrial').disabled, true);
  timeoutCallback(); await pendingDelete;
  assert.match($('deleteTrialMessage').textContent, /a tiempo/);
  assert.equal($('confirmDeleteTrial').disabled, false);
  assert.equal($('cancelDeleteTrial').disabled, false);
  deleteMode = 'success'; await $('confirmDeleteTrial').listeners.click();
  assert.equal($('deleteTrialDialog').open, false);
  assert.match(requests.find(r => r.options.method === 'DELETE').url, /\/prueba\/8$/);
  assert.match($('trialRows').innerHTML, /No hay cuentas/);
  assert.ok(!requests.some(r => r.url.endsWith('/crear') || r.url.endsWith('/invitaciones')));
  const batchRequests = () => requests.filter(r => /\/auto-users\/(crear|invitaciones)$/.test(r.url));
  for (const [button, route] of [['createUsers', '/crear'], ['sendInvitations', '/invitaciones']]) {
    const before = batchRequests().length;
    await $(button).listeners.click();
    assert.equal($('confirmBatchDialog').open, true);
    assert.equal(batchRequests().length, before);
    await $('confirmBatchNo').listeners.click();
    assert.equal($('confirmBatchDialog').open, false);
    assert.equal(batchRequests().length, before);
    await $(button).listeners.click();
    await $('confirmBatchDialog').listeners.cancel(); $('confirmBatchDialog').close();
    await $('confirmBatchYes').listeners.click();
    assert.equal(batchRequests().length, before);
    await $(button).listeners.click();
    await $('confirmBatchYes').listeners.click();
    assert.equal(batchRequests().length, before + 1);
    assert.ok(batchRequests().at(-1).url.endsWith(route));
    assert.equal($('confirmBatchDialog').open, false);
    await $('confirmBatchYes').listeners.click();
    assert.equal(batchRequests().length, before + 1);
  }
  const beforeTrial = batchRequests().length;
  await $('createTrial').listeners.click();
  assert.ok(requests.some(r => r.url.endsWith('/prueba/crear')));
  assert.equal($('confirmBatchDialog').open, false);
  assert.equal(batchRequests().length, beforeTrial);
});
