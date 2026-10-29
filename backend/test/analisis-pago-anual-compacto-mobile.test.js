'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = relative => fs.readFileSync(path.resolve(__dirname, '../../', relative), 'utf8');

test('Pago anual conserva botón, ayuda completa y control funcional', () => {
  const html = read('docs/analisis-cuotas.html');
  const js = read('docs/assets/js/analisis-cuotas.js');
  assert.match(html, /class="house-annual-option" data-maintenance-only/);
  assert.match(html, /id="housePaymentAnnual"/);
  assert.match(html, /id="houseAnnualHint"/);
  assert.match(js, /\$\('housePaymentAnnual'\)\.addEventListener\('click'/);
});

test('Pago anual en móvil no reserva 230 px de alto para el texto de ayuda', () => {
  const css = read('docs/assets/css/analisis-cuotas.css');
  assert.match(css, /\.house-annual-option p\{flex:1 1 230px;/); // distribución de escritorio
  const rule = css.match(/@media\(max-width:640px\)\{\s*\.house-annual-option\{[\s\S]*?\n\}/)?.[0] || '';
  assert.ok(rule, 'Existe una regla móvil específica para Pago anual');
  assert.match(rule, /flex-direction:column/);
  assert.match(rule, /height:auto/);
  assert.match(rule, /min-height:0/);
  assert.match(rule, /\.house-annual-option p\{flex:0 1 auto;min-height:0\}/);
  assert.match(rule, /\.house-annual-button\{width:100%\}/);
});

test('Análisis usa nueva versión del CSS para que el cambio móvil llegue a los dispositivos', () => {
  assert.match(read('docs/analisis-cuotas.html'),
    /analisis-cuotas\.css\?v=20261029-pago-anual-compacto/);
});
