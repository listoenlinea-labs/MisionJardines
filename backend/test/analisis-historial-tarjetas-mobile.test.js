'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = relative => fs.readFileSync(path.resolve(__dirname, '../../', relative), 'utf8');

test('las cuatro tarjetas mantienen el orden de lectura del historial', () => {
  const js = read('docs/assets/js/analisis-cuotas.js');
  const start = js.indexOf("$('houseHistorySummary').innerHTML=");
  assert.ok(start >= 0, 'Existe el render del resumen');
  const end = js.indexOf(';', start);
  const render = js.slice(start, end);
  const labels = [
    'Último pago registrado',
    'Total en movimientos',
    'Saldo pendiente actual',
    'Saldo a favor'
  ];
  let position = -1;
  for (const label of labels) {
    const next = render.indexOf(label);
    assert.ok(next > position, label + ' aparece después de la tarjeta anterior');
    position = next;
  }
  assert.equal((render.match(/class="history-stat(?: debt| credit)?"/g) || []).length, 4);
});

test('en móvil las cuatro tarjetas forman 2 columnas y ninguna ocupa la fila completa', () => {
  const css = read('docs/assets/css/analisis-cuotas.css');
  const mobileRule = css.match(/@media\(max-width:580px\)\{[^\n]+/)?.[0] || '';
  assert.ok(mobileRule, 'Existe la regla móvil del historial');
  assert.match(mobileRule, /\.history-summary\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\);grid-auto-rows:1fr\}/);
  assert.match(mobileRule, /\.history-summary \.history-stat\{min-width:0;padding:12px;justify-content:space-between\}/);
  assert.match(mobileRule, /\.history-summary \.history-stat\.debt\{grid-column:auto\}/);
  assert.doesNotMatch(mobileRule, /\.history-stat\.debt\{grid-column:1\/-1\}/);
});

test('el cambio de CSS móvil se sirve sin caché antigua', () => {
  const html = read('docs/analisis-cuotas.html');
  assert.match(html, /analisis-cuotas\.css\?v=20261029-historial-grid-2x2/);
});
