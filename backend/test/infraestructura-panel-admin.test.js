const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const read=p=>fs.readFileSync(path.join(__dirname,'../..',p),'utf8');
test('Infraestructura solo permite administradores en ambas políticas',()=>{
 for(const policy of [require('../../docs/assets/js/permissions'),require('../src/config/permissions')]){
  for(const role of ['ADMINISTRADOR','SUPER_ADMIN'])assert.equal(policy.canAccess(role,'infraestructura.html'),true);
  for(const role of ['SEGURIDAD','CONDOMINO','MESA_DIRECTIVA','MANTENIMIENTO',''])assert.equal(policy.canAccess(role,'infraestructura.html'),false);
 }
});
test('página independiente, debajo de ZKTeco y sin tarjeta en Inicio',()=>{
 const menu=read('docs/assets/js/site-sidebar.js');
 assert.match(menu,/'zkteco\.html',\s*'infraestructura\.html',\s*'bases_datos\.html'/);
 assert.doesNotMatch(read('docs/index.html'),/infraestructura-admin\.js/);
 assert.match(read('docs/infraestructura.html'),/phoneRetry/);
 assert.match(read('docs/infraestructura.html'),/zkRetry/);
 const routes=read('backend/src/routes/infraestructura.routes.js');
 assert.match(routes,/router\.post\('\/zkteco\/reintentar',autenticarToken,admin/);
 assert.match(routes,/router\.get\('\/zkteco\/logs',autenticarToken,admin/);
});

test('cabecera de Infraestructura deja espacio bajo el shell fijo en vista directa e integrada',()=>{
 const css=read('docs/assets/css/infraestructura.css');
 const product=read('docs/assets/css/product-ui.css');
 assert.match(product,/body\.mj-shared-sidebar-enabled:not\(\.mj-home\)::before\s*\{[^}]*height:70px/);
 assert.match(product,/body\.mj-shared-sidebar-enabled:not\(\.mj-home\)::before\{left:0;height:65px\}/);
 assert.match(css,/\.infra-wrap\{--infra-header-clearance:90px;/);
 assert.match(css,/\.page-infraestructura\.mj-embedded \.infra-wrap\{padding-top:var\(--infra-header-clearance\)\}/);
 assert.match(css,/@media\(max-width:820px\)\{\.infra-wrap\{--infra-header-clearance:85px\}\}/);
 assert.doesNotMatch(css,/\.mj-embedded \.infra-wrap\{padding-top:\d+px/);
 assert.match(css,/\.infra-hero\{[^}]*flex-wrap:wrap/);
 assert.match(css,/\.infra-refresh-control\{flex:0 1 auto;align-items:stretch;width:100%/);
 assert.match(read('docs/infraestructura.html'),/infraestructura\.css\?v=20261125-v8/);
});
