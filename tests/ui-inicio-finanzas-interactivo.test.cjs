'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const dashboard = read('docs/assets/js/home-dashboard.js');
const sidebar = read('docs/assets/js/site-sidebar.js');
const controller = read('backend/src/controllers/dashboard.controller.js');

test('Dashboard financiero conserva sintaxis válida y expone datos existentes de MySQL', () => {
  assert.doesNotThrow(() => new Function(dashboard));
  for (const field of ['cuotas', 'ingresosAdicionales', 'saldoInicial', 'egresos', 'disponible']) {
    assert.match(controller, new RegExp('\\b' + field + '\\b'));
    assert.match(dashboard, new RegExp('\\b' + field + '\\b'));
  }
  assert.match(dashboard, /<h2>Ingresos, egresos y disponible<\/h2>/);
  assert.doesNotMatch(dashboard, /name: 'Total de recursos'/);
});

test('Filtros, áreas de interacción y tooltip superpuesto pertenecen al SVG financiero', () => {
  const start = dashboard.indexOf('function chartSvg(');
  const end = dashboard.indexOf('function financeSummary(', start);
  assert.ok(start >= 0 && end > start);
  const ctx = {
    money: new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }),
    escapeHtml: value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
    compactMoney: value => '$' + Math.round(Number(value) / 1000) + 'k'
  };
  vm.runInNewContext(dashboard.slice(start, end) + '\nthis.buildChart = chartSvg;', ctx);
  const rows = [
    { etiqueta: 'Sep 2026', ingresos: 61250, egresos: 56999, disponible: -12000 },
    { etiqueta: 'Oct 2026', ingresos: 56450, egresos: 5926, disponible: 28524 }
  ];
  const all = ctx.buildChart(rows);
  assert.match(all, /data-hl-finance-filter="todas"/);
  assert.match(all, /data-hl-finance-filter="ingresos"/);
  assert.match(all, /data-hl-finance-filter="egresos"/);
  assert.match(all, /data-hl-finance-filter="disponible"/);
  assert.equal((all.match(/class="hl-chart-hit"/g) || []).length, 6);
  assert.match(all, /pointer-events="none"/);
  assert.match(all, /data-index="1" data-series="disponible"/);
  assert.match(all, /role="status" aria-live="polite"/);
  assert.match(all, /Ingresos:.*56/);
  const onlyExpenses = ctx.buildChart(rows, 'egresos');
  assert.equal((onlyExpenses.match(/class="hl-chart-hit"/g) || []).length, 2);
  assert.doesNotMatch(onlyExpenses, /data-series="ingresos"/);
  assert.doesNotMatch(onlyExpenses, /data-series="disponible"/);
});

test('La tarjeta abre con el resumen y puede girar a Agenda con accesibilidad', () => {
  assert.match(dashboard, /hl-card-flipper/);
  assert.match(dashboard, /class="hl-flip-face hl-finance-face"/);
  assert.match(dashboard, /class="hl-flip-face hl-agenda-face" aria-label="Próximos eventos" aria-hidden="true" inert/);
  assert.match(dashboard, /setupFinancePanel\(data\)/);
  assert.match(dashboard, /front\.inert = agenda/);
  assert.match(dashboard, /back\.inert = !agenda/);
  assert.match(dashboard, /showFace\(false\)/);
  assert.match(dashboard, /Ver agenda ↻/);
  assert.match(dashboard, /Ver resumen ↻/);
  assert.match(dashboard, /event\.key === 'Enter'/);
  assert.match(dashboard, /event\.key === ' '/);
  assert.match(dashboard, /prefers-reduced-motion:reduce/);
  assert.match(sidebar, /home-dashboard\.js\?v=20261012-filtros-detalle-giro/);
});
