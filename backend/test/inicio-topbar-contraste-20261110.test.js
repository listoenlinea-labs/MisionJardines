'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const home = fs.readFileSync(path.join(__dirname, '../../docs/index.html'), 'utf8');
const dashboard = fs.readFileSync(path.join(__dirname, '../../docs/assets/js/home-dashboard.js'), 'utf8');
const meter = fs.readFileSync(path.join(__dirname, '../../docs/assets/js/db-capacity-meter.js'), 'utf8');
const block = home.match(/<style id="mjDbCapacityMeterStyles">([\s\S]*?)<\/style>/);
const css = block?.[1] || '';

test('el medidor mantiene colores, borde y texto legibles', () => {
  assert.match(css, /\.mj-db-capacity\s*\{[^}]*background:\s*#fff\s*!important/s);
  assert.match(css, /\.mj-db-capacity\s*\{[^}]*opacity:\s*1\s*!important/s);
  assert.match(css, /\.mj-db-capacity strong\s*\{[^}]*color:\s*#1f2937\s*!important/s);
  assert.match(css, /\.mj-db-capacity small\s*\{[^}]*color:\s*#475467\s*!important/s);
  for (const color of ['red', 'orange', 'yellow', 'green']) {
    assert.match(home, new RegExp('class="mj-db-zone-' + color + '"'));
    assert.match(css, new RegExp('\\.mj-db-zone-' + color + '\\s*\\{'));
  }
  assert.match(css, /\.mj-db-needle\s*\{[^}]*stroke:\s*#344054\s*!important/s);
  assert.match(home, /id="mjDbCapacityMeter"[^>]*\bhidden\b/);
  assert.match(meter, /admins = \['SUPER_ADMIN', 'ADMINISTRADOR'\]/);
});

test('estado de conexión es visible y conserva el color de error', () => {
  assert.match(css, /\.operation-status\s*\{[^}]*color:\s*#166534\s*!important/s);
  assert.match(css, /\.operation-status\[data-health="error"\]\s*\{[^}]*color:\s*#b42318\s*!important/s);
  assert.match(css, /\.operation-status\[data-health="error"\] i\s*\{/);
  assert.match(home, /class="operation-status" data-health="loading"/);
  assert.match(home, /status\.dataset\.health = 'error'/);
  assert.match(dashboard, /status\.dataset\.health = healthy \? 'ok' : 'error'/);
});

test('campana mantiene trazo oscuro, superficie visible y foco de teclado', () => {
  assert.match(css, /\.notification-button\s*\{[^}]*background:\s*#fff\s*!important/s);
  assert.match(css, /\.notification-button svg path\s*\{[^}]*stroke:\s*#344054\s*!important/s);
  assert.match(css, /\.notification-button:focus-visible\s*\{[^}]*outline:\s*2px solid/s);
});

test('la adaptación a pantalla pequeña mantiene tamaños específicos', () => {
  for (const width of ['1150', '820', '480']) {
    assert.ok(css.includes('@media (max-width: ' + width + 'px)'), width);
  }
});
