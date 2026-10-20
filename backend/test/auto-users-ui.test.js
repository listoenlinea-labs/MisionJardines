const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../../docs/assets/js/aceptar-cuenta.js'), 'utf8');
async function page(viviendas, validate = async () => ({ ok: true, valido: true })) {
  const fields = new Map(), requests = [], redirects = [], stored = new Map();
  const $ = id => {
    if (!fields.has(id)) fields.set(id, { value: '', hidden: true, textContent: '', listeners: {},
      addEventListener(type, fn) { this.listeners[type] = fn; }, reportValidity() { return true; }, showModal() { this.open = true; }, close() { this.open = false; }, focus() {} });
    return fields.get(id);
  };
  const storage = { setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) };
  const context = { document: { getElementById: $ }, location: { hash: '#invitacion=' + 'a'.repeat(64), hostname: 'example.com', pathname: '/aceptar-cuenta.html', replace: page => redirects.push(page) },
    history: { replaceState() {} }, URLSearchParams, localStorage: storage, sessionStorage: storage,
    fetch: async (url, options) => {
      const body = JSON.parse(options.body); requests.push({ url, body });
      if (url.endsWith('/consultar')) return { ok: true, json: async () => ({ ok: true, registro: { ...(viviendas ? { viviendas, casaId: 10 } : {}), nombre: 'Persona Prueba', calle: 'Calle Prueba', numero: '5', correo: 'prueba@example.com', nombreUsuario: 'prueba@example.com' } }) };
      if (url.endsWith('/validar')) { const result = await validate(body); return { ok: result.ok, json: async () => result }; }
      if (url.endsWith('/aceptar') && body.numeroConfirmado !== '5') return { ok: false, json: async () => ({ ok: false, message: 'Número incorrecto' }) };
      return { ok: true, json: async () => ({ ok: true, token: 'synthetic-session', usuario: { id: 1, rol: { nombre: 'CONDOMINO' } } }) };
    } };
  await vm.runInNewContext(source, context);
  const event = { preventDefault() {} };
  return { $, requests, redirects, stored, async fire(id, type) { await $(id).listeners[type](event); } };
}

test('public page preloads editable email/username and street/house are text, not inputs', async () => {
  const p = await page(); assert.equal(p.$('invitationStreet').textContent, 'Calle Prueba'); assert.equal(p.$('invitationHouse').textContent, '5');
  assert.equal(p.$('acceptEmail').value, 'prueba@example.com'); assert.equal(p.$('acceptUsername').value, 'prueba@example.com');
  const html = fs.readFileSync(path.join(__dirname, '../../docs/aceptar-cuenta.html'), 'utf8');
  assert.match(html, /<strong id="invitationStreet">/); assert.match(html, /<strong id="invitationHouse">/);
  assert.doesNotMatch(html, /<input[^>]*id="invitation(?:Street|House)"/);
});
test('second confirmation supports NO; wrong number stays on page, correct number creates session and redirects Inicio', async () => {
  const p = await page(); p.$('acceptPassword').value = p.$('acceptPasswordConfirm').value = 'PruebaSegura123';
  await p.fire('acceptAccountForm', 'submit'); assert.equal(p.$('confirmAddress').open, true);
  await p.fire('addressNo', 'click'); assert.equal(p.$('confirmAddress').open, false); assert.equal(p.requests.length, 2);
  assert.ok(p.requests[1].url.endsWith('/validar')); assert.ok(!p.requests.some(r => r.url.endsWith('/aceptar')));
  await p.fire('acceptAccountForm', 'submit'); p.$('confirmHouseNumber').value = '7';
  await p.fire('confirmAddressForm', 'submit'); assert.equal(p.$('confirmMessage').textContent, 'Número incorrecto'); assert.equal(p.redirects.length, 0);
  p.$('confirmHouseNumber').value = '5'; await p.fire('confirmAddressForm', 'submit');
  assert.equal(p.redirects[0], 'index.html'); assert.equal(p.stored.get('misionJardinesToken'), 'synthetic-session');
  assert.equal(p.$('acceptPassword').value, '');
  assert.equal(p.requests.at(-1).body.casaId, undefined); assert.equal(p.requests.at(-1).body.calle, undefined);
});
test('Crear cuenta valida datos antes del panel y muestra errores del servidor en el formulario', async () => {
  for (const message of ['Correo inválido', 'Usuario no válido', 'El nombre de usuario o correo ya está registrado. Usa otro.', 'La contraseña no cumple los parámetros']) {
    const p = await page(undefined, async () => ({ ok: false, message }));
    p.$('acceptPassword').value = p.$('acceptPasswordConfirm').value = 'PruebaSegura123';
    await p.fire('acceptAccountForm', 'submit');
    assert.equal(p.$('acceptMessage').textContent, message);
    assert.notEqual(p.$('confirmAddress').open, true);
    assert.equal(p.$('createAccount').disabled, false);
    assert.ok(!p.requests.some(r => r.url.endsWith('/aceptar')));
  }
});
test('contraseñas diferentes y restricciones HTML impiden abrir la confirmación', async () => {
  const p = await page(); p.$('acceptPassword').value = 'PruebaSegura123'; p.$('acceptPasswordConfirm').value = 'OtraClave123';
  await p.fire('acceptAccountForm', 'submit');
  assert.match(p.$('acceptMessage').textContent, /no coinciden/); assert.equal(p.requests.length, 1);
  p.$('acceptAccountForm').reportValidity = () => false;
  p.$('acceptPasswordConfirm').value = p.$('acceptPassword').value;
  await p.fire('acceptAccountForm', 'submit'); assert.equal(p.requests.length, 1); assert.notEqual(p.$('confirmAddress').open, true);
});
test('validación pendiente bloquea doble clic y no aprueba datos editados durante la consulta', async () => {
  let resolve;
  const p = await page(undefined, () => new Promise(done => { resolve = done; }));
  p.$('acceptPassword').value = p.$('acceptPasswordConfirm').value = 'PruebaSegura123';
  const first = p.fire('acceptAccountForm', 'submit');
  assert.equal(p.$('createAccount').disabled, true);
  await p.fire('acceptAccountForm', 'submit'); assert.equal(p.requests.length, 2);
  p.$('acceptUsername').value = 'nuevo-usuario'; resolve({ ok: true, valido: true }); await first;
  assert.notEqual(p.$('confirmAddress').open, true); assert.match(p.$('acceptMessage').textContent, /datos cambiaron/);
  assert.equal(p.$('createAccount').disabled, false);
});
test('confirmación exige validación previa y el panel pide SOLO el número de casa', async () => {
  const p = await page(); await p.fire('confirmAddressForm', 'submit');
  assert.equal(p.requests.length, 1); assert.match(p.$('acceptMessage').textContent, /validar tus datos/);
  const html = fs.readFileSync(path.join(__dirname, '../../docs/aceptar-cuenta.html'), 'utf8');
  assert.match(html, /<h2>Introduce SOLO tu numero de casa<\/h2>/);
});
test('reporting error sends description without password and opens acknowledgment instead of accepting', async () => {
  const p = await page(); p.$('acceptPassword').value = 'PruebaSegura123';
  await p.fire('reportRegistrationError', 'click'); assert.equal(p.$('reportAddressError').open, true);
  p.$('registrationErrorComment').value = 'Mi calle y número están equivocados.';
  await p.fire('reportAddressErrorForm', 'submit'); assert.equal(p.$('errorReportSent').open, true);
  assert.equal(p.$('acceptAccountForm').hidden, true); assert.equal(p.requests.at(-1).body.contrasena, undefined);
  assert.ok(!p.requests.some(r => r.url.endsWith('/aceptar'))); assert.equal(p.$('acceptPassword').value, '');
});
test('auto-users menu and page policy are exclusive to administrative roles', () => {
  const policy = require('../../docs/assets/js/permissions');
  for (const role of ['CONDOMINO', 'SEGURIDAD', 'MESA_DIRECTIVA', 'MANTENIMIENTO']) assert.equal(policy.canAccess(role, 'auto-users.html'), false);
  assert.equal(policy.canAccess('ADMINISTRADOR', 'auto-users.html'), true); assert.equal(policy.canAccess('SUPER_ADMIN', 'auto-users.html'), true);
  const routes = fs.readFileSync(path.join(__dirname, '../src/routes/auto-users.routes.js'), 'utf8');
  assert.match(routes, /router\.use\(autenticarToken, autorizarRoles\('SUPER_ADMIN', 'ADMINISTRADOR'\)\)/);
  assert.ok(routes.indexOf("router.post('/crear'") > routes.indexOf('router.use(autenticarToken'));
});
test('aceptación muestra todas las viviendas como texto y envía cada confirmación por ID', async () => {
  const p = await page([{ id: 10, calle: 'Calle Prueba', numero: '5' }, { id: 11, calle: 'Otra <calle>', numero: 'A-2' }]);
  assert.match(p.$('additionalHouses').innerHTML, /Otra &lt;calle&gt;/);
  assert.match(p.$('additionalConfirmations').innerHTML, /confirmExtra0/);
  p.$('acceptPassword').value = p.$('acceptPasswordConfirm').value = 'PruebaSegura123';
  await p.fire('acceptAccountForm', 'submit');
  p.$('confirmHouseNumber').value = '5'; p.$('confirmExtra0').value = 'A-2';
  await p.fire('confirmAddressForm', 'submit');
  assert.deepEqual(p.requests.at(-1).body.viviendasConfirmadas, [{ id: 10, numero: '5' }, { id: 11, numero: 'A-2' }]);
});
