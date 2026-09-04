const express = require('express');
const { list, create, enter, exit, cancel } = require('../controllers/visitas.controller');
const { autenticarToken } = require('../middlewares/auth.middleware');
const { autorizarRoles } = require('../middlewares/roles.middleware');

const router = express.Router();
const allRoles = autorizarRoles('SUPER_ADMIN', 'ADMINISTRADOR', 'MESA_DIRECTIVA', 'SEGURIDAD', 'CONDOMINO');
const security = autorizarRoles('SUPER_ADMIN', 'ADMINISTRADOR', 'MESA_DIRECTIVA', 'SEGURIDAD');
const cancelRoles = autorizarRoles('SUPER_ADMIN', 'ADMINISTRADOR', 'MESA_DIRECTIVA', 'CONDOMINO');

router.get('/', autenticarToken, allRoles, list);
router.post('/', autenticarToken, allRoles, create);
router.patch('/:id/entrada', autenticarToken, security, enter);
router.patch('/:id/salida', autenticarToken, security, exit);
router.patch('/:id/cancelar', autenticarToken, cancelRoles, cancel);

module.exports = router;
