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

test('En Safari móvil no se pinta el reverso de Tráfico sobre Noticias', () => {
  const js = fs.readFileSync(path.resolve(__dirname, '../../docs/assets/js/home-dashboard.js'), 'utf8');
  const mobile = js.slice(js.indexOf('/* Tarjetas de noticias compactas en móvil'));
  assert.match(mobile, /@media\(max-width:720px\)\{/);
  assert.match(mobile, /\.hl-environment-flipper\.is-flipped\{transform:none;transform-style:flat/);
  assert.match(mobile, /\.hl-environment-scene \.hl-news-face\{transform:none;backface-visibility:visible/);
  assert.match(mobile, /\.hl-environment-scene\.is-news-view \.hl-traffic-face,[\s\S]*?\{opacity:0;visibility:hidden;pointer-events:none\}/);
  assert.match(mobile, /\.hl-environment-scene:not\(\.is-news-view\) \.hl-traffic-face\{opacity:1;visibility:visible;pointer-events:auto\}/);
  assert.match(mobile, /\.hl-environment-scene\.is-news-view \.hl-traffic-status\{display:none\}/);
  assert.match(js, /\.hl-environment-flipper\.is-flipped\{transform:rotateY\(180deg\)\}/);
});

test('Noticias móvil permite llegar a todas las filas sin recortar la última', () => {
  const js = fs.readFileSync(path.resolve(__dirname, '../../docs/assets/js/home-dashboard.js'), 'utf8');
  const mobile = js.slice(js.indexOf('/* Tarjetas de noticias compactas en móvil'));
  assert.match(mobile, /\.hl-environment-scene\.is-news-view,[\s\S]*?\.hl-op-map \.hl-environment-scene\.is-news-view\{height:auto;overflow:visible\}/);
  assert.match(mobile, /\.hl-environment-scene\.is-news-view \.hl-environment-flipper\{height:auto\}/);
  assert.match(mobile, /\.hl-environment-scene\.is-news-view \.hl-news-face\{position:relative;inset:auto\}/);
  assert.match(mobile, /\.hl-news-grid\{grid-template-columns:repeat\(3,minmax\(0,1fr\)\);[^}]*max-height:none;overflow:visible/);
  assert.match(js, /\.hl-traffic-face\{grid-template-columns:1fr;grid-template-rows:340px 260px\}/);
});

test('Noticias prioriza la foto real y usa una ilustración local identificada si falta o falla', () => {
  const js = fs.readFileSync(path.resolve(__dirname, '../../docs/assets/js/home-dashboard.js'), 'utf8');
  const svg = fs.readFileSync(path.resolve(__dirname, '../../docs/assets/images/noticia-ilustrativa.svg'), 'utf8');
  const start = js.indexOf('async function loadLocalNews(');
  const view = js.slice(start, js.indexOf('async function initEnvironmentCard()', start));
  assert.match(view, /safeNewsPhotoUrl\(item\.imageUrl\)/);
  assert.match(view, /const photo = direct \|\| proxy \|\| illustration;/);
  assert.match(view, /assets\/images\/noticia-ilustrativa\.svg/);
  assert.match(view, /has-image\$\{illustrated/);
  assert.match(view, /loading="lazy" decoding="async"/);
  assert.match(view, /data-news-fallback/);
  assert.match(view, /image\.src = fallback/);
  assert.match(view, /referrerpolicy="no-referrer"/);
  assert.match(view, /image\.addEventListener\('error'/);
  assert.match(view, /image\.src = 'assets\/images\/noticia-ilustrativa\.svg'/);
  assert.match(view, /hl-news-illustration-note/);
  assert.match(svg, /no representa una noticia real/);
  assert.doesNotMatch(view, /unsplash|picsum|source\.unsplash/i);
});

test('Las fotos ocupan el fondo de la tarjeta con título legible, sin crecer en móvil', () => {
  const js = fs.readFileSync(path.resolve(__dirname, '../../docs/assets/js/home-dashboard.js'), 'utf8');
  assert.match(js, /\.hl-news-item\{height:143px;min-height:143px/);
  assert.match(js, /\.hl-news-grid \.hl-news-item\.has-image\{[^}]*position:relative;isolation:isolate;overflow:hidden/);
  assert.match(js, /\.hl-news-photo\{[^}]*position:absolute;inset:0;z-index:0;[^}]*width:100%;height:100%;object-fit:cover/);
  assert.match(js, /\.hl-news-item\.has-image::before\{[^}]*linear-gradient/);
  assert.match(js, /\.hl-news-item\.has-image \.hl-news-title\{color:#fff;[^}]*text-shadow/);
  assert.match(js, /\.hl-news-item\.has-image \.hl-news-meta\{color:#f3f6fb/);
  assert.doesNotMatch(js, /\.hl-news-item\.has-image \.hl-news-main\{display:grid;grid-template-columns:72px/);
  const mobile = js.slice(js.indexOf('/* Tarjetas de noticias compactas en móvil'));
  assert.match(mobile, /\.hl-news-item\{[^}]*height:158px;min-height:158px/);
  assert.match(mobile, /\.hl-news-item\.has-image \.hl-news-title\{[^}]*-webkit-line-clamp:4/);
});
