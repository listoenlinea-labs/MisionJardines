'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '../../docs');
const css = fs.readFileSync(path.join(root, 'assets/css/product-ui.css'), 'utf8');
const shellJs = fs.readFileSync(path.join(root, 'assets/js/app-shell.js'), 'utf8');
const shellCss = fs.readFileSync(path.join(root, 'assets/css/app-shell.css'), 'utf8');
const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

test('identifica la superposición real: ::before tiene z-index 89 y el iframe z-index 2', () => {
  assert.match(css, /body\.mj-shared-sidebar-enabled:not\(\.mj-home\)::before\s*\{[^}]*z-index:89/s);
  assert.match(shellCss, /\.mj-app-frame\.is-active\s*\{[^}]*z-index:2/s);
});

test('Inicio en shell desactiva solo la capa blanca que tapa el header', () => {
  assert.match(css,
    /body\.mj-app-shell\.mj-shared-sidebar-enabled\.mj-shell-home-header::before\s*\{\s*content:none!important;\s*display:none!important;/s);
  assert.match(shellJs, /currentPage\s*=\s*route\.page;\s*[\s\S]*?document\.body\.classList\.toggle\('mj-shell-home-header',\s*currentPage\s*===\s*home\)/);
  assert.match(shellJs, /function finishFrame\(/);
});

test('se conserva fondo de header del shell para secciones diferentes a Inicio', () => {
  const rule = css.match(/body\.mj-app-shell\.mj-shared-sidebar-enabled\.mj-shell-home-header::before\s*\{([^}]*)\}/);
  assert.ok(rule);
  assert.doesNotMatch(rule[1], /(?:\.mj-top-tools|\.mj-search-launch|\.mj-account-top|\.mj-app-frame)/);
  assert.match(css, /body\.mj-shared-sidebar-enabled:not\(\.mj-home\)::before\s*\{/);
});

test('no se alteran el rol del medidor ni los controles del encabezado', () => {
  assert.match(home, /id="mjDbCapacityMeter"[^>]*hidden/);
  assert.match(home, /id="notificationButton"/);
  assert.match(home, /class="operation-status"/);
  assert.match(home, /mjDbCapacityMeterStyles/);
});
