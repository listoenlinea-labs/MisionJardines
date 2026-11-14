const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const web = path.resolve(__dirname, '../../docs');
const html = fs.readFileSync(path.join(web, 'casa-club.html'), 'utf8');
const tour = fs.readFileSync(path.join(web, 'assets/js/casa-club-tour.js'), 'utf8');
const css = fs.readFileSync(path.join(web, 'assets/css/casa-club-tour.css'), 'utf8');

test('Casa Club carga las dependencias visuales del tour', () => {
  assert.match(html, /driver\.js@1\.3\.1\/dist\/driver\.css/);
  assert.match(html, /driver\.js@1\.3\.1\/dist\/driver\.js\.iife\.js/);
  assert.match(html, /assets\/css\/casa-club-tour\.css/);
  assert.match(html, /assets\/js\/casa-club-tour\.js/);
});

test('La guía diferencia acceso público, sesión y versión móvil', () => {
  assert.match(tour, /PUBLIC_KEY/);
  assert.match(tour, /SIGNED_KEY/);
  assert.match(tour, /MJVerifiedRole/);
  assert.match(tour, /clubStreetField/);
  assert.match(tour, /clubLinkedHouse/);
  assert.match(tour, /clubMobileSubmitArea/);
  assert.match(tour, /clubMobileSendRequest/);
  assert.match(css, /max-width: 700px/);
});

test('La guía explica correo, validación bancaria, reglas y restricciones', () => {
  for (const word of ['folio', 'enlace privado', 'comprobante', 'notificación bancaria',
    'reglamento', 'mantenimiento', 'tarjetas rojas', 'Mis reservas']) {
    assert.ok(tour.includes(word), 'Debe explicar: ' + word);
  }
});

test('Los enlaces privados no activan automáticamente el tour', () => {
  assert.match(tour, /\^#\(\?:comprobante\|mis-reservas\)=/);
  assert.match(tour, /PRIVATE_LINK\.test\(window\.location\.hash\)/);
});

test('La guía no realiza llamadas de red ni envía formularios', () => {
  assert.doesNotMatch(tour, /\bfetch\s*\(/);
  assert.doesNotMatch(tour, /\brequestSubmit\s*\(/);
  assert.doesNotMatch(tour, /\.submit\s*\(/);
  assert.match(tour, /disableActiveInteraction:\s*true/);
});
