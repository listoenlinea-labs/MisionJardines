const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const docs = path.resolve(__dirname, '../../docs');
const read = source => fs.readFileSync(path.join(docs, source), 'utf8');
const data = read('assets/js/portal-tour-content.js');
const engine = read('assets/js/portal-tour.js');
const css = read('assets/css/portal-tour.css');
const shell = read('assets/js/app-shell.js');
const app = read('app.html');
const club = read('assets/js/casa-club-tour.js');
const policy = require(path.resolve(docs, 'assets/js/permissions.js'));
const sandbox = {window: {}};
vm.runInNewContext(data, sandbox);
const content = sandbox.window.MJPortalTourContent;

test('El shell carga el onboarding solo después del acceso validado', () => {
  assert.match(app, /assets\/js\/portal-tour-content\.js/);
  assert.match(app, /assets\/js\/portal-tour\.js/);
  assert.match(app, /assets\/css\/portal-tour\.css/);
  assert.match(shell, /new CustomEvent\('mj-shell-page-ready'/);
  assert.match(engine, /await window\.MJAccessReady/);
  assert.match(engine, /window\.MJVerifiedRole/);
});

test('Las tres experiencias tienen recorridos extensos y relevantes', () => {
  const admin = content.getSteps('ADMINISTRADOR');
  const resident = content.getSteps('CONDOMINO');
  const security = content.getSteps('SEGURIDAD');
  assert.ok(admin.length >= 42, 'Administración debe tener más de 42 pasos');
  assert.ok(resident.length >= 20, 'Residente debe tener más de 20 pasos');
  assert.ok(security.length >= 17, 'Seguridad debe tener más de 17 pasos');
  for (const set of [admin, resident, security]) {
    assert.ok(set.every(x => x.group && x.title && x.description));
  }
  assert.ok(admin.some(x => x.page === 'analisis-cuotas.html'));
  assert.ok(admin.some(x => x.page === 'pagos.html'));
  assert.ok(admin.some(x => x.page === 'casa-club.html'));
  assert.ok(resident.some(x => x.page === 'pagos.html'));
  assert.ok(resident.some(x => x.page === 'casa-club.html'));
  assert.ok(security.some(x => x.page === 'conmutador.html'));
  assert.ok(security.some(x => x.page === 'visitas.html'));
  assert.ok(security.some(x => x.page === 'seguridad.html'));
});

test('Nunca se orienta a un rol hacia páginas que no puede abrir', () => {
  for (const role of ['SUPER_ADMIN','ADMINISTRADOR','CONDOMINO','SEGURIDAD']) {
    for (const step of content.getSteps(role)) {
      assert.ok(!step.page || policy.canAccess(role, step.page),
        role + ' no puede abrir ' + step.page);
    }
  }
  const resident = content.getSteps('CONDOMINO');
  const security = content.getSteps('SEGURIDAD');
  assert.equal(resident.some(x => x.page === 'analisis-cuotas.html'), false);
  assert.equal(security.some(x => ['pagos.html','casa-club.html','analisis-cuotas.html'].includes(x.page)), false);
});

test('Análisis, pagos y Casa Club tienen explicaciones de proceso', () => {
  const admin = content.getSteps('ADMINISTRADOR');
  const analysis = admin.filter(x => x.page === 'analisis-cuotas.html');
  assert.ok(analysis.some(x => x.selector === '#financeTabMaintenance'));
  assert.ok(analysis.some(x => x.selector === '#financeTabExtra'));
  assert.ok(analysis.some(x => x.selector === '#financeTabClub'));
  assert.ok(analysis.some(x => x.selector === '#financeBalanceCard'));
  assert.ok(analysis.some(x => x.selector === '#financeManualReceiptOpen'));
  for (const word of ['OCR','comprobante','validación','folio','tarjetas rojas','reglamento']) {
    assert.ok(admin.some(x => x.description.includes(word)),
      'Se debe explicar: ' + word);
  }
});

test('No crea registros; recuerda navegador y permite reiniciar la guía', () => {
  assert.match(engine, /localStorage\.setItem/);
  assert.match(engine, /mjPortalRecorridoV1:/);
  assert.match(engine, /mjPortalTourLauncher/);
  assert.match(engine, /routeTo\(targetStep\.page\)/);
  assert.match(engine, /MJShell\.navigate\(page\)/);
  for (const forbidden of [/\bfetch\s*\(/, /\.requestSubmit\s*\(/, /\.submit\s*\(/,
    /\.click\s*\(/, /\.postMessage\s*\(/]) {
    assert.doesNotMatch(engine, forbidden, 'El motor no debe ejecutar acciones de negocio');
  }
  assert.match(css, /max-width:660px/);
  assert.match(club, /insidePortal/); // El tour de Casa Club no se superpone en el shell.
});

test('Omitir guía está disponible desde la invitación y desde cualquier paso', () => {
  assert.match(engine, /id="mjTourSkip">Omitir guía<\/button>/);
  assert.match(engine, /id="mjWelcomeNotNow">Omitir guía<\/button>/);
  assert.match(engine, /mjTourSkip'\)\.addEventListener\('click',\s*\(\)\s*=>\s*finish\('skipped'\)/);
  assert.match(engine, /save\('skipped'\)/);
  assert.match(engine, /function finish\(status\)/);
  assert.match(engine, /save\(status\)/);
  assert.match(engine, /readSaved\(\)/);
  assert.match(engine, /mjPortalTourLauncher/);
  assert.match(css, /\.mj-tour-skip\s*\{/);
});
