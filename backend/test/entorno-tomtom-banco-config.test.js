'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {configurado}=require('../src/services/banco-correo.service');
const leer=p=>fs.readFileSync(path.resolve(__dirname,'../../',p),'utf8');

test('TomTom Incident Details v5 envía idioma español admitido por API',()=>{
 const source=leer('backend/src/routes/entorno.routes.js');
 assert.match(source,/incidentsUrl\.searchParams\.set\('language', 'es-ES'\)/);
 assert.doesNotMatch(source,/incidentsUrl\.searchParams\.set\('language', 'es'\)/);
 assert.match(source,/incidentsUrl\.searchParams\.set\('fields', '\{incidents\{type,geometry\{type,coordinates\},properties\{/);
 assert.match(source,/events\{description\}/);
});

test('autovalidación IMAP queda inactiva cuando el interruptor es false o faltan variables',()=>{
 const required={
  PAGOS_IMAP_HOST:'imap.hostinger.com',
  PAGOS_IMAP_MAILBOX:'soluciones@listoenlinea.com',
  PAGOS_IMAP_PASSWORD:'secret-value-only-in-test',
  PAGOS_IMAP_AUTH_SERVER:'server.confirmado.example',
  PAGOS_BANK_FROM_ADDRESS:'notificaciones@bazdigital.com',
  PAGOS_DESTINO_ULTIMOS4:'4409'
 };
 assert.equal(configurado({...required,PAGOS_BANK_AUTO_VALIDATE:'false'}),false);
 assert.equal(configurado({...required,PAGOS_BANK_AUTO_VALIDATE:'true'}),true);
 for(const name of Object.keys(required))assert.equal(configurado({...required,[name]:'',PAGOS_BANK_AUTO_VALIDATE:'true'}),false);
});

test('logs de arranque distinguen flag desactivado y variables faltantes sin imprimir valores secretos',()=>{
 const source=leer('backend/src/services/banco-correo-worker.service.js');
 assert.match(source,/PAGOS_BANK_AUTO_VALIDATE!=='true'/);
 assert.match(source,/faltantes=requeridas\.filter/);
 assert.match(source,/faltan variables:/);
 assert.doesNotMatch(source,/console\.(?:warn|info|log)\([^\n]*process\.env\.PAGOS_IMAP_PASSWORD/);
});
