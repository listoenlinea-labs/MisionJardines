'use strict';
const { esViviendaVisible } = require('../services/viviendas-visibles.service');
const crypto = require('crypto');
const { Op } = require('sequelize');
const { Visita, Casa } = require('../models');

const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMINISTRADOR', 'MESA_DIRECTIVA']);
const SECURITY_ROLES = new Set([...ADMIN_ROLES, 'SEGURIDAD']);
const TYPES = new Set(['FAMILIAR', 'AMISTAD', 'PROVEEDOR', 'SERVICIO', 'REPARTIDOR', 'OTRO']);
const STATUS = new Set(['PROGRAMADA', 'EN_CURSO', 'FINALIZADA', 'CANCELADA']);
const text = value => String(value || '').trim();
const isGuard = req => req.usuario.rol === 'SEGURIDAD';
const isManager = req => ADMIN_ROLES.has(req.usuario.rol);
const houseColumns = ['id', 'calle', 'calleCorrecta', 'numero'];

function includeHouse(privateView = false) {
    return [{ model: Casa, as: 'casa', attributes: privateView ? houseColumns : [...houseColumns, 'nombre'] }];
}
function plain(value) {
    return value?.get ? value.get({ plain: true }) : value;
}
// El guardia solo recibe datos imprescindibles para localizar a la visita y
// registrar entrada/salida. Ocultarlos en HTML NO sería suficiente.
function publicForGuard(value) {
    const v = plain(value) || {};
    const house = plain(v.casa) || {};
    return {
        id: v.id,
        nombreVisitante: v.nombreVisitante,
        estatus: v.estatus,
        casa: { calle: house.calleCorrecta || house.calle || '', numero: house.numero || '' }
    };
}
function resultForRole(req, value) {
    return isGuard(req) ? publicForGuard(value) : value;
}
function ownerScope(req, where) {
    if (!SECURITY_ROLES.has(req.usuario.rol)) where.casaId = req.usuario.casaId || -1;
}
function parseDate(value) {
    const parsed = text(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(parsed)) return null;
    const date = new Date(parsed + 'T00:00:00.000Z');
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0,10) === parsed ? parsed : null;
}
async function uniqueCode() {
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const code = `MJ-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        if (!(await Visita.findOne({ where: { codigo: code }, attributes: ['id'] }))) return code;
    }
    throw new Error('No fue posible generar un código único');
}
async function viviendas(req, res) {
    try {
        if (isGuard(req)) return res.status(403).json({ ok: false, message: 'Seguridad solo consulta sus visitas autorizadas' });
        const where = isManager(req) ? {} : { id: req.usuario.casaId || -1 };
        const rows = await Casa.findAll({ where, attributes: houseColumns, order: [['calleCorrecta', 'ASC'], ['numero', 'ASC']] });
        const data = rows.filter(esViviendaVisible).map(value => {
            const h = plain(value);
            return { id: h.id, calle: h.calle, calleCorrecta: h.calleCorrecta, numero: h.numero };
        });
        return res.json({ ok: true, data });
    } catch (error) {
        console.error('Error consultando viviendas para visitas:', error.name);
        return res.status(503).json({ ok: false, message: 'No fue posible consultar las viviendas' });
    }
}
async function pendientes(req, res) {
    try {
        // Se cuentan todas las autorizaciones aún sin entrada, incluso las de
        // fechas anteriores. Nunca las visitas EN_CURSO (ya ingresaron).
        const houses = await Casa.findAll({ attributes: houseColumns });
        const visibles = houses.filter(esViviendaVisible).map(h => plain(h).id);
        if (!visibles.length) return res.json({ ok: true, cantidad: 0 });
        const cantidad = await Visita.count({
            where: { estatus: 'PROGRAMADA', casaId: { [Op.in]: visibles } }
        });
        res.set('Cache-Control', 'private, no-store');
        return res.json({ ok: true, cantidad });
    } catch (error) {
        console.error('Error contando visitas por ingresar:', error.name);
        return res.status(503).json({ ok: false, message: 'No fue posible contar visitas pendientes' });
    }
}
async function list(req, res) {
    try {
        const where = {};
        ownerScope(req, where);
        const requestedStatus = text(req.query.estatus).toUpperCase();
        const requestedType = text(req.query.tipo).toUpperCase();
        if (STATUS.has(requestedStatus)) where.estatus = requestedStatus;
        if (TYPES.has(requestedType)) where.tipo = requestedType;
        const privateView = isGuard(req);
        const include = includeHouse(privateView);
        const calle = text(req.query.calle), numero = text(req.query.numero);
        if ((calle || numero) && SECURITY_ROLES.has(req.usuario.rol)) {
            include[0].where = {};
            if (calle) include[0].where.calleCorrecta = calle;
            if (numero) include[0].where.numero = { [Op.like]: `%${numero}%` };
        }
        const visits = await Visita.findAll({
            where, include,
            ...(privateView ? { attributes: ['id', 'casaId', 'nombreVisitante', 'estatus'] } : {}),
            order: [['fechaProgramada', 'DESC'], ['horaProgramada', 'DESC']],
            limit: 1000
        });
        const visibles = visits.filter(v => !v.casa || esViviendaVisible(v.casa));
        return res.json({ ok: true, total: visibles.length, data: privateView ? visibles.map(publicForGuard) : visibles });
    } catch (error) {
        console.error('Error al consultar visitas:', error.name);
        return res.status(500).json({ ok: false, message: 'No fue posible consultar las visitas' });
    }
}
async function create(req, res) {
    try {
        if (isGuard(req)) return res.status(403).json({ ok: false, message: 'Seguridad no puede autorizar visitas' });
        const casaId = isManager(req) ? Number(req.body.casaId) : Number(req.usuario.casaId);
        if (!isManager(req) && (!req.usuario.casaId || casaId <= 0))
            return res.status(403).json({ ok: false, message: 'Debes tener una vivienda vinculada para registrar visitas' });
        const name = text(req.body.nombreVisitante), authorizedBy = text(req.body.autorizadoPor);
        const date = parseDate(req.body.fechaProgramada);
        const type = text(req.body.tipo).toUpperCase();
        if (!Number.isInteger(casaId) || casaId <= 0 || !name || name.length > 150 ||
            !authorizedBy || authorizedBy.length > 180 || !date || !TYPES.has(type)) {
            return res.status(400).json({ ok: false, message: 'Casa, visitante, autorización, tipo y fecha son obligatorios' });
        }
        const house = await Casa.findByPk(casaId, { attributes: houseColumns });
        if (!house || !esViviendaVisible(house))
            return res.status(404).json({ ok: false, message: 'La vivienda seleccionada no existe' });
        const visit = await Visita.create({
            codigo: await uniqueCode(), casaId, nombreVisitante: name,
            telefono: text(req.body.telefono) || null,
            placas: text(req.body.placas).toUpperCase() || null,
            identificacion: text(req.body.identificacion) || null,
            autorizadoPor: authorizedBy, tipo: type, fechaProgramada: date,
            horaProgramada: /^\d{2}:\d{2}/.test(text(req.body.horaProgramada)) ? text(req.body.horaProgramada).slice(0, 5) : null,
            vigenciaHasta: req.body.vigenciaHasta || null,
            notas: text(req.body.notas) || null,
            creadoPorUsuarioId: req.usuario.usuarioId
        });
        const result = await Visita.findByPk(visit.id, { include: includeHouse() });
        return res.status(201).json({ ok: true, message: 'Visita autorizada correctamente', data: result });
    } catch (error) {
        console.error('Error al registrar visita:', error.name);
        return res.status(500).json({ ok: false, message: 'No fue posible registrar la visita' });
    }
}
async function findAllowed(req, res, statuses) {
    const visit = await Visita.findByPk(req.params.id, { attributes: ['id', 'casaId', 'estatus'] });
    if (!visit) { res.status(404).json({ ok: false, message: 'Visita no encontrada' }); return null; }
    if (!SECURITY_ROLES.has(req.usuario.rol) && Number(visit.casaId) !== Number(req.usuario.casaId)) {
        res.status(403).json({ ok: false, message: 'No tienes permiso sobre esta visita' }); return null;
    }
    if (statuses && !statuses.includes(visit.estatus)) {
        res.status(409).json({ ok: false, message: `La visita se encuentra ${visit.estatus.toLowerCase()}` }); return null;
    }
    return visit;
}
async function transition(req, res, source, next, fields, message) {
    try {
        const visit = await findAllowed(req, res, [source]); if (!visit) return;
        // Actualización condicional atómica: dos guardias no registrarán
        // dos entradas o salidas simultáneas sobre el mismo pase.
        const [affected] = await Visita.update({ estatus: next, ...fields }, {
            where: { id: visit.id, estatus: source }
        });
        if (!affected) return res.status(409).json({ ok: false, message: 'La visita cambió de estado. Actualiza el historial.' });
        const result = await Visita.findByPk(visit.id, {
            include: includeHouse(isGuard(req)),
            ...(isGuard(req) ? { attributes: ['id', 'casaId', 'nombreVisitante', 'estatus'] } : {})
        });
        return res.json({ ok: true, message, data: resultForRole(req, result) });
    } catch (error) {
        console.error('Error al cambiar el estado de visita:', error.name);
        return res.status(500).json({ ok: false, message: 'No fue posible actualizar la visita' });
    }
}
async function enter(req, res) {
    return transition(req, res, 'PROGRAMADA', 'EN_CURSO',
        { fechaEntrada: new Date(), entradaPorUsuarioId: req.usuario.usuarioId }, 'Entrada registrada');
}
async function exit(req, res) {
    return transition(req, res, 'EN_CURSO', 'FINALIZADA',
        { fechaSalida: new Date(), salidaPorUsuarioId: req.usuario.usuarioId }, 'Salida registrada');
}
async function cancel(req, res) {
    if (isGuard(req)) return res.status(403).json({ ok: false, message: 'Seguridad no puede cancelar autorizaciones' });
    return transition(req, res, 'PROGRAMADA', 'CANCELADA', {}, 'Visita cancelada');
}
module.exports = { list, create, enter, exit, cancel, pendientes, viviendas };
