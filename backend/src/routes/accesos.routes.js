const express = require('express');
const { obtenerAccesos, crearAcceso, registrarSalida } = require('../controllers/accesos.controller');
const { autenticarToken } = require('../middlewares/auth.middleware');
const { autorizarRoles } = require('../middlewares/roles.middleware');

const router = express.Router();
const rolesSeguridad = autorizarRoles('SUPER_ADMIN', 'ADMINISTRADOR', 'MESA_DIRECTIVA', 'SEGURIDAD');

router.get('/', autenticarToken, rolesSeguridad, obtenerAccesos);
router.post('/', autenticarToken, rolesSeguridad, crearAcceso);
router.patch('/:id/salida', autenticarToken, rolesSeguridad, registrarSalida);

module.exports = router;
