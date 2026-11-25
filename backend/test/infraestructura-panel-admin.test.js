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
