'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const load = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('Inicio tiene cuatro tarjetas con diseño de Reportes', () => {
  const js = load('docs/assets/js/home-dashboard.js');
  const cards = js.slice(
    js.indexOf('<section class="hl-kpis" aria-label='),
    js.indexOf('</section>', js.indexOf('<section class="hl-kpis" aria-label='))
  );
  for (const [title, tone] of [
    ['Cuotas al corriente', 'blue'], ['Visitas hoy', 'mint'],
    ['Accesos activos', 'peach'], ['Residentes activos', 'lilac']
  ]) {
    assert.match(cards, new RegExp('hl-report-kpi hl-kpi-tone-' + tone));
    assert.ok(cards.includes(title), 'Falta el indicador ' + title);
  }
  assert.equal((cards.match(/<article class="hl-card hl-kpi hl-report-kpi/g) || []).length, 4);
  assert.doesNotMatch(cards, /hl-kpi-foot|hl-source|sourceBadge\(/);
  assert.match(cards, /fuentes\.cuotas/);
  assert.match(cards, /fuentes\.visitas/);
  assert.match(cards, /fuentes\.accesos/);
  assert.match(cards, /fuentes\.residentes/);
  assert.doesNotThrow(() => new Function(js));
});

test('Solo Inicio usa tarjetas sin iconos, sin alterar Reportes', () => {
  const css = load('docs/assets/css/ui-unificada.css');
  assert.match(css, /body\.mj-home\.mj-shared-sidebar-enabled \.dashboard \.hl-kpis>\.hl-report-kpi/);
  assert.match(css, /\.hl-report-kpi>\.hl-kpi-content/);
  const js = load('docs/assets/js/home-dashboard.js');
  const start = js.indexOf('<section class="hl-kpis"');
  const cards = js.slice(start, js.indexOf('</section>', start));
  assert.equal((cards.match(/class="hl-kpi-content"/g) || []).length, 4);
  assert.doesNotMatch(cards, /hl-kpi-icon/);
  assert.match(css, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(css, /@media\(max-width:420px\)/);
  let braces = 0;
  for (const token of css) braces += token === '{' ? 1 : token === '}' ? -1 : 0;
  assert.equal(braces, 0);
});

test('Versiones nuevas evitan ver tarjetas viejas por caché', () => {
  const sidebar = load('docs/assets/js/site-sidebar.js');
  const index = load('docs/index.html');
  assert.match(index, /site-sidebar\.js\?v=20261011-sin-conexion/);
  assert.match(sidebar, /home-dashboard\.js\?v=20261011-sin-iconos/);
  assert.match(sidebar, /ui-unificada\.css\?v=20261011-sin-iconos/);
  assert.doesNotThrow(() => new Function(sidebar));
});
