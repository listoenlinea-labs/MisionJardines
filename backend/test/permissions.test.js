const test = require('node:test');
const assert = require('node:assert/strict');
const {canAccess,pages,landing} = require('../../docs/assets/js/permissions');
test('administrators can access every application page', () => {
  for (const role of ['SUPER_ADMIN','ADMINISTRADOR']) for (const page of pages) assert.equal(canAccess(role,page),true);
});
test('security has exactly the requested operational pages plus account', () => {
  assert.deepEqual(pages.filter(p=>canAccess('SEGURIDAD',p)).sort(), ['bases_datos.html','mapa.html','visitas.html','conmutador.html','reportes.html','reporte.html','seguridad.html','cuenta.html','zkteco.html'].sort());
  assert.equal(landing('SEGURIDAD'),'seguridad.html');
  assert.equal(canAccess('SEGURIDAD','index.html'),false);
  assert.equal(canAccess('SEGURIDAD','viviendas.html'),false);
});
test('residents have complementary pages, no operational access', () => {
  assert.deepEqual(pages.filter(p=>canAccess('CONDOMINO',p)).sort(), ['index.html','cuotas.html','pagos.html','casa-club.html','anuncios.html','calendario.html','directorio.html','cuenta.html','viviendas.html'].sort());
  assert.equal(landing('CONDOMINO'),'cuotas.html');
  assert.equal(canAccess('CONDOMINO','analisis-cuotas.html'),false);
  assert.equal(canAccess('SEGURIDAD','casa-club.html'),false);
  assert.equal(canAccess('ADMINISTRADOR','analisis-cuotas.html'),true);
});
test('unknown roles and pages are denied', () => {
  for (const page of pages) assert.equal(canAccess('',page),false);
  assert.equal(canAccess('SUPER_ADMIN','unknown.html'),false);
});

test('backend policy is self-contained and matches frontend permissions', () => {
  const backend = require('../src/config/permissions');
  for (const role of ['SUPER_ADMIN','ADMINISTRADOR','SEGURIDAD','CONDOMINO','MESA_DIRECTIVA','MANTENIMIENTO','']) {
    for (const page of pages) assert.equal(backend.canAccess(role,page),canAccess(role,page));
    assert.equal(backend.landing(role),landing(role));
  }
  // Connection is an internal API capability; its public page was removed.
  assert.equal(backend.canAccess('SEGURIDAD','conexion.html'),true);
  assert.equal(canAccess('SEGURIDAD','conexion.html'),false);
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const {execFileSync} = require('node:child_process');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(),'mj-backend-'));
  try {
    fs.copyFileSync(require.resolve('../src/config/permissions'),path.join(directory,'permissions.js'));
    execFileSync(process.execPath,['-e',"const p=require('./permissions');if(!p.canAccess('ADMINISTRADOR','index.html'))process.exit(1)"],{cwd:directory});
  } finally { fs.rmSync(directory,{recursive:true,force:true}); }
});

