'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../docs/assets/js/home-dashboard.js'), 'utf8');
const extract = source.slice(source.indexOf('function chartSvg('), source.indexOf('function financeSummary('));
const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct'];
const series = months.map((mes, i) => ({
  etiqueta: mes + ' 2026',
  ingresos: 60000 + i * 100,
  egresos: 59000 - i * 500,
  disponible: 1000 + i * 600
}));

function renderChart(mobile, filter, width = 310) {
  const context = {
    window: { matchMedia: query => ({ matches: mobile && query === '(max-width: 720px)' }) },
    money: new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }),
    escapeHtml: value => String(value ?? ''),
    compactMoney: value => '$' + Math.round(Number(value) / 1000) + 'k'
  };
  vm.runInNewContext(extract + '\nthis.chartSvg = chartSvg;', context);
  return context.chartSvg(series, filter, width);
}

test('Mobile SVG contiene los diez meses y las tres líneas sin ancho forzado', () => {
  const html = renderChart(true, 'todas');
  assert.match(html, /viewBox="0 0 310 322"/);
  for (const mes of months) assert.ok(html.includes('>' + mes + '</text>'), 'Falta ' + mes);
  assert.match(html, /<span>2026<\/span>/);
  assert.equal((html.match(/class="hl-chart-hit"/g) || []).length, 30);
  assert.ok(html.includes('aria-label="Oct 2026 · Ingresos:'));
  assert.doesNotMatch(html, />Oct 2026<\/text>/, 'El eje móvil debe utilizar meses abreviados');
  assert.match(html, /data-index="9" data-series="disponible"/);
});

test('Filtrar una serie mantiene todos los meses visibles en móvil', () => {
  for (const type of ['ingresos', 'egresos', 'disponible']) {
    const html = renderChart(true, type);
    assert.equal((html.match(/class="hl-chart-hit"/g) || []).length, 10);
    assert.match(html, new RegExp('data-index="9" data-series="' + type + '"'));
  }
});

test('Escritorio conserva el SVG ancho y las etiquetas completas', () => {
  const html = renderChart(false, 'todas');
  assert.match(html, /viewBox="0 0 850 310"/);
  assert.match(html, />Ene 2026<\/text>/);
  assert.equal((html.match(/class="hl-chart-hit"/g) || []).length, 30);
});

test('CSS móvil elimina scroll horizontal y redibuja al girar el teléfono', () => {
  assert.doesNotMatch(source, /\.hl-chart\{min-width:600px\}/);
  assert.doesNotMatch(source, /\.hl-finance-plot\{min-width:600px\}/);
  assert.match(source, /\.hl-chart-wrap\{overflow-x:hidden/);
  assert.match(source, /\.hl-chart\{width:100%;min-width:0;max-width:100%;height:322px\}/);
  assert.match(source, /mobileMedia\.addEventListener\('change', redrawChart\)/);
  assert.match(source, /removeFinanceMediaListener\(\)/);
  assert.doesNotThrow(() => new Function(source));
});

test('El tamaño visual se adapta al ancho disponible sin empequeñecer los ejes', () => {
  for (const width of [235, 260, 310, 355, 620]) {
    const html = renderChart(true, 'todas', width);
    assert.ok(html.includes('viewBox="0 0 ' + width + ' 322"'), 'Ancho incorrecto: ' + width);
    assert.equal((html.match(/class="hl-chart-hit"/g) || []).length, 30);
    for (const month of months) assert.ok(html.includes('>' + month + '</text>'));
    assert.doesNotMatch(html, /<polygon/, 'Los rellenos no deben tapar la serie opuesta en móvil');
  }
  const ingresos = renderChart(true, 'ingresos', 260);
  assert.match(ingresos, /<polygon/);
  assert.match(source, /const tickCount = compact \? 4 : 5/);
  assert.match(source, /chartWrap\.clientWidth - padLeft - padRight - 2/);
  assert.match(source, /resizeObserver\?\.observe\(chartWrap\)/);
  assert.match(source, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(source, /hl-chart-mobile-heading/);
  assert.match(source, /height:322px!important/);
});


test('El gráfico usa todo el ancho real del dashboard con la barra lateral abierta o cerrada', () => {
  for (const width of [680, 850, 1040, 1320]) {
    const html = renderChart(false, 'todas', width);
    assert.ok(html.includes('viewBox="0 0 ' + width + ' 310"'));
    const first = html.match(/data-index="0" data-series="ingresos" cx="([^"]+)"/);
    const last = html.match(/data-index="9" data-series="ingresos" cx="([^"]+)"/);
    assert.ok(first && last, 'Faltan puntos de Inicio o del mes actual');
    assert.equal(Number(first[1]), 58, 'Margen útil izquierdo fijo para las etiquetas');
    assert.equal(Number(last[1]), width - 16, 'El último mes debe llegar al borde derecho de la gráfica');
  }
  assert.match(source, /chartWrap\.clientWidth - padLeft - padRight - 2/);
  assert.match(source, /const width = Math\.max\(compact \? 220 : 420/);
  assert.match(source, /Math\.abs\(nextWidth - lastChartWidth\) >= 2/);
  assert.match(source, /resizeObserver\?\.observe\(chartWrap\)/);
});

test('Los puntos en teléfonos tienen una zona táctil más grande y muestran la selección', () => {
  const html = renderChart(true, 'todas', 285);
  assert.match(html, /r="19" fill="transparent"/);
  assert.match(html, /data-index="9" data-series="disponible"/);
  assert.match(source, /touchLayout \? 29 : 21/);
  assert.match(source, /showTooltip\(hit\)/);
  assert.match(source, /\.hl-chart-hit\.is-selected/);
});
