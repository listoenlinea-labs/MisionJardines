'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const read = f => fs.readFileSync(path.resolve(__dirname,'../../',f),'utf8');

test('el visor PDF deja de usar blob como src y conserva blob para guardar con folio', () => {
 const js=read('docs/assets/js/analisis-cuotas.js');
 assert.doesNotMatch(js, /\$\('houseReceiptPreview'\)\.src=receiptObjectUrl/);
 assert.match(js, /const \{data:vista\}=await request\('\/pagos-vivienda\/'\+casaId\+'\/recibo\/vista'\+query\)/);
 assert.match(js, /\$\('houseReceiptPreview'\)\.src=new URL\(vista.url,new URL\(API\)\.origin\)\.href/);
 assert.match(js, /link\.href=receiptObjectUrl/);
 assert.match(js, /link\.download=String\(receiptDetails\.folio\|\|'Mantenimiento'\)/);
 assert.match(js, /receiptSequence/);
});

test('solo administradores obtienen pases de vista nativa del recibo', () => {
 const routes=read('backend/src/routes/finanzas.routes.js');
 const controller=read('backend/src/controllers/recibos-mantenimiento-analisis.controller.js');
 const app=read('backend/src/app.js');
 assert.match(routes, /router\.use\(autenticarToken,autorizarRoles\('SUPER_ADMIN','ADMINISTRADOR'\)\)/);
 assert.match(routes, /\/pagos-vivienda\/:casaId\/recibo\/vista',recibosMantenimiento\.urlVistaRecibo/);
 assert.match(controller, /expiresIn:'5m',audience:VISTA_AUD,issuer:VISTA_ISS/);
 assert.match(controller, /jwt\.verify\(String\(req\.params\.permiso\|\|''\),process\.env\.JWT_SECRET/);
 assert.match(controller, /payload\.tipo!=='vista-recibo'/);
 assert.match(controller, /Content-Disposition',\`inline; filename="/);
 assert.match(controller, /frame-ancestors 'self' https:\/\/listoenlinea-labs\.github\.io/);
 assert.match(app, /app\.get\('\/api\/recibo-vista\/:permiso'/);
});

test('se actualiza la versión de JS para evitar cache antigua',()=>{
 assert.match(read('docs/analisis-cuotas.html'),/analisis-cuotas\.js\?v=20261029-visor-filename/);
});
