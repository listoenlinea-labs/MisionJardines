'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repo = path.resolve(__dirname, '../..');
const read = p => fs.readFileSync(path.join(repo, p), 'utf8');

test('El menú de Seguridad solo incluye Conmutador, Seguridad y Visitas', () => {
  const src = read('docs/assets/js/site-sidebar.js');
  const catalog = src.slice(src.indexOf('  const groups = ['), src.indexOf('\n\n  // Administración'));
  const navigation = src.slice(src.indexOf('  function navigationGroups() {'), src.indexOf('\n  const page ='));
  const policy = require('../../docs/assets/js/permissions');
  const getNavigation = role => Function('MJPermissions', 'role',
    catalog + '\n' + navigation + '\nreturn navigationGroups();')(policy, () => role);
  const security = getNavigation('SEGURIDAD');
  assert.deepEqual(security.map(group => group.label), ['Seguridad']);
  assert.deepEqual(security.flatMap(group => group.items.map(item => item.page)),
    ['conmutador.html', 'seguridad.html', 'visitas.html']);
  assert.equal(getNavigation('ADMINISTRADOR').some(group =>
    group.items.some(item => item.page === 'index.html')), true);
  assert.equal(getNavigation('ADMINISTRADOR').some(group =>
    group.items.some(item => item.page === 'mapa.html')), true);
  assert.equal(policy.canAccess('SEGURIDAD', 'cuenta.html'), true);
});

test('Seguridad puede abrir Nueva visita y el backend ya tiene permiso de registro', () => {
  const src = read('docs/visitas.html');
  const createFn = src.match(/function canCreate\(\)\s*\{[^}]+\}/)?.[0];
  assert.ok(createFn, 'Falta canCreate');
  const canCreate = (admin, security, role) => Function('actualIsAdmin',
    'actualIsSecurity', 'actualRole', createFn + '\nreturn canCreate();')(admin, security, role);
  assert.equal(canCreate(false, true, 'SEGURIDAD'), true);
  assert.equal(canCreate(true, false, 'ADMINISTRADOR'), true);
  assert.equal(canCreate(false, false, 'CONDOMINO'), true);
  assert.equal(canCreate(false, false, 'MANTENIMIENTO'), false);
  assert.match(src, /\$\('newVisitButton'\)\.addEventListener\('click', openVisit\)/);
  assert.match(src, /applyRole\(\);\s*Promise\.allSettled\(\[loadHouses\(\), loadVisits\(\)\]\)/);
  assert.match(src, /id="visitModal"/);
  assert.match(read('backend/src/routes/visitas.routes.js'), /'SEGURIDAD'/);
  assert.match(read('backend/src/controllers/visitas.controller.js'), /const adminOrSecurity = SECURITY_ROLES\.has\(req\.usuario\.rol\)/);
});

test('Los tres campos permiten revelar la clave sin enviar el formulario', () => {
  const src = read('docs/cuenta.html');
  for (const id of ['oldPassword', 'newPassword', 'confirmPassword']) {
    assert.match(src, new RegExp('<input id="' + id + '" type="password"'));
    assert.match(src, new RegExp('<button class="password-toggle" type="button" data-password-toggle="' + id + '"'));
  }
  assert.equal([...src.matchAll(/data-password-toggle="(?:oldPassword|newPassword|confirmPassword)"/g)].length, 3);
  assert.match(src, /resetPasswordVisibility\(\)/);
  for (const script of src.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    if (script[1].trim()) assert.doesNotThrow(() => new vm.Script(script[1]));
  }
  const visitHtml = read('docs/visitas.html');
  for (const script of visitHtml.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
    if (script[1].trim()) assert.doesNotThrow(() => new vm.Script(script[1]));
  }
});
