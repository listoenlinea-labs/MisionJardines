'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const dbCapacity = require('../src/services/db-capacity.service');
const { parseGoogleRss, rssUrl } = require('../src/services/noticias-google-rss.service');

test('Google Noticias se consulta como RSS mexicano y sin API key', () => {
  const url = rssUrl('Zapopan when:7d');
  assert.equal(url.origin, 'https://news.google.com');
  assert.equal(url.searchParams.get('ceid'), 'MX:es-419');
  assert.equal(url.searchParams.get('gl'), 'MX');
});
test('Se parsean titulares, fuente, fecha y HTML de Google RSS', () => {
  const xml = '<rss version="2.0"><channel><item><title>Choque en Zapopan &amp; Aviación</title>' +
    '<link>https://news.google.com/rss/articles/123</link>' +
    '<pubDate>Tue, 10 Nov 2026 17:00:00 GMT</pubDate>' +
    '<description>&lt;p&gt;Accidente en Avenida Aviación&lt;/p&gt;</description>' +
    '<source url="https://example.com">Periódico local</source></item></channel></rss>';
  const notes = parseGoogleRss(xml);
  assert.equal(notes.length, 1);
  assert.equal(notes[0].title, 'Choque en Zapopan & Aviación');
  assert.equal(notes[0].description, ' Accidente en Avenida Aviación '.trim());
  assert.equal(notes[0].sitename, 'Periódico local');
  assert.equal(notes[0].published_at, '2026-11-10T17:00:00.000Z');
});
test('Medición es local y nunca declara saldo oficial de Hostinger', () => {
  dbCapacity.discoverLimits([{ grant: 'GRANT USAGE ON *.* TO user WITH MAX_CONNECTIONS_PER_HOUR 500 MAX_QUERIES_PER_HOUR 10000' }]);
  const before = dbCapacity.read();
  dbCapacity.mark('connections');
  dbCapacity.mark('queries');
  const after = dbCapacity.read();
  assert.equal(after.exact, false);
  assert.equal(after.scope, 'proceso_actual');
  assert.ok(after.connections.observedLastHour >= before.connections.observedLastHour + 1);
  assert.ok(after.queries.observedLastHour >= before.queries.observedLastHour + 1);
  assert.ok(after.connections.limit === 500 || after.connections.limitSource === 'entorno');
  assert.match(after.message, /No incluye otros procesos/);
});
test('Ruta del medidor restringe roles en servidor sin abrir conexión MySQL', () => {
  const app = fs.readFileSync(path.join(__dirname, '../src/app.js'),'utf8');
  assert.match(app, /app\.get\('\/api\/monitor\/mysql'/);
  assert.match(app, /\['SUPER_ADMIN', 'ADMINISTRADOR'\]\.includes\(claims\.rol\)/);
  assert.match(app, /db-capacity\.service'\)\.read\(sequelize\)/);
});
test('Indicador de Inicio solo se activa después de validar el rol', () => {
  const home = fs.readFileSync(path.join(__dirname, '../../docs/index.html'),'utf8');
  const meter = fs.readFileSync(path.join(__dirname, '../../docs/assets/js/db-capacity-meter.js'),'utf8');
  assert.match(home, /id="mjDbCapacityMeter"[^>]*hidden/);
  assert.match(home, /MJDbCapacityMeter\?\.start\(role\)/);
  assert.match(meter, /admins = \['SUPER_ADMIN', 'ADMINISTRADOR'\]/);
  assert.match(meter, /60000/);
});
