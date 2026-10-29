'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = file => fs.readFileSync(path.resolve(__dirname, '../../', file), 'utf8');

test('Análisis conserva acciones y distingue sin pagos en la columna Pagado', () => {
  const js = read('docs/assets/js/analisis-cuotas.js');
  assert.match(js, /h\.ultimoPago\?\.monto\|\|0\)>0\?fmt\(h\.ultimoPago\.monto\):'Sin pagos'/);
  assert.match(js, /data-paid-history/);
  assert.match(js, /houseCell\('Pago',renderHousePayCell\(h\)\)/);
});

test('Los pendientes tienen fila rosa pastel y saldo resaltado sin ocultar selección', () => {
  const js = read('docs/assets/js/analisis-cuotas.js');
  const css = read('docs/assets/css/analisis-cuotas.css');
  assert.match(js, /house-row-overdue/);
  assert.match(js, /\.toUpperCase\(\)==='PENDIENTE'&&Number\(h\.saldoPendiente\)>0/);
  assert.match(js, /house-amount.*is-overdue/);
  assert.match(css, /tr\.house-row-overdue>td/);
  assert.match(css, /\.house-amount\.is-overdue/);
  assert.match(css, /house-row-overdue\.house-receipt-selected/);
});

test('La página utiliza los estilos y scripts actualizados para evitar caché antigua', () => {
  const html = read('docs/analisis-cuotas.html');
  assert.match(html, /analisis-cuotas\.css\?v=20261029-recibos-adeudos/);
  assert.match(html, /analisis-cuotas\.js\?v=20261029-recibos-adeudos/);
});
