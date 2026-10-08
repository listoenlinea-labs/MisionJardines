// El modo de pruebas nunca debe validar comprobantes ni habilitar accesos.
 // La autorización financiera requiere confirmación explícita por Administración.
module.exports = Object.freeze({ VALIDAR_PAGOS_SIN_ADMIN: false });
