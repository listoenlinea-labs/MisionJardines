const express = require('express');
const rateLimit = require('express-rate-limit');
const { Op } = require('sequelize');
const sequelize = require('../config/database');
const Orden = require('../models/OrdenCaseta');
const Agente = require('../models/AgenteCaseta');
const { autenticarToken } = require('../middlewares/auth.middleware');
const { autorizarRoles } = require('../middlewares/roles.middleware');
const { crearServicio, autenticarAgente } = require('../services/caseta.service');
const servicio = crearServicio({ Orden, Agente, sequelize, Op });
const router = express.Router();
const wrap = fn => async (req, res) => {
    try { res.json({ ok: true, data: await fn(req) }); }
    catch (error) { if (!error.status) console.error('Servicio de caseta:', error.message); res.status(error.status || 503).json({ ok: false, message: error.status ? error.message : 'Servicio de caseta no disponible' }); }
};
const seguridad = [autenticarToken, autorizarRoles('SUPER_ADMIN', 'ADMINISTRADOR', 'SEGURIDAD')];
const agente = (req, res, next) => {
    try { req.agenteId = autenticarAgente(req.headers.authorization); next(); }
    catch (error) { res.status(error.status || 401).json({ ok: false, message: error.message }); }
};
router.get('/estado', ...seguridad, wrap(() => servicio.estado()));
router.post('/ordenes', ...seguridad, rateLimit({ windowMs: 60000, limit: 12, keyGenerator: req => String(req.usuario.usuarioId) }), wrap(req => servicio.crear(req.usuario, req.body)));
router.get('/ordenes/:id', ...seguridad, wrap(req => servicio.consultar(req.params.id)));
router.use('/agente', agente, rateLimit({ windowMs: 900000, limit: 1500, keyGenerator: req => req.agenteId }));
router.post('/agente/reclamar', wrap(req => servicio.reclamar(req.agenteId, req.body.modo)));
router.post('/agente/ordenes/:id/resultado', wrap(req => servicio.confirmar(req.agenteId, req.params.id, req.body)));
module.exports = router;
