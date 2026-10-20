const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../docs/assets/js/login.js'), 'utf8');
function page(config = {}) {
  const nodes = new Map(), requests = [], stored = new Map(), localStored = new Map();
  const $ = id => { if (!nodes.has(id)) nodes.set(id, { value: '', hidden: false, type: 'password', checked: false, listeners: {}, classList: { add() {}, remove() {} }, addEventListener(type, fn) { this.listeners[type] = fn; }, setAttribute() {}, focus() {} }); return nodes.get(id); };
  const storage = map => ({ getItem: key => map.get(key), setItem: (key, value) => map.set(key, value), removeItem: key => map.delete(key) });
  if (config.saved) localStored.set('misionJardinesToken', config.saved);
  const location = { hostname: 'example.com', href: 'login.html', replace(value) { this.href = value; } };
  let releaseProfile;
  const profileGate = config.deferProfile ? new Promise(resolve => { releaseProfile = resolve; }) : Promise.resolve();
  const ready = vm.runInNewContext(source, { document: { getElementById: $ }, window: { location }, localStorage: storage(localStored), sessionStorage: storage(stored), AbortSignal,
    MJPermissions: { landing: role => role === 'SEGURIDAD' ? 'seguridad.html' : 'cuotas.html' }, fetch: async (url, options) => {
      requests.push({ url, body: options.body ? JSON.parse(options.body) : null, options });
      if (url.endsWith('/auth/perfil')) {
        await profileGate;
        if (config.networkError) throw Error('Network unavailable');
        const status = config.profileStatus || 200;
        return { ok: status === 200, status, json: async () => ({ ok: status === 200, usuario: { id: 9, rol: config.profileRole || 'SEGURIDAD' } }) };
      }
      return { ok: true, json: async () => ({ ok: true, token: 'synthetic', usuario: { rol: 'SEGURIDAD' } }) };
    } });
  return { $, requests, stored, localStored, location, ready, releaseProfile, async submit() { await $('loginForm').listeners.submit({ preventDefault() {} }); } };
}
test('login muestra usuario y contraseña desde el inicio y autentica sin consultar teléfonos', async () => {
  const html = fs.readFileSync(path.join(__dirname, '../../docs/login.html'), 'utf8');
  assert.match(html, /Usuario o correo electrónico/);
  assert.match(html, /id="passwordFields"><label/);
  assert.match(html, /autocomplete="current-password" required/);
  assert.doesNotMatch(html, /loginAlternative|type="tel"|Teléfono con lada/);
  for (const identifier of ['admin@example.com', 'usuario-prueba', '3312345678']) {
    const p = page(); p.$('correo').value = identifier; p.$('contrasena').value = 'Prueba123'; await p.submit();
    assert.equal(p.requests.length, 1); assert.ok(p.requests[0].url.endsWith('/auth/login'));
    assert.equal(p.requests[0].body.correo, identifier); assert.equal(p.requests[0].body.telefono, undefined);
    assert.equal(p.location.href, 'app.html?page=seguridad.html');
    assert.equal(p.stored.has('mjTelefonoPreregistro'), false); assert.equal(p.stored.has('mjTelefonoSolicitud'), false);
  }
});
test('sin usuario o contraseña no consulta API ni abre registro/prerregistro', async () => {
  for (const [identifier, password] of [['', 'Prueba123'], ['usuario', '']]) {
    const p = page(); p.$('correo').value = identifier; p.$('contrasena').value = password; await p.submit();
    assert.equal(p.requests.length, 0); assert.equal(p.location.href, 'login.html');
    assert.match(p.$('messageText').textContent, /usuario o correo y contraseña/);
  }
});
test('recordarme llega al servidor y elige almacenamiento sin guardar contraseña', async () => {
  for (const remember of [true, false]) {
    const p = page(); p.$('recordarme').checked = remember;
    p.$('correo').value = 'admin@example.com'; p.$('contrasena').value = 'Prueba123'; await p.submit();
    assert.equal(p.requests.length, 1); assert.equal(p.requests[0].body.recordarme, remember);
    assert.equal((remember ? p.localStored : p.stored).get('misionJardinesToken'), 'synthetic');
    assert.equal((remember ? p.stored : p.localStored).get('misionJardinesToken'), undefined);
    assert.ok(!JSON.stringify([...p.stored, ...p.localStored]).includes('Prueba123'));
  }
});
test('al volver al login una sesión guardada se valida en perfil antes de redirigir con rol vigente', async () => {
  const p = page({ saved: 'saved-session', deferProfile: true });
  assert.equal(p.location.href, 'login.html');
  assert.equal(p.requests[0].options.headers.Authorization, 'Bearer saved-session');
  assert.equal(p.requests[0].options.cache, 'no-store');
  p.releaseProfile(); await p.ready;
  assert.equal(p.location.href, 'app.html?page=seguridad.html'); assert.equal(p.localStored.get('misionJardinesToken'), 'saved-session');
  assert.equal(p.$('contrasena').value, '');
});
test('sesión revocada/expirada se limpia y error de red conserva el token sin abrir el portal', async () => {
  for (const status of [401, 403]) {
    const p = page({ saved: 'invalid-session', profileStatus: status }); await p.ready;
    assert.equal(p.localStored.get('misionJardinesToken'), undefined); assert.equal(p.location.href, 'login.html');
    assert.notEqual(p.$('passwordFields').hidden, true);
  }
  const p = page({ saved: 'offline-session', networkError: true }); await p.ready;
  assert.equal(p.localStored.get('misionJardinesToken'), 'offline-session'); assert.equal(p.location.href, 'login.html');
});
test('una respuesta tardía de perfil no borra ni reemplaza la cuenta recién autenticada', async () => {
  for (const status of [200, 403]) {
    const p = page({ saved: 'old-session', profileStatus: status, deferProfile: true, profileRole: 'CONDOMINO' });
    p.$('correo').value = 'admin@example.com'; p.$('contrasena').value = 'Prueba123';
    await p.submit(); assert.equal(p.stored.get('misionJardinesToken'), 'synthetic');
    p.releaseProfile(); await p.ready;
    assert.equal(p.stored.get('misionJardinesToken'), 'synthetic'); assert.equal(p.location.href, 'app.html?page=seguridad.html');
  }
});
