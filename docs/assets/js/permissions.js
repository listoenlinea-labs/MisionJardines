/* Shared page policy: browser navigation and server authorization. */
(function(root) {
  const admins = ['SUPER_ADMIN', 'ADMINISTRADOR'];
  const security = ['index.html','bases_datos.html','mapa.html','visitas.html','zkteco.html','conmutador.html','reportes.html','reporte.html','seguridad.html','conexion.html'];
  const resident = ['cuotas.html','pagos.html','anuncios.html','calendario.html','directorio.html'];
  const legacy = {
    MESA_DIRECTIVA: ['index.html','cuotas.html','pagos.html','bases_datos.html','zkteco.html','conmutador.html','anuncios.html','calendario.html','directorio.html'],
    MANTENIMIENTO: ['index.html','reportes.html','reporte.html','anuncios.html','calendario.html','directorio.html']
  };
  const pages = [...new Set([...security,...resident,'cuenta.html','viviendas.html','verificacion-cuentas.html'])];
  function canAccess(role, page) {
    if (!pages.includes(page)) return false;
    if (page === 'verificacion-cuentas.html') return admins.includes(role);
    if (admins.includes(role)) return true;
    const allowed = role === 'SEGURIDAD' ? security : role === 'CONDOMINO' ? resident : legacy[role];
    return !!allowed && (['cuenta.html','viviendas.html'].includes(page) || allowed.includes(page));
  }
  const policy = { admins, pages, canAccess, landing: role => role === 'CONDOMINO' ? 'cuotas.html' : 'index.html' };
  if (typeof module !== 'undefined' && module.exports) module.exports = policy;
  else root.MJPermissions = policy;
})(typeof window !== 'undefined' ? window : globalThis);
