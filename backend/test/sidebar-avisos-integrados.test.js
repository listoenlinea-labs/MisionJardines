const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

test('los avisos de pagos, Casa Club y cuentas coexisten y respetan rol y vivienda', async () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../../docs/assets/js/site-sidebar.js'), 'utf8');
  for (const role of ['ADMINISTRADOR', 'CONDOMINO']) {
    const requests = [], events = [];
    const links = new Map(['pagos.html', 'index.html', 'casa-club.html', 'verificacion-cuentas.html'].map(page => [page, {
      badges: [], querySelector() { return null; }, append(badge) { this.badges.push(badge); },
      appendChild(badge) { this.badges.push(badge); }, setAttribute() {}
    }]));
    const storage = { getItem(key) { return ({ misionJardinesToken: 'synthetic-session', misionJardinesUsuario: JSON.stringify({ rol: role }), mjCasaSeleccionada: '123' })[key] || null; } };
    const context = { localStorage: storage, sessionStorage: storage, window: {}, location: { hostname: 'localhost' }, AbortSignal,
      MJPermissions: { canAccess: () => true }, CustomEvent: class { constructor(name, options) { this.name = name; this.detail = options.detail; } },
      document: { readyState: 'loading', addEventListener() {}, dispatchEvent(event) { events.push(event); }, createElement() { return { setAttribute() {} }; } },
      fetch: async (url, options) => {
        requests.push({ url, options });
        return { ok: true, json: async () => url.includes('/auth/cuentas') ? { ok: true, total: 4 } : url.includes('/casa-club/') ? { ok: true, cantidad: 3 } : { ok: true, data: { cantidad: 2 } } };
      }
    };
    vm.runInNewContext(source.replace(/\}\)\(\);\s*$/, 'globalThis.notices = { refreshPaymentNotices, alertAccountRequests }; })();'), context);
    const aside = { querySelector(selector) { return links.get(selector.match(/href="([^"]+)"/)[1]); } };
    await Promise.all([context.notices.refreshPaymentNotices(aside), context.notices.alertAccountRequests(aside)]);
    assert.equal(links.get('pagos.html').badges[0].textContent, '2');
    assert.equal(links.get('index.html').badges[0].textContent, '2');
    assert.equal(events[0].name, 'mj:adeudos');
    assert.equal(requests.find(r => r.url.endsWith('/pagos/adeudos')).options.headers['X-Casa-Id'], '123');
    assert.ok(requests.every(r => r.options.headers.Authorization === 'Bearer synthetic-session'));
    assert.equal(links.get('casa-club.html').badges.length, role === 'ADMINISTRADOR' ? 1 : 0);
    assert.equal(links.get('verificacion-cuentas.html').badges.length, role === 'ADMINISTRADOR' ? 1 : 0);
    if (role === 'ADMINISTRADOR') {
      assert.equal(links.get('casa-club.html').badges[0].textContent, '3');
      assert.match(links.get('verificacion-cuentas.html').badges[0].textContent, /4 pendientes/);
    } else assert.equal(requests.length, 1);
  }
});
