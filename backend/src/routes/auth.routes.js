const express = require('express');
const rateLimit = require('express-rate-limit');

const {
    iniciarSesion,
    obtenerPerfil,
    listarViviendasRegistro,
    solicitarRegistro,
    verificarRegistro,
    actualizarPerfil,
    cambiarContrasena,
    solicitarCambioCorreo,
    verificarCambioCorreo,
    crearSolicitudRol,
    listarSolicitudesRol,
    revisarSolicitudRol
} = require('../controllers/auth.controller');

const {
    autenticarToken
} = require('../middlewares/auth.middleware');

const router = express.Router();
const { autorizarRoles } = require('../middlewares/roles.middleware');
const cuentas = require('../controllers/cuentas.controller');
const administracion = autorizarRoles('SUPER_ADMIN', 'ADMINISTRADOR');
const codigoLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 6,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, message: 'Demasiadas solicitudes. Espera 15 minutos e inténtalo nuevamente.' }
});

router.post('/login', iniciarSesion);
router.get('/registro/viviendas', listarViviendasRegistro);
router.post('/registro/solicitar', codigoLimiter, solicitarRegistro);
router.post('/registro/verificar', codigoLimiter, verificarRegistro);
router.get('/cuentas', autenticarToken, administracion, cuentas.listar);
router.get('/cuentas/viviendas', autenticarToken, administracion, cuentas.viviendas);
router.patch('/cuentas/:id', autenticarToken, administracion, cuentas.revisar);
router.patch('/cuentas/:id/revocar', autenticarToken, administracion, cuentas.revocar);

router.get(
    '/perfil',
    autenticarToken,
    obtenerPerfil
);

router.patch('/perfil', autenticarToken, actualizarPerfil);
router.patch('/perfil/contrasena', autenticarToken, cambiarContrasena);
router.post('/perfil/correo/solicitar', autenticarToken, codigoLimiter, solicitarCambioCorreo);
router.post('/perfil/correo/verificar', autenticarToken, codigoLimiter, verificarCambioCorreo);
router.get('/solicitudes-rol', autenticarToken, listarSolicitudesRol);
router.post('/solicitudes-rol', autenticarToken, crearSolicitudRol);
router.patch('/solicitudes-rol/:id', autenticarToken, revisarSolicitudRol);

module.exports = router;
