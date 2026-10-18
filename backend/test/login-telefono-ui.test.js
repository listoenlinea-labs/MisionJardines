const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../docs/assets/js/login.js'), 'utf8');
function page(state = 'ACEPTADA', config = {}) {
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
      return { ok: true, json: async () => url.endsWith('/telefono') ? { ok: true, estado: state, mensaje: 'Revisión pendiente' } : { ok: true, token: 'synthetic', usuario: { rol: 'SEGURIDAD' } } };
    } });
  return { $, requests, stored, localStored, location, ready, releaseProfile, async submit() { await $('loginForm').listeners.submit({ preventDefault() {} }); } };
}
test('login comienza solo con teléfono, muestra contraseña para cuenta aceptada y la oculta al cambiar número', async () => {
  const p = page(); assert.equal(p.$('passwordFields').hidden, true); assert.equal(p.$('contrasena').disabled, true);
  p.$('correo').value = '3312345678'; await p.submit();
  assert.equal(p.$('passwordFields').hidden, false); assert.equal(p.requests.length, 1);
  p.$('contrasena').value = 'Prueba123'; await p.submit();
  assert.equal(p.requests[1].body.telefono, '3312345678'); assert.equal(p.requests[1].body.correo, undefined);
  assert.equal(p.location.href, 'seguridad.html');
  p.$('correo').value = '3398765432'; p.$('correo').listeners.input();
  assert.equal(p.$('passwordFields').hidden, true); assert.equal(p.$('contrasena').value, '');
});
test('prerregistro va a aceptación sin recibir token por teléfono; desconocido va a solicitud y revisión no abre contraseña', async () => {
  for (const state of ['PRERREGISTRO', 'NUEVA', 'REVISION']) {
    const p = page(state); p.$('correo').value = '3312345678'; await p.submit();
    assert.equal(p.requests.length, 1); assert.equal(p.$('passwordFields').hidden, true);
    if (state === 'PRERREGISTRO') { assert.equal(p.location.href, 'aceptar-cuenta.html#desde-login'); assert.equal(p.stored.get('mjTelefonoPreregistro'), '3312345678'); }
    else if (state === 'NUEVA') { assert.equal(p.location.href, 'registro.html#desde-login'); assert.equal(p.stored.get('mjTelefonoSolicitud'), '3312345678'); }
    else { assert.equal(p.location.href, 'login.html'); assert.equal(p.$('messageText').textContent, 'Revisión pendiente'); }
  }
});
test('acceso alternativo conserva usuarios/correo para administradores sin teléfono', async () => {
  const p = page(); p.$('loginAlternative').listeners.click();
  assert.equal(p.$('passwordFields').hidden, false);
  p.$('correo').value = 'admin@example.com'; p.$('contrasena').value = 'Prueba123'; await p.submit();
  assert.equal(p.requests.length, 1); assert.equal(p.requests[0].body.correo, 'admin@example.com');
  assert.equal(p.requests[0].body.telefono, undefined);
});

test('recordarme llega al servidor por teléfono o correo y elige almacenamiento sin guardar contraseña', async () => {
  for (const phone of [true, false]) for (const remember of [true, false]) {
    const p = page(); p.$('recordarme').checked = remember;
    if (!phone) p.$('loginAlternative').listeners.click();
    p.$('correo').value = phone ? '3312345678' : 'admin@example.com';
    if (phone) await p.submit();
    p.$('contrasena').value = 'Prueba123'; await p.submit();
    const request = p.requests.find(r => r.url.endsWith('/auth/login'));
    assert.equal(request.body.recordarme, remember);
    assert.equal((remember ? p.localStored : p.stored).get('misionJardinesToken'), 'synthetic');
    assert.equal((remember ? p.stored : p.localStored).get('misionJardinesToken'), undefined);
    assert.ok(!JSON.stringify([...p.stored, ...p.localStored]).includes('Prueba123'));
  }
});
test('al volver al login una sesión guardada se valida en perfil antes de redirigir con rol vigente', async () => {
  const p = page('ACEPTADA', { saved: 'saved-session', deferProfile: true });
  assert.equal(p.location.href, 'login.html');
  assert.equal(p.requests[0].options.headers.Authorization, 'Bearer saved-session');
  assert.equal(p.requests[0].options.cache, 'no-store');
  p.releaseProfile(); await p.ready;
  assert.equal(p.location.href, 'seguridad.html'); assert.equal(p.localStored.get('misionJardinesToken'), 'saved-session');
  assert.equal(p.$('contrasena').value, '');
});
test('sesión revocada/expirada se limpia y error de red conserva el token sin abrir el portal', async () => {
  for (const status of [401, 403]) {
    const p = page('ACEPTADA', { saved: 'invalid-session', profileStatus: status }); await p.ready;
    assert.equal(p.localStored.get('misionJardinesToken'), undefined); assert.equal(p.location.href, 'login.html');
    assert.equal(p.$('passwordFields').hidden, true);
  }
  const p = page('ACEPTADA', { saved: 'offline-session', networkError: true }); await p.ready;
  assert.equal(p.localStored.get('misionJardinesToken'), 'offline-session'); assert.equal(p.location.href, 'login.html');
});
test('una respuesta tardía de perfil no borra ni reemplaza la cuenta recién autenticada', async () => {
  for (const status of [200, 403]) {
    const p = page('ACEPTADA', { saved: 'old-session', profileStatus: status, deferProfile: true, profileRole: 'CONDOMINO' });
    p.$('loginAlternative').listeners.click(); p.$('correo').value = 'admin@example.com'; p.$('contrasena').value = 'Prueba123';
    await p.submit(); assert.equal(p.stored.get('misionJardinesToken'), 'synthetic');
    p.releaseProfile(); await p.ready;
    assert.equal(p.stored.get('misionJardinesToken'), 'synthetic'); assert.equal(p.location.href, 'seguridad.html');
  }
});
