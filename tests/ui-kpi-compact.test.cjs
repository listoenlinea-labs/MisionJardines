'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const base = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(base, p), 'utf8');

test('Las métricas mantienen etiquetas y valores originales', () => {
  const pages = [
    ['docs/bases_datos.html',['metricResidents','metricHomes','metricPhones','metricEmails']],
    ['docs/reportes.html',['metricOpen','metricProcess','metricResolved','metricHigh']],
    ['docs/seguridad.html',['metricInside','metricToday','metricPackages','metricIncidents']],
    ['docs/visitas.html',['metricTotal','metricScheduled','metricInside','metricDone']],
    ['docs/cuotas.html',['metricCasas','metricPagadas','metricPendientes','metricIngresos']],
    ['docs/calendario.html',['metricEventos','metricMantenimiento','metricAsambleas','metricProximo']],
    ['docs/zkteco.html',['mHouses','mEnabled','mBlocked']]
  ];
  for (const [file, ids] of pages) for (const id of ids) {
    assert.ok(read(file).includes('id="' + id + '"'), file + ': ' + id);
  }
  const home = read('docs/assets/js/home-dashboard.js');
  for (const label of ['Cuotas al corriente','Visitas hoy','Accesos activos','Residentes activos']) {
    assert.ok(home.includes(label), label);
  }
  assert.doesNotThrow(() => new Function(home));
});

test('CSS oculta solo subtítulos de KPI y distribuye nombre/valor horizontalmente', () => {
  const css = read('docs/assets/css/kpi-compact.css');
  for (const selector of [
    '.hl-kpi-content>small',
    '.metric>div:not(.metric-icon)>span',
    '.cuotas-metric-content>span',
    '.grid>.metric>.hint',
    '.receipt-summary-card',
    '.hl-report-kpi>.hl-kpi-content',
    '.cuotas-metric>.cuotas-metric-content'
  ]) assert.ok(css.includes(selector), 'Falta selector ' + selector);
  assert.match(css, /justify-content:space-between!important/);
  assert.match(css, /min-height:58px!important/);
  assert.doesNotMatch(css, /body\s+small\s*\{\s*display:none/);
  assert.doesNotMatch(css, /\.status[^,{]*\{[^}]*display:none/);
  assert.doesNotMatch(css, /\.quick-card[^,{]*\{[^}]*display:none/);
  let balance=0;
  for(const ch of css)balance+=ch==='{'?1:ch==='}'?-1:0;
  assert.equal(balance,0);
});

test('Directorio reaparece inmediatamente con filtros y contactos', () => {
  const html = read('docs/directorio.html');
  const css = read('docs/assets/css/kpi-compact.css');
  assert.match(html, /<header class="directory-hero">/);
  assert.doesNotMatch(html, /<header class="hero directory-hero">/);
  assert.match(html, /id="searchInput"/);
  assert.match(html, /id="categoryFilter"/);
  assert.match(html, /id="boardGrid"/);
  assert.match(html, /id="directoryGrid"/);
  assert.match(html, /renderBoard\(\);\s*renderDirectory\(\);/);
  assert.match(css, /\.directory-page>\.directory-hero/);
  assert.match(css, /min-height:0!important;height:auto!important/);
});

test('Todas las vistas operativas cargan el CSS compartido renovado', () => {
  const pages = [
    'index','cuotas','analisis-cuotas','pagos','casa-club','bases_datos',
    'mapa','conmutador','seguridad','visitas','zkteco','reportes',
    'calendario','directorio','anuncios','cuenta','viviendas','verificacion-cuentas','reporte'
  ];
  for (const p of pages) {
    // El cache-buster cambia con cada despliegue; se verifica el script real.
    assert.match(read('docs/'+p+'.html'), /assets\/js\/site-sidebar\.js\?v=[^"']+/,p);
  }
  const sidebar = read('docs/assets/js/site-sidebar.js');
  assert.match(sidebar, /assets\/css\/kpi-compact\.css\?v=20261011-kpis/);
  assert.doesNotThrow(()=>new Function(sidebar));
});
