const express = require('express');

const {
    listarCuotas,
    crearCuota,
    actualizarCuota,
    confirmarPago,
    reenviarRecibo
} = require('../controllers/cuotas.controller');

const {
    autenticarToken
} = require('../middlewares/auth.middleware');

const {
    autorizarRoles
} = require('../middlewares/roles.middleware');

const router = express.Router();

router.use(autenticarToken);

router.get(
    '/',
    autorizarRoles(
        'SUPER_ADMIN',
        'ADMINISTRADOR',
        'MESA_DIRECTIVA',
        'CONDOMINO'
    ),
    listarCuotas
);

router.post(
    '/',
    autorizarRoles(
        'SUPER_ADMIN',
        'ADMINISTRADOR'
    ),
    crearCuota
);

router.patch(
    '/:id',
    autorizarRoles(
        'SUPER_ADMIN',
        'ADMINISTRADOR',
        'MESA_DIRECTIVA'
    ),
    actualizarCuota
);

router.patch(
    '/:id/confirmar',
    autorizarRoles(
        'SUPER_ADMIN',
        'ADMINISTRADOR',
        'MESA_DIRECTIVA'
    ),
    confirmarPago
);

router.post(
    '/:id/reenviar',
    autorizarRoles(
        'SUPER_ADMIN',
        'ADMINISTRADOR',
        'MESA_DIRECTIVA'
    ),
    reenviarRecibo
);

module.exports = router;