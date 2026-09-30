const express = require('express');
const {
    obtenerConfiguraciones,
    obtenerEstadoIntegraciones,
    guardarConfiguracion
} = require('../controllers/conexion.controller');
const { autenticarToken } = require('../middlewares/auth.middleware');
const { autorizarRoles } = require('../middlewares/roles.middleware');

const router = express.Router();
const soloAdministracion = autorizarRoles('SUPER_ADMIN', 'ADMINISTRADOR');
const seguridad = autorizarRoles('SUPER_ADMIN', 'ADMINISTRADOR', 'SEGURIDAD');

router.get('/', autenticarToken, seguridad, obtenerConfiguraciones);
router.get('/estado', autenticarToken, seguridad, obtenerEstadoIntegraciones);
router.put('/:tipo', autenticarToken, soloAdministracion, guardarConfiguracion);

module.exports = router;
