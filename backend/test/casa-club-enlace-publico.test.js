'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const permissions = require('../../docs/assets/js/permissions.js');

const source = readFileSync(path.join(__dirname, '../../docs/assets/js/app-shell.js'), 'utf8');
async function abrir(page, { token, status = 200, role = 'CONDOMINO', disconnected = false } = {}) {
  const url = new URL('https://example.invalid/MisionJardines/app.html');
  url.searchParams.set('page', page);
  const redirects = [], elements = new Map();
  const storage = () => {
    const values = new Map(token ? [['misionJardinesToken', token]] : []);
    return { getItem: k => values.get(k), setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  };
  const localStorage = storage(), sessionStorage = storage();
  let profileCalls = 0;
  const window = {
    MJ_TOKEN: token, MJPermissions: permissions, MJInstallPullRefresh() {}, addEventListener() {},
    async MJFetchWithTimeout() {
      profileCalls++;
      if (disconnected) throw new Error('Sin conexión');
      return { status, ok: status === 200, json: async () => ({ ok: true, usuario: { rol: role } }) };
    }
  };
  vm.runInNewContext(source, {
    window, location: { href: url.href, search: url.search, origin: url.origin, replace: value => redirects.push(value) },
    document: {
      addEventListener() {}, querySelectorAll: () => [], querySelector: () => null,
      body: { classList: { remove() {} } },
      getElementById(id) {
        if (!elements.has(id)) elements.set(id, { addEventListener() {}, querySelector: () => ({}) });
        return elements.get(id);
      }
    },
    history: { replaceState() {} }, URL, URLSearchParams, WeakSet, localStorage, sessionStorage
  });
  await window.MJAccessReady;
  return { redirects, profileCalls, frame: elements.get('mjPageA').src, token: localStorage.getItem('misionJardinesToken') };
}

test('el enlace exacto de Casa Club abre el formulario público sin consultar sesión', async () => {
  const r = await abrir('casa-club.html');
  assert.deepEqual(r.redirects, ['casa-club.html']);
  assert.equal(r.profileCalls, 0);
});
test('una sesión vencida o un perfil no disponible no bloquea el enlace público', async () => {
  const expired = await abrir('casa-club.html', { token: 'test', status: 401 });
  assert.deepEqual(expired.redirects, ['casa-club.html']);
  assert.equal(expired.token, undefined);
  assert.deepEqual((await abrir('casa-club.html', { token: 'test', disconnected: true })).redirects, ['casa-club.html']);
});
test('la excepción no abre pagos, administración ni destinos externos sin sesión', async () => {
  for (const page of ['pagos.html', 'analisis-cuotas.html', 'https://example.org/casa-club.html', 'casa-club.html?admin=1']) {
    assert.deepEqual((await abrir(page)).redirects, ['login.html']);
  }
  assert.deepEqual((await abrir('pagos.html', { token: 'test', status: 401 })).redirects, ['login.html']);
});
test('Administración autenticada conserva Casa Club dentro del portal', async () => {
  const r = await abrir('casa-club.html', { token: 'test', role: 'ADMINISTRADOR' });
  assert.deepEqual(r.redirects, []);
  assert.match(r.frame, /\/casa-club\.html\?_mjFrame=1$/);
});
