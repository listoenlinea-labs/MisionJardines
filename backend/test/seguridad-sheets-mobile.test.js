'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'../..');
const read=x=>fs.readFileSync(path.join(root,x),'utf8');
function load(){
 const code=read('backend/src/controllers/seguridad-cuotas.controller.js');
 const mod={exports:{}};
 const fakeRequire=id=>{
   if(id==='../models')return {Casa:{},Cuota:{}};
   if(id.startsWith('../services/'))return require(path.resolve(root,'backend/src/controllers',id));
   throw Error('Unmocked '+id);
 };
 new Function('require','module',code)(fakeRequire,mod);
 return mod.exports;
}
test('cuotas de seguridad no filtran datos personales y comparten estado con Análisis',()=>{
 const {resumenVivienda}=load();
 const casa={calle:'Gardenias',numero:'5',nombre:'NO_PUBLICAR',telefono:'NO_PUBLICAR'};
 const date=new Date('2026-10-11T17:00:00Z');
 const blank=resumenVivienda(casa,[],date);
 assert.equal(blank.estado,'DEUDOR', 'Sin pagos, Análisis calcula deuda desde enero');
 assert.deepEqual(Object.keys(blank).sort(),['calle','estado','numero','ultimaFechaPago','ultimoMesPagado'].sort());
 const paid=[{anio:2026,mes:'OCTUBRE',estatusPago:'PAGADO',montoPagado:300,fechaPago:'2026-10-08T12:00:00Z'}];
 const ok=resumenVivienda(casa,paid,date);
 assert.equal(ok.estado,'AL_CORRIENTE');
 assert.equal(ok.ultimoMesPagado,'OCTUBRE 2026');
 assert.equal(ok.ultimaFechaPago,'2026-10-08');
 assert.equal(resumenVivienda(casa,[{anio:2026,mes:'SEPTIEMBRE',estatusPago:'PENDIENTE'},...paid],date).estado,'AL_CORRIENTE', 'El último mes pagado fija la cobertura, como en Análisis');
 assert.equal(resumenVivienda(casa,[{anio:2026,mes:'SEPTIEMBRE',estatusPago:'PAGADO'}],date).estado,'DEUDOR');
});
test('rutas de seguridad y Sheets exigen roles',()=>{
 const security=read('backend/src/routes/seguridad-cuotas.routes.js');
 const sheets=read('backend/src/routes/google-sheets.routes.js');
 assert.match(security,/autenticarToken/);
 assert.match(security,/autorizarRoles\('SUPER_ADMIN','ADMINISTRADOR','SEGURIDAD'\)/);
 assert.match(sheets,/router\.use\(autenticarToken,autorizarRoles\('SUPER_ADMIN','ADMINISTRADOR'\)\)/);
 assert.doesNotMatch(sheets,/RESIDENTE|MESA_DIRECTIVA/);
});
test('Sheets es lectura privada; importaciones quedan en staging',()=>{
 const service=read('backend/src/services/google-sheets.service.js');
 const controller=read('backend/src/controllers/google-sheets.controller.js');
 const app=read('backend/src/app.js');
 assert.match(service,/spreadsheets\.readonly/);
 assert.match(service,/GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON_BASE64/);
 assert.match(service,/GOOGLE_SHEETS_SPREADSHEET_ID/);
 assert.match(controller,/PENDIENTE_REVISION/);
 assert.match(controller,/confirmar!=='IMPORTAR_A_REVISION'/);
 assert.doesNotMatch(controller,/PagoReportado\.create|Cuota\.create|Egreso\.create/);
 assert.match(app,/seguridad-cuotas/);
 assert.match(app,/google-sheets/);
});
test('móvil: gráfica sin ancho mínimo, donut centrado y controles ZKTeco horizontales',()=>{
 const css=read('docs/assets/css/mobile-operativo.css');
 assert.match(css,/body\.mj-home \.hl-chart/);
 assert.match(css,/min-width:0!important;max-width:100%!important/);
 assert.match(css,/\.house-actions/);
 assert.match(css,/flex-wrap:nowrap!important/);
 assert.match(css,/\.donut>div/);
 assert.match(css,/\.street-tabs/);
 assert.match(css,/\.metric-grid/);
 assert.match(css,/#clubTotals/);
 assert.match(css,/#seguridadCuotasPanel/);
 const sidebar=read('docs/assets/js/site-sidebar.js');
 assert.match(sidebar,/mobile-operativo\.css\?v=20261011-b/);
 let balance=0;for(const ch of css)balance+=ch==='{'?1:ch==='}'?-1:0;
 assert.equal(balance,0);
});
test('elementos de seguridad y Google Sheets disponibles sin filtrar identificadores',()=>{
 const security=read('docs/seguridad.html');
 const analysis=read('docs/analisis-cuotas.html');
 assert.match(security,/id="segCuotasRows"/);
 assert.match(security,/id="segCuotasPrev"/);
 assert.doesNotMatch(security,/id="segCuotasNombre"/);
 assert.match(analysis,/id="sheetsPreview"/);
 assert.match(analysis,/id="sheetsStage"/);
 for(const file of ['backend/src/controllers/seguridad-cuotas.controller.js',
 'backend/src/controllers/google-sheets.controller.js',
 'backend/src/services/google-sheets.service.js',
 'docs/assets/js/seguridad-cuotas.js',
 'docs/assets/js/google-sheets-historicos.js']){
   assert.doesNotThrow(()=>new Function(read(file)),file);
 }
});

test('arranque del C3-200 no depende de crear tablas ni de Google Sheets',()=>{
 const server=read('backend/src/server.js');
 const app=read('backend/src/app.js');
 assert.doesNotMatch(server,/GoogleSheetsHistorico|google-sheets/);
 assert.match(server,/asegurarEsquemaZkteco\(\)/);
 assert.match(server,/zkteco-vigencias\.service'\)\.start\(\)/);
 assert.match(server,/zkteco-autosync\.service'\)\.startZktecoAutoSync\(\)/);
 assert.match(app,/app\.use\('\/api\/zkteco', zktecoRoutes\)/);
 assert.match(app,/app\.use\('\/api\/conexion', conexionRoutes\)/);
 assert.match(app,/GOOGLE_SHEETS_ENABLED === 'true'/);
});
