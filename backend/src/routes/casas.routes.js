const express = require('express');

const {
    obtenerCasas
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
        'MESA_DIRECTIVA'
    ),
    obtenerCasas
);

module.exports = router;