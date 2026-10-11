'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('All main authenticated screens use the same unified theme', () => {
  const sidebar = read('docs/assets/js/site-sidebar.js');
  assert.match(sidebar, /assets\/css\/ui-unificada\.css/);
  assert.doesNotThrow(() => new Function(sidebar));
  const css = read('docs/assets/css/ui-unificada.css');
  for (const name of ['hl-welcome', 'cuotas-hero', 'analysis-hero', 'sec-hero',
    'directory-hero', 'metric-grid', 'cuotas-metric', 'hl-kpi', 'review-heading']) {
    assert.ok(css.includes(name), 'Missing style: ' + name);
  }
  let braces = 0;
  for (const ch of css) braces += ch === '{' ? 1 : ch === '}' ? -1 : 0;
  assert.equal(braces, 0);
});

test('Obsolete banners removed, leaving operational forms', () => {
  const sidebar = read('docs/assets/js/site-sidebar.js');
  const security = read('docs/seguridad.html');
  const policy = read('docs/assets/js/permissions.js');
  assert.equal(fs.existsSync(path.join(root, 'docs/conexion.html')), false);
  assert.equal(sidebar.includes('conexion.html'), false);
  assert.equal(security.includes("location.href='conexion.html'"), false);
  assert.equal(policy.includes('conexion.html'), false);
  assert.ok(security.includes('/conexion/estado'));
  const pagos = read('docs/pagos.html');
  const cuentas = read('docs/verificacion-cuentas.html');
  assert.doesNotMatch(cuentas, /Tú autorizas cada cuenta\./);
  assert.match(cuentas, /id="approvalForm"/);
  assert.doesNotMatch(pagos, /id="validityDate"/);
  assert.doesNotMatch(pagos, /id="validityDetail"/);
  assert.doesNotMatch(pagos, /id="validitySync"/);
  assert.match(pagos, /id="validitySetup"/);
  assert.match(pagos, /id="pendingPayments"/);
});

test('Payments still load controller validity without removed banner nodes', () => {
  const js = read('docs/assets/js/pagos.js');
  assert.doesNotThrow(() => new Function(js));
  assert.match(js, /api\('\/pagos\/vigencia'/);
  assert.match(js, /validity = result\.data/);
  assert.match(js, /updatePreview\(\)/);
  assert.doesNotMatch(js, /\$\('validityDate'\)/);
});

test('Pending financial KPI includes count, percentage and division-by-zero guard', () => {
  const js = read('docs/assets/js/analisis-cuotas.js');
  assert.doesNotThrow(() => new Function(js));
  assert.match(js, /\['Pendientes',data\.pendientes\+' · '/);
  assert.match(js, /houses>0\?Math\.round\(Number\(data\.pendientes\|\|0\)\*100\/houses\):0/);
  const pct = (pending, houses) => houses > 0 ? Math.round(Number(pending || 0) * 100 / houses) : 0;
  assert.equal(pct(239, 239), 100);
  assert.equal(pct(31, 231), 13);
  assert.equal(pct(0, 0), 0);
});

test('Directory heading is visible and demo board is collapsed without losing its data hook', () => {
  const html = read('docs/directorio.html');
  assert.match(html, /<main class="directory-page">/);
  assert.match(html, /<header class="hero directory-hero">/);
  assert.match(html, /<details class="section directory-board">/);
  assert.match(html, /id="boardGrid"/);
  assert.match(html, /id="directoryGrid"/);
});

test('Role preview is still accessible; warning styles retain priority', () => {
  const visitas = read('docs/visitas.html');
  const css = read('docs/assets/css/ui-unificada.css');
  assert.match(visitas, /<details class="role-card mj-role-preview">/);
  assert.match(visitas, /id="rolePreview"/);
  assert.match(css, /\.metric\.bad/);
  assert.match(css, /\.metric\.good/);
});
