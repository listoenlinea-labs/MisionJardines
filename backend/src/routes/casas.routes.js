const express = require('express');

const {
    obtenerCasas,
    actualizarAccesosCasa
} = require('../controllers/casas.controller');

const {
    autenticarToken
} = require('../middlewares/auth.middleware');

const {
    autorizarRoles
} = require('../middlewares/roles.middleware');

const router = express.Router();

router.get(
    '/',
    autenticarToken,
    autorizarRoles(
        'SUPER_ADMIN',
        'ADMINISTRADOR',
        'MESA_DIRECTIVA',
        'SEGURIDAD'
    ),
    obtenerCasas
);

router.patch(
    '/:id/accesos',
    autenticarToken,
    autorizarRoles(
        'SUPER_ADMIN',
        'ADMINISTRADOR',
        'MESA_DIRECTIVA',
        'SEGURIDAD'
    ),
    actualizarAccesosCasa
);

module.exports = router;