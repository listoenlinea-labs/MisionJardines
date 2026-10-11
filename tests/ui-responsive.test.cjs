'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');

test('All authenticated operational views load the shared sidebar', () => {
  const pages = [
    'index', 'cuotas', 'analisis-cuotas', 'pagos', 'casa-club', 'bases_datos',
    'mapa', 'conmutador', 'seguridad', 'visitas', 'zkteco', 'reportes',
    'calendario', 'directorio', 'anuncios', 'cuenta',
    'viviendas', 'verificacion-cuentas'
  ];
  for (const name of pages) {
    assert.match(read('docs/' + name + '.html'), /assets\/js\/site-sidebar\.js/, name);
  }
});

test('The shared UI theme is loaded and offers mobile layouts', () => {
  const sidebar = read('docs/assets/js/site-sidebar.js');
  const style = read('docs/assets/css/product-ui.css');
  assert.match(sidebar, /assets\/css\/product-ui\.css/);
  assert.match(style, /@media\(max-width:820px\)/);
  assert.match(style, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(style, /overscroll-behavior-x:contain/);
  assert.match(style, /\.analysis-hero/);
  assert.match(style, /\.cuotas-hero/);
});

test('Public account flows use the responsive product layer', () => {
  for (const name of ['login', 'registro', 'invitacion']) {
    assert.match(read('docs/' + name + '.html'), /assets\/css\/product-ui\.css/, name);
  }
});

test('Mobile drawer can be dismissed and offscreen links are inert', () => {
  const sidebar = read('docs/assets/js/site-sidebar.js');
  assert.match(sidebar, /\.mj-mobile-scrim/);
  assert.match(sidebar, /sidebar\.inert=collapsed/);
  assert.match(sidebar, /scrim\.addEventListener\('click'/);
  assert.match(sidebar, /<details class="mj-side-support">/);
});

test('Finance view keeps all metrics available and paginates residences', () => {
  const html = read('docs/analisis-cuotas.html');
  const js = read('docs/assets/js/analisis-cuotas.js');
  assert.match(html, /id="financialSecondary"/);
  assert.match(html, /id="financePrev"/);
  assert.match(html, /id="financeNext"/);
  assert.match(js, /HOUSE_PAGE_SIZE=12/);
  assert.match(js, /financialCards\.slice\(0,4\)/);
  assert.match(js, /financialCards\.slice\(4\)/);
  assert.match(js, /data\.casaClub\?\.garantiasDevueltas/);
  assert.match(js, /financeHouseRows/);
  assert.match(js, /data-label="Residente"/);
});

test('Modified scripts have valid JavaScript syntax', () => {
  for (const file of ['docs/assets/js/site-sidebar.js', 'docs/assets/js/analisis-cuotas.js']) {
    assert.doesNotThrow(() => new Function(read(file)), file);
  }
});
