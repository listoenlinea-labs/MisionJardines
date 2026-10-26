'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = name => fs.readFileSync(path.resolve(__dirname, '../..', name), 'utf8');

test('Pagos consulta estados pendientes sin recargar y reconsulta adeudos reales', () => {
  const js = read('docs/assets/js/pagos.js');
  assert.match(js, /setInterval\(syncPendingReceipts,10000\)/);
  assert.match(js, /receiptItems\.some\(p => p\.estatus === 'PENDIENTE_VALIDACION'\)/);
  assert.match(js, /cache: 'no-store'/);
  assert.match(js, /Promise\.allSettled\(\[loadValidity\(\), loadDebts\(\), loadExtras\(\)\]\)/);
  assert.match(js, /renderReceiptStatus\(actual\)/);
  assert.match(js, /visibilitychange/);
});

test('Pagos avisa al sidebar del iframe sin afirmar saldo cero', () => {
  const js = read('docs/assets/js/pagos.js');
  const sidebar = read('docs/assets/js/site-sidebar.js');
  assert.match(js, /MJ_PAGOS_CAMBIOS/);
  assert.match(sidebar, /event\.origin !== location\.origin/);
  assert.match(sidebar, /event\.source === activeFrame\?\.contentWindow/);
  assert.match(sidebar, /refreshPaymentNotices\(aside\)/);
  assert.match(sidebar, /setInterval\(\(\) => \{ if \(page\(\) === 'pagos.html'\) refresh\(\); \}, 15000\)/);
  assert.match(sidebar, /result\.data\.cantidad\|\|0/);
  assert.match(sidebar, /link\?\.querySelector\('\.mj-side-count'\)\?\.remove\(\)/);
});
