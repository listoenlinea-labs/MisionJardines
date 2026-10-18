const express = require('express');
const {
    obtenerConfiguracion,
    listarMisPagos,
    listarCuotasExtraordinarias,
    crearCuotaExtraordinaria,
    desactivarCuotaExtraordinaria,
    obtenerAdeudos,
    reportarPago,
    descargarRecibo, obtenerComprobantePropio, cotizacionMantenimiento, obtenerVigencia, inicializarVigencia, listarPendientes, revisarPago, obtenerComprobante
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
const { crearHistorialController } = require('../controllers/pagos-historial.controller');
const { PagoReportado, ZkTarjeta } = require('../models');
const listarHistorial = crearHistorialController({ PagoReportado, ZkTarjeta,
    PagoAccesoC3: require('../models/PagoAccesoC3'),
    PagoAccesoTagC3: require('../models/PagoAccesoTagC3') });

router.get('/historial', soloAdministracion, listarHistorial);
router.get('/cotizacion', lecturaPagos, cotizacionMantenimiento);
router.get('/vigencia', lecturaPagos, obtenerVigencia);
router.put('/vigencia/:casaId', soloAdministracion, inicializarVigencia);
router.get('/pendientes', soloAdministracion, listarPendientes);
router.get('/:id/comprobante', soloAdministracion, obtenerComprobante);
router.patch('/:id/revision', soloAdministracion, revisarPago);
router.get('/config', lecturaPagos, obtenerConfiguracion);
router.get('/mios', lecturaPagos, listarMisPagos);
router.get('/adeudos', lecturaPagos, obtenerAdeudos);
router.get('/:id/recibo', lecturaPagos, descargarRecibo);
router.get('/:id/comprobante-mio', lecturaPagos, obtenerComprobantePropio);
router.get('/extraordinarias', lecturaPagos, listarCuotasExtraordinarias);
router.post('/extraordinarias', soloAdministracion, crearCuotaExtraordinaria);
router.patch('/extraordinarias/:id/archivar', soloAdministracion, desactivarCuotaExtraordinaria);
router.post('/', lecturaPagos, reportarPago);

module.exports = router;
