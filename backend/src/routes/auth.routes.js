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

const registroPublico = require('../controllers/registro-publico.controller');
const { autorizarRoles } = require('../middlewares/roles.middleware');
const router = express.Router();
const codigoLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 6,
    standardHeaders: true,
    legacyHeaders: false,
    message: { ok: false, message: 'Demasiadas solicitudes. Espera 15 minutos e inténtalo nuevamente.' }
});

router.post('/login', iniciarSesion);
router.get('/registro-publico/viviendas', registroPublico.viviendasDisponibles);
router.post('/registro-publico/solicitar', codigoLimiter, registroPublico.solicitarAlta);
router.post('/registro-publico/verificar', codigoLimiter, registroPublico.verificarAlta);
router.get('/registro-publico/solicitudes', autenticarToken, autorizarRoles('SUPER_ADMIN','ADMINISTRADOR'), registroPublico.listarSolicitudes);
router.patch('/registro-publico/solicitudes/:id', autenticarToken, autorizarRoles('SUPER_ADMIN','ADMINISTRADOR'), registroPublico.revisarSolicitud);
router.get('/registro/viviendas', listarViviendasRegistro);
router.post('/registro/solicitar', codigoLimiter, solicitarRegistro);
router.post('/registro/verificar', codigoLimiter, verificarRegistro);

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
