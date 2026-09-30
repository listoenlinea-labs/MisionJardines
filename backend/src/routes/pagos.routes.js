const express = require('express');
const {
    obtenerConfiguracion,
    listarMisPagos,
    listarCuotasExtraordinarias,
    crearCuotaExtraordinaria,
    desactivarCuotaExtraordinaria,
    reportarPago,
    descargarRecibo
} = require('../controllers/pagos.controller');
const { autenticarToken } = require('../middlewares/auth.middleware');
const { autorizarRoles } = require('../middlewares/roles.middleware');

const router = express.Router();
router.use(autenticarToken);

const lecturaPagos = autorizarRoles(
    'SUPER_ADMIN',
    'ADMINISTRADOR',
    'MESA_DIRECTIVA',
    'CONDOMINO'
);
const soloAdministracion = autorizarRoles('SUPER_ADMIN', 'ADMINISTRADOR');

router.get('/config', lecturaPagos, obtenerConfiguracion);
router.get('/mios', lecturaPagos, listarMisPagos);
router.get('/:id/recibo', lecturaPagos, descargarRecibo);
router.get('/extraordinarias', lecturaPagos, listarCuotasExtraordinarias);
router.post('/extraordinarias', soloAdministracion, crearCuotaExtraordinaria);
router.patch('/extraordinarias/:id/archivar', soloAdministracion, desactivarCuotaExtraordinaria);
router.post('/', lecturaPagos, reportarPago);

module.exports = router;
