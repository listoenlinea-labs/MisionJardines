'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../docs/assets/js/home-dashboard.js'), 'utf8');
const snippet = source.slice(source.indexOf('function chartSvg('), source.indexOf('function financeSummary('));
const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct'];
const series = months.map((month, index) => ({
  etiqueta: month + ' 2026',
  ingresos: 60000 + index * 100,
  egresos: 59000 - index * 500,
  disponible: -22000 + index * 3000
}));

function chart(mobile, width = 350, filter = 'todas', index = 9) {
  const context = {
    window: { matchMedia: query => ({ matches: mobile && query === '(max-width: 720px)' }) },
    money: new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }),
    escapeHtml: value => String(value ?? ''),
    compactMoney: value => '$' + Math.round(Number(value) / 1000) + 'k'
  };
  vm.runInNewContext(snippet + '\nthis.render = chartSvg;', context);
  return context.render(series, filter, width, index);
}

test('Móvil: las curvas ocupan el rectángulo completo, pero los textos no se estiran', () => {
  for (const width of [230, 260, 310, 350, 390, 430, 620]) {
    const html = chart(true, width);
    assert.ok(html.includes('viewBox="0 0 ' + width + ' 270"'));
    assert.match(html, /preserveAspectRatio="none"/);
    assert.match(html, /class="hl-chart-mobile-overlay"/);
    assert.equal((html.match(/class="hl-chart-axis-x"/g) || []).length, months.length);
    assert.equal((html.match(/class="hl-chart-axis-y"/g) || []).length, 4);
    assert.equal((html.match(/class="hl-chart-hit hl-chart-mobile-point"/g) || []).length, 30);
    assert.doesNotMatch(html, /<svg[^>]*>[\s\S]*?<text\b/);
    assert.doesNotMatch(html, /<circle\b/);
    for (const month of months) {
      assert.match(html, new RegExp('>' + month + '<\\/span>'));
    }
    const first = (43 / width * 100).toFixed(4);
    const last = ((width - 16) / width * 100).toFixed(4);
    assert.ok(html.includes('left:' + first + '%'));
    assert.ok(html.includes('left:' + last + '%'));
  }
});

test('Móvil: marcadores HTML son botones accesibles, redondos y seleccionables', () => {
  const html = chart(true, 310);
  assert.match(html, /<button type="button" class="hl-chart-hit hl-chart-mobile-point"/);
  assert.match(html, /data-index="9" data-series="disponible"/);
  assert.match(html, /aria-label="Oct 2026 · Ingresos:/);
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /<option value="9" selected>Oct 2026<\/option>/);
  assert.equal((html.match(/<option value=/g) || []).length, 10);
  for (const key of ['ingresos', 'egresos', 'disponible']) {
    const only = chart(true, 310, key);
    assert.equal((only.match(/class="hl-chart-hit hl-chart-mobile-point"/g) || []).length, 10);
    assert.match(only, new RegExp('data-index="9" data-series="' + key + '"'));
  }
  assert.match(source, /\.hl-chart-mobile-point::before\{/);
  assert.match(source, /\.hl-chart-mobile-point\.is-selected::after/);
  assert.match(source, /width:32px;height:32px/);
  assert.match(source, /touch-action:manipulation/);
});

test('Ejes móviles: etiquetas reales sin SVG y negativos con formato claro', () => {
  const html = chart(true, 350);
  assert.match(html, /class="hl-chart-axis-y"[^>]*>-\$\d+k<\/span>/);
  assert.match(html, /class="hl-chart-axis-x"[^>]*>Ene<\/span>/);
  assert.match(html, /class="hl-chart-axis-x"[^>]*>Oct<\/span>/);
  assert.doesNotMatch(html, /class="hl-chart-axis-x"[^>]*>Oct 2026<\/span>/);
  assert.match(source, /\.hl-chart-axis-y,\.hl-chart-axis-x\{position:absolute/);
  assert.match(source, /\.hl-chart-axis-x\{transform:translate\(-50%,-50%\);font-size:10px\}/);
  assert.match(source, /\.hl-chart\{width:100%!important;height:270px!important/);
  assert.match(source, /\.hl-chart\{width:100%;min-width:0;max-width:100%;height:270px\}/);
});

test('Escritorio: conserva tipografía y círculos SVG anteriores', () => {
  for (const width of [680, 850, 1040, 1320]) {
    const html = chart(false, width);
    assert.ok(html.includes('viewBox="0 0 ' + width + ' 310"'));
    assert.match(html, /preserveAspectRatio="xMidYMid meet"/);
    assert.doesNotMatch(html, /class="hl-chart-mobile-overlay"/);
    assert.equal((html.match(/<circle class="hl-chart-hit"/g) || []).length, 30);
    assert.match(html, />Ene 2026<\/text>/);
    assert.match(html, />Oct 2026<\/text>/);
  }
  assert.match(source, /\.hl-chart-mobile-overlay\{display:none\}/);
  assert.match(source, /\.hl-chart\{width:100%;height:310px/);
});

test('Interacciones y re-render siguen usando meses, filtros, resúmenes y ResizeObserver', () => {
  assert.match(source, /chartWrap\.querySelectorAll\('\.hl-chart-hit'\)/);
  assert.match(source, /chartWrap\.addEventListener\('change'/);
  assert.match(source, /const monthSelector = chartWrap\.querySelector\('\[data-hl-finance-month\]'\)/);
  assert.match(source, /details\.innerHTML = financeSummary\(series, selectedIndex\)/);
  assert.match(source, /mobileMedia\.addEventListener\('change', redrawChart\)/);
  assert.match(source, /resizeObserver\?\.observe\(chartWrap\)/);
  assert.doesNotThrow(() => new Function(source));
  assert.doesNotMatch(source, /min-width:600px/);
});
