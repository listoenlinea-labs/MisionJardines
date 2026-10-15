'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = p => fs.readFileSync(path.resolve(__dirname, '../../' + p), 'utf8');
const html = read('docs/analisis-cuotas.html');
const sidebar = read('docs/assets/js/site-sidebar.js');
const css = read('docs/assets/css/analisis-cuotas.css');

function getNavigation(roleName = 'ADMINISTRADOR') {
 const start = sidebar.indexOf('  const groups = [');
 const end = sidebar.indexOf('  const page = () =>', start);
 assert.ok(start >= 0 && end > start, 'Navegación localizada');
 const extracted = sidebar.slice(start, end);
 const publicPages = new Set(['casa-club.html', 'pagos.html', 'anuncios.html', 'calendario.html', 'directorio.html']);
 return new Function('MJPermissions', 'role',
    extracted + '\nreturn navigationGroups();')({
      canAccess: (role, page) => role === 'CONDOMINO' && publicPages.has(page)
    }, () => roleName);
}

test('Las pestañas se conservan como enlaces en el DOM, pero están ocultas', () => {
 const tabs = html.match(/<nav class="analysis-tabs"[^>]*>[\s\S]*?<\/nav>/);
 assert.ok(tabs, 'Se conserva nav de pestañas para posibles usos futuros');
 assert.match(tabs[0], /\bhidden\b/);
 assert.match(tabs[0], /href="cuotas\.html"/);
 assert.match(tabs[0], /href="analisis-cuotas\.html"/);
 assert.match(css, /body\.page-analisis\.mj-shared-sidebar-enabled \.analysis-page nav\.analysis-tabs\[hidden\]/);
 assert.match(css, /display:none!important/);
 assert.match(css, /height:0!important/);
});

test('Los controles de Análisis aparecen directamente tras el encabezado', () => {
 const header = html.indexOf('</header>');
 const tabs = html.indexOf('<nav class="analysis-tabs"', header);
 const filters = html.indexOf('<section class="analysis-card filters">', tabs);
 assert.ok(header >= 0 && tabs > header && filters > tabs);
 assert.match(html, /id="financeYear"/);
 assert.match(html, /id="financeMonth"/);
 assert.match(html, /id="updateFinance"/);
});

test('Comunidad muestra exactamente los cinco enlaces en el orden solicitado', () => {
 const group = getNavigation().find(g => g.label === 'Comunidad');
 assert.deepEqual(group.items.map(item => item.page), [
  'pagos.html', 'casa-club.html', 'anuncios.html', 'calendario.html', 'directorio.html'
 ]);
 assert.deepEqual(group.items.map(item => item.label), [
  'Pagos', 'Casa Club', 'Anuncios', 'Calendario', 'Directorio'
 ]);
});

test('Administración y Seguridad conservan su orden y permisos', () => {
 const groups = getNavigation();
 const admin = groups.find(g => g.label === 'Administración').items;
 assert.deepEqual(admin.slice(0,5).map(x => x.page), [
  'analisis-cuotas.html', 'zkteco.html', 'bases_datos.html',
  'verificacion-cuentas.html', 'auto-users.html'
 ]);
 assert.deepEqual(groups.find(g => g.label === 'Seguridad').items.map(x => x.page),
  ['conmutador.html', 'seguridad.html', 'visitas.html', 'mapa.html', 'reportes.html']);
 assert.deepEqual(getNavigation('SEGURIDAD').map(x => x.label), ['Seguridad']);
 assert.match(sidebar, /MJPermissions\.canAccess\(r,item\.page\)/);
});

test('Cuotas sigue oculto solo del lateral; la página y enlaces siguen intactos', () => {
 assert.match(sidebar, /\{ page: 'cuotas\.html', label: 'Cuotas'/);
 assert.match(sidebar, /if \(item\.page === 'cuotas\.html'\) continue/);
 assert.equal(getNavigation().flatMap(g => g.items).some(item => item.page === 'cuotas.html'), false);
 assert.match(html, /href="cuotas\.html"/);
});

test('La versión del menú compartido se actualiza al navegar entre páginas', () => {
 const pages = [
  'analisis-cuotas.html','index.html','pagos.html','casa-club.html',
  'anuncios.html','calendario.html','directorio.html','zkteco.html',
  'bases_datos.html','cuotas.html','auto-users.html','verificacion-cuentas.html',
  'mapa.html','reportes.html','seguridad.html','visitas.html','viviendas.html',
  'cuenta.html','conmutador.html','reporte.html'
 ];
 for (const filename of pages) {
  const pageHtml = read('docs/' + filename);
  assert.match(pageHtml, /site-sidebar\.js\?v=20261015-comunidad-orden/,
    filename+' debe cargar la versión nueva del menú');
 }
 assert.match(html, /analisis-cuotas\.css\?v=20261015-sin-tabs/);
});
