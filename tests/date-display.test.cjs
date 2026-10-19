const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dates = require('../docs/assets/js/date-display.js');

test('fechas de mantenimiento, extraordinarios y casa club tienen el mismo formato', () => {
  assert.equal(dates.format('2026-10-19'), '19-OCT-2026');
  assert.equal(dates.format('2027-02-10'), '10-FEB-2027');
  assert.equal(dates.format('2028-02-29'), '29-FEB-2028');
  assert.equal(dates.format('2026-01-01'), '01-ENE-2026');
  assert.equal(dates.format('2026-12-31'), '31-DIC-2026');
});

test('las fechas sin día válido se conservan, sin inventar datos', () => {
  assert.equal(dates.format('2026-02-29'), '2026-02-29');
  assert.equal(dates.format('2026-13-01'), '2026-13-01');
  assert.equal(dates.format(''), '');
});

test('reconoce formatos locales previos de ZKTeco y textos de modales', () => {
  assert.equal(dates.format('19/10/2026'), '19-OCT-2026');
  assert.equal(dates.format('19/10/26'), '19-OCT-2026');
  assert.equal(dates.format('19 oct. 2026'), '19-OCT-2026');
  assert.equal(dates.formatText('lunes, 19 de octubre de 2026'), 'lunes, 19-OCT-2026');
  assert.equal(dates.formatText('Pago: 19/10/26, 11:45 a.m.'), 'Pago: 19-OCT-2026, 11:45 a.m.');
});

test('los sellos de hora conservan hora y fecha de la zona de México', () => {
  assert.equal(dates.formatDateTime('2026-10-19T16:45:00Z'), '19-OCT-2026, 10:45');
  assert.equal(dates.formatDateTime('2026-10-19T02:00:00Z'), '18-OCT-2026, 20:00');
  assert.equal(dates.formatDateTime('2026-10-19'), '19-OCT-2026');
  assert.equal(dates.formatText('Actualizado: 2026-10-19T16:45:00Z'), 'Actualizado: 19-OCT-2026, 10:45');
});

test('no altera folios, direcciones, valores ya formateados o intervalos inválidos', () => {
  assert.equal(dates.formatText('Folio ABC-2026-10-19'), 'Folio ABC-2026-10-19');
  assert.equal(dates.formatText('https://ejemplo.mx/2026-10-19/nota'), 'https://ejemplo.mx/2026-10-19/nota');
  assert.equal(dates.formatText('19-OCT-2026'), '19-OCT-2026');
  assert.equal(dates.formatText('2026-02-29'), '2026-02-29');
  assert.equal(dates.formatText('Vigencia 2027-02-10 · pago 19/10/2026'), 'Vigencia 10-FEB-2027 · pago 19-OCT-2026');
});

test('la presentación está cargada en todas las páginas de la aplicación', () => {
  const dir = path.join(__dirname, '../docs');
  const files = fs.readdirSync(dir).filter(name => name.endsWith('.html'));
  assert.ok(files.length >= 20);
  for (const file of files) {
    const html = fs.readFileSync(path.join(dir, file), 'utf8');
    assert.match(html, /<script src="assets\/js\/date-display\.js\?v=20261019"><\/script>/,
      `Falta formateador en ${file}`);
  }
});

test('el formato visual no modifica el tipo date ni los valores que se envían', () => {
  const source = fs.readFileSync(path.join(__dirname, '../docs/assets/js/date-display.js'), 'utf8');
  assert.match(source, /input\[type="date"\]/);
  assert.match(source, /format\(input\.value\)/);
  assert.doesNotMatch(source, /input\.value\s*=/);
  assert.doesNotMatch(source, /input\.type\s*=/);
});
