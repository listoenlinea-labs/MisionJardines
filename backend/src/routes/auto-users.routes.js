const {filtrarViviendasVisibles}=require('../services/viviendas-visibles.service');
const express = require('express');
const rateLimit = require('express-rate-limit');
const { autenticarToken } = require('../middlewares/auth.middleware');
const { autorizarRoles } = require('../middlewares/roles.middleware');
const { crearServicio } = require('../services/auto-users.service');
const db = require('../config/database');
const { Usuario, Condomino, CondominoVivienda, Casa, Rol, UsuarioCasa } = require('../models');
const service = crearServicio({ db, Usuario, Condomino, CondominoVivienda, Casa, Rol, UsuarioCasa,
    Invitacion: require('../models/AutoUserInvitacion'), Reporte: require('../models/AutoUserReporte'),
    correoSender: require('../services/auto-users-email.service') });
const router = express.Router();
const publicLimiter = rateLimit({ windowMs: 15 * 60000, limit: 60, standardHeaders: true, legacyHeaders: false });
const handle = fn => async (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try { return res.json({ ok: true, ...await fn(req) }); }
    catch (error) {
        if (error.name === 'SequelizeForeignKeyConstraintError') return res.status(409).json({ ok: false, message: 'La cuenta tiene registros asociados en otros módulos; no se eliminó ningún dato.' });
        const duplicate = error.name === 'SequelizeUniqueConstraintError';
        if (!error.status && !duplicate && req.path.startsWith('/prueba/')) {
            const code = String(error.original?.code || error.parent?.code || error.name || 'ERROR_INTERNO');
            const safeCode = /^[A-Za-z0-9_]{1,80}$/.test(code) ? code : 'ERROR_INTERNO';
            console.error('[auto-users prueba]', safeCode);
            return res.status(503).json({ ok: false, message: 'No se pudo completar la operación de prueba (' + safeCode + '). Revisa los registros del backend. No se confirmó ningún borrado.' });
        }
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
const phoneLimiter = rateLimit({ windowMs: 15 * 60000, limit: 20, standardHeaders: true, legacyHeaders: false,
    message: { ok: false, message: 'Demasiadas consultas. Espera 15 minutos.' } });
const mailLimiter = rateLimit({ windowMs: 15 * 60000, limit: 6, standardHeaders: true, legacyHeaders: false,
    message: { ok: false, message: 'Demasiados envíos. Revisa el correo o espera 15 minutos.' } });
router.post('/acceso/telefono', phoneLimiter, handle(req => service.consultarTelefono(req.body.telefono)));
router.post('/acceso/enviar', mailLimiter, handle(req => service.enviarPorTelefono(req.body.telefono)));
router.post('/invitacion/consultar', publicLimiter, handle(async req => ({ registro: await service.consultar(req.body.token) })));
router.post('/invitacion/validar', publicLimiter, handle(req => service.validar(req.body.token, req.body)));
router.post('/invitacion/aceptar', publicLimiter, handle(req => service.aceptar(req.body.token, req.body)));
router.post('/invitacion/reportar', publicLimiter, handle(req => service.reportar(req.body.token, req.body.comentario)));
router.use(autenticarToken, autorizarRoles('SUPER_ADMIN', 'ADMINISTRADOR'));
router.get('/prueba/usuarios', handle(req => service.listarPruebas(Math.max(1, number(req.query.pagina, 1)))));
router.patch('/prueba/:id', handle(req => service.editarPrueba(positive(req.params.id), req.body, req.usuario.usuarioId)));
router.delete('/prueba/:id', handle(req => service.borrarPrueba(positive(req.params.id))));
router.get('/prueba/viviendas', handle(async () => ({ viviendas: await service.viviendasPrueba() })));
router.post('/prueba/crear', handle(req => service.crearPrueba(positive(req.body.casaId), req.body.clavePrueba)));
router.post('/prueba/:id/enlace', handle(req => {
    const configured = process.env.AUTO_USERS_FRONTEND_URL;
    if (!configured) {
        let origin;
        try { origin = new URL(req.body.frontendUrl).origin; } catch { /* validated below */ }
        if (!origin || origin !== req.headers.origin) throw Object.assign(new Error('Usa la dirección del portal desde el que abriste esta página.'), { status: 400 });
    }
    return service.enlacePrueba(positive(req.params.id), configured || req.body.frontendUrl);
}));
router.get('/', handle(req => service.listar(Math.max(1, number(req.query.pagina, 1)), Math.max(1, number(req.query.paginaReportes, 1)))));
router.get('/viviendas', handle(async () => ({ viviendas: filtrarViviendasVisibles(await Casa.findAll({ attributes: ['id', 'calle', 'calleCorrecta', 'numero'], order: [['calle', 'ASC'], ['numero', 'ASC']] })) })));
router.get('/config', handle(async () => {
    try { require('../services/auto-users-email.service').configuracion(); return { correoDisponible: true }; }
    catch (error) { return { correoDisponible: false, mensaje: error.message }; }
}));
router.post('/crear', handle(req => service.crearLote(number(req.body.desdeId))));
router.post('/invitaciones', handle(req => service.enviarLote(number(req.body.desdeId))));
router.post('/:id/invitacion', handle(req => service.enviarLote(0, positive(req.params.id))));
router.patch('/:id', handle(req => service.editar(positive(req.params.id), req.body, req.usuario.usuarioId)));
module.exports = router;
