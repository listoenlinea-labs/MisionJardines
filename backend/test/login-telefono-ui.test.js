const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../docs/assets/js/login.js'), 'utf8');
function page(state = 'ACEPTADA') {
  const nodes = new Map(), requests = [], stored = new Map();
  const $ = id => { if (!nodes.has(id)) nodes.set(id, { value: '', hidden: false, type: 'password', checked: false, listeners: {}, classList: { add() {}, remove() {} }, addEventListener(type, fn) { this.listeners[type] = fn; }, setAttribute() {}, focus() {} }); return nodes.get(id); };
  const storage = { getItem: key => stored.get(key), setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) };
  const location = { hostname: 'example.com', href: 'login.html' };
  vm.runInNewContext(source, { document: { getElementById: $ }, window: { location }, localStorage: storage, sessionStorage: storage, AbortSignal,
    MJPermissions: { landing: role => role === 'SEGURIDAD' ? 'seguridad.html' : 'cuotas.html' }, fetch: async (url, options) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return { ok: true, json: async () => url.endsWith('/telefono') ? { ok: true, estado: state, mensaje: 'Revisión pendiente' } : { ok: true, token: 'synthetic', usuario: { rol: 'SEGURIDAD' } } };
    } });
  return { $, requests, stored, location, async submit() { await $('loginForm').listeners.submit({ preventDefault() {} }); } };
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
