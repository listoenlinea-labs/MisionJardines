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
