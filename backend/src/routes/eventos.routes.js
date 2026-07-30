const express = require('express');
const {
    obtenerEventos,
    crearEvento,
    eliminarEvento
} = require('../controllers/eventos.controller');
const { autenticarToken } = require('../middlewares/auth.middleware');
const { autorizarRoles } = require('../middlewares/roles.middleware');

const router = express.Router();

router.get('/', autenticarToken, obtenerEventos);
router.post(
    '/',
    autenticarToken,
    autorizarRoles('SUPER_ADMIN', 'ADMINISTRADOR', 'MESA_DIRECTIVA'),
    crearEvento
);
router.delete(
    '/:id',
    autenticarToken,
    autorizarRoles('SUPER_ADMIN', 'ADMINISTRADOR', 'MESA_DIRECTIVA'),
    eliminarEvento
);

module.exports = router;
