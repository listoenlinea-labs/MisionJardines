const express = require('express');
const rateLimit = require('express-rate-limit');
const { autenticarToken } = require('../middlewares/auth.middleware');
const { autorizarRoles } = require('../middlewares/roles.middleware');
const { crearServicio } = require('../services/auto-users.service');
const db = require('../config/database');
const { Usuario, Condomino, Casa, Rol, UsuarioCasa } = require('../models');
const service = crearServicio({ db, Usuario, Condomino, Casa, Rol, UsuarioCasa,
    Invitacion: require('../models/AutoUserInvitacion'), Reporte: require('../models/AutoUserReporte'),
    whatsapp: require('../services/auto-users-whatsapp.service') });
const router = express.Router();
const publicLimiter = rateLimit({ windowMs: 15 * 60000, limit: 60, standardHeaders: true, legacyHeaders: false });
const handle = fn => async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try { return res.json({ ok: true, ...await fn(req) }); }
    catch (error) {
        const duplicate = error.name === 'SequelizeUniqueConstraintError';
        return res.status(error.status || (duplicate ? 409 : 503)).json({ ok: false,
            message: error.status ? error.message : duplicate ? 'Ese usuario o correo ya está registrado. Revisa los datos.' : 'No fue posible completar la operación. Intenta de nuevo.' });
    }
};
const number = (value, fallback = 0) => {
    const n = value === undefined ? fallback : Number(value);
    if (!Number.isSafeInteger(n) || n < 0) throw Object.assign(new Error('Identificador no válido.'), { status: 400 });
    return n;
};
const positive = value => {
    const n = number(value);
    if (n < 1) throw Object.assign(new Error('Identificador no válido.'), { status: 400 });
    return n;
};
router.post('/invitacion/consultar', publicLimiter, handle(async req => ({ registro: await service.consultar(req.body.token) })));
router.post('/invitacion/aceptar', publicLimiter, handle(req => service.aceptar(req.body.token, req.body)));
router.post('/invitacion/reportar', publicLimiter, handle(req => service.reportar(req.body.token, req.body.comentario)));
router.use(autenticarToken, autorizarRoles('SUPER_ADMIN', 'ADMINISTRADOR'));
router.get('/', handle(req => service.listar(Math.max(1, number(req.query.pagina, 1)), Math.max(1, number(req.query.paginaReportes, 1)))));
router.get('/viviendas', handle(async () => ({ viviendas: await Casa.findAll({ attributes: ['id', 'calle', 'calleCorrecta', 'numero'], order: [['calle', 'ASC'], ['numero', 'ASC']] }) })));
router.get('/config', handle(async () => {
    try { require('../services/auto-users-whatsapp.service').configuracion(); return { whatsappDisponible: true }; }
    catch (error) { return { whatsappDisponible: false, mensaje: error.message }; }
}));
router.post('/crear', handle(req => service.crearLote(number(req.body.desdeId))));
router.post('/invitaciones', handle(req => service.enviarLote(number(req.body.desdeId))));
router.post('/:id/invitacion', handle(req => service.enviarLote(0, positive(req.params.id))));
router.patch('/:id', handle(req => service.editar(positive(req.params.id), req.body, req.usuario.usuarioId)));
module.exports = router;
