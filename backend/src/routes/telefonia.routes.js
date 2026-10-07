const express = require('express');
const { autenticarToken } = require('../middlewares/auth.middleware');
const { autorizarRoles } = require('../middlewares/roles.middleware');
const { TELEFONIA_HABILITADA, obtenerConfiguracion } = require('../config/telefonia');

const router = express.Router();
router.use(autenticarToken);
router.use(autorizarRoles('SUPER_ADMIN', 'ADMINISTRADOR', 'MESA_DIRECTIVA', 'SEGURIDAD'));

router.get('/modo', (_req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ ok: true, habilitada: TELEFONIA_HABILITADA });
});

router.get('/configuracion', (_req, res) => {
    // Contiene credenciales de una extensión restringida, nunca del puerto FXO.
    res.set('Cache-Control', 'no-store');
    try {
        res.json(obtenerConfiguracion());
    } catch (_) {
        res.status(503).json({ ok: false, message: 'La telefonía está activada, pero falta configurar su conexión.' });
    }
});

module.exports = router;
