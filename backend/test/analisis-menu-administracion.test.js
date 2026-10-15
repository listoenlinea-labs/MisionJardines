'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const read = p => fs.readFileSync(path.resolve(__dirname, '../../'+p), 'utf8');
const html = read('docs/analisis-cuotas.html');
const sidebar = read('docs/assets/js/site-sidebar.js');

function navForRole(currentRole = 'ADMINISTRADOR') {
  const start = sidebar.indexOf('  const groups = [');
  const end = sidebar.indexOf('  const page = () =>', start);
  assert.ok(start !== -1 && end > start, 'Puede aislarse la definición de navegación');
  const definition = sidebar.slice(start, end);
  const publicPages = new Set([
    'casa-club.html', 'pagos.html', 'anuncios.html', 'calendario.html', 'directorio.html'
  ]);
  return new Function('MJPermissions', 'role',
    definition + '\nreturn navigationGroups();')({
      canAccess: (role, page) => role === 'CONDOMINO' && publicPages.has(page)
    }, () => currentRole);
}

test('Administración presenta los cinco enlaces en el orden solicitado', () => {
  const admin = navForRole().find(group => group.label === 'Administración');
  assert.ok(admin, 'Existe el grupo Administración');
  assert.deepEqual(admin.items.slice(0,5).map(item => item.page), [
    'analisis-cuotas.html', 'zkteco.html', 'bases_datos.html',
    'verificacion-cuentas.html', 'auto-users.html'
  ]);
  assert.deepEqual(admin.items.slice(0,5).map(item => item.label), [
    'Análisis de cuotas', 'ZKTeco', 'Residentes', 'Verificación de cuentas', 'Auto-users'
  ]);
});

test('Cuotas se oculta de navegación pero su definición y acceso directo permanecen', () => {
  assert.match(sidebar, /\{ page: 'cuotas\.html', label: 'Cuotas'/);
  assert.match(sidebar, /if \(item\.page === 'cuotas\.html'\) continue/);
  for (const role of ['ADMINISTRADOR', 'CONDOMINO', 'SUPER_ADMIN']) {
    const pages = navForRole(role).flatMap(group => group.items.map(item => item.page));
    assert.equal(pages.includes('cuotas.html'), false, 'Enlace oculto: '+role);
  }
  assert.match(html, /<a href="cuotas\.html">Cuotas<\/a>/);
});

test('Se conservan comunidad, seguridad y permisos originales', () => {
  const groups = navForRole();
  assert.deepEqual(groups.map(group => group.label), [
    '', 'Administración', 'Comunidad', 'Seguridad'
  ]);
  assert.ok(groups.find(group => group.label === 'Seguridad').items
    .some(item => item.page === 'seguridad.html'));
  assert.ok(groups.find(group => group.label === 'Comunidad').items
    .some(item => item.page === 'pagos.html'));
  assert.deepEqual(navForRole('SEGURIDAD').map(group => group.label), ['Seguridad']);
  assert.match(sidebar, /MJPermissions\.canAccess\(r,item\.page\)/);
});

test('Conciliación histórica desaparece del análisis y no carga su script', () => {
  for (const id of [
    'sheetsHistoricos','sheetsTipo','sheetsPreview','sheetsStage',
    'sheetsStatus','sheetsPreviewScroll','sheetsHead','sheetsRows'
  ]) {
    assert.doesNotMatch(html, new RegExp('id="'+id+'"'));
  }
  assert.doesNotMatch(html, /CONCILIACIÓN HISTÓRICA|Importar desde Google Sheets/);
  assert.doesNotMatch(html, /<script src="assets\/js\/google-sheets-historicos\.js/);
});

test('Permanecen el análisis, egresos, pagos, TAGs y el menú actualizado', () => {
  for (const id of [
    'financeHouseRows','financeHousePagination','financeExpenseRows',
    'newExpense','saveExpense','houseTagsModal','housePaymentModal'
  ]) {
    assert.match(html, new RegExp('id="'+id+'"'));
  }
  assert.match(html, /site-sidebar\.js\?v=20261015-comunidad-orden/);
  assert.match(sidebar, /\{ page: 'verificacion-cuentas\.html', label: 'Verificación de cuentas'/);
});
