const test = require('node:test');
const assert = require('node:assert/strict');
const {canAccess,pages,landing} = require('../../docs/assets/js/permissions');
test('administrators can access every application page', () => {
  for (const role of ['SUPER_ADMIN','ADMINISTRADOR']) for (const page of pages) assert.equal(canAccess(role,page),true);
});
test('security has exactly the requested operational pages plus account', () => {
  assert.deepEqual(pages.filter(p=>canAccess('SEGURIDAD',p)).sort(), ['index.html','bases_datos.html','mapa.html','visitas.html','conmutador.html','reportes.html','reporte.html','seguridad.html','conexion.html','cuenta.html'].sort());
});
test('residents have complementary pages, no operational access', () => {
  assert.deepEqual(pages.filter(p=>canAccess('CONDOMINO',p)).sort(), ['cuotas.html','pagos.html','anuncios.html','calendario.html','directorio.html','cuenta.html'].sort());
  assert.equal(landing('CONDOMINO'),'cuotas.html');
});
test('unknown roles and pages are denied', () => {
  for (const page of pages) assert.equal(canAccess('',page),false);
  assert.equal(canAccess('SUPER_ADMIN','unknown.html'),false);
});
