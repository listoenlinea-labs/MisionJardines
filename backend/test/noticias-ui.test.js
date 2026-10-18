'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('Inicio muestra primero Noticias, carga los datos y mantiene Tráfico a la derecha', () => {
  const js = fs.readFileSync(path.resolve(__dirname, '../../docs/assets/js/home-dashboard.js'), 'utf8');
  const start = js.indexOf('function renderEnvironmentMarkup()');
  const markup = js.slice(start, js.indexOf('function operationalHour(', start));
  assert.ok(start >= 0);
  assert.ok(markup.indexOf('data-hl-environment="news"') < markup.indexOf('data-hl-environment="traffic"'));
  assert.match(markup, /hl-environment-scene is-news-view/);
  assert.match(markup, /hl-environment-flipper is-flipped/);
  const initializer = js.slice(js.indexOf('async function initEnvironmentCard()'), start);
  assert.match(initializer, /homeNewsLoaded = true;\s*loadLocalNews\(\);/);
  assert.match(markup, /<h3 class="hl-news-title">|id="hlNewsGrid"/);
  assert.match(js, /hl-news-title\{[^}]*font-weight:500/);
});

test('Noticias usa tres columnas en celular y dos en pantallas muy estrechas', () => {
  const js = fs.readFileSync(path.resolve(__dirname, '../../docs/assets/js/home-dashboard.js'), 'utf8');
  const mobile = js.slice(js.indexOf('/* Tarjetas de noticias compactas en móvil'));
  assert.match(mobile, /@media\(max-width:720px\)\{[\s\S]*?\.hl-news-grid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);
  assert.match(mobile, /@media\(max-width:360px\)\{[\s\S]*?\.hl-news-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(mobile, /\.hl-news-item\{[^}]*overflow-wrap:anywhere/);
  assert.match(mobile, /\.hl-news-item \.hl-news-title\{[^}]*-webkit-line-clamp:5/);
  assert.match(mobile, /\.hl-news-grid>\.hl-live-empty\{grid-column:1\/-1/);
});
