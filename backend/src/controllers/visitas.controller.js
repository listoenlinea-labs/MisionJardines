const crypto = require('crypto');
const { Op } = require('sequelize');
const { Visita, Casa, Usuario } = require('../models');

const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMINISTRADOR', 'MESA_DIRECTIVA']);
const SECURITY_ROLES = new Set([...ADMIN_ROLES, 'SEGURIDAD']);
const TYPES = new Set(['FAMILIAR', 'AMISTAD', 'PROVEEDOR', 'SERVICIO', 'REPARTIDOR', 'OTRO']);
const STATUS = new Set(['PROGRAMADA', 'EN_CURSO', 'FINALIZADA', 'CANCELADA']);
const text = value => String(value || '').trim();

function includeHouse() {
    return [{ model: Casa, as: 'casa', attributes: ['id', 'calle', 'numero', 'nombre'] }];
}

function ownerScope(req, where) {
    if (!SECURITY_ROLES.has(req.usuario.rol)) where.casaId = req.usuario.casaId || -1;
}

function parseDate(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(text(value)) ? text(value) : null;
}

async function uniqueCode() {
    for (let attempt = 0; attempt < 5; attempt += 1) {
        const code = `MJ-${new Date().getFullYear()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
        if (!(await Visita.findOne({ where: { codigo: code }, attributes: ['id'] }))) return code;
    }
    throw new Error('No fue posible generar un código único');
}

async function list(req, res) {
    try {
        const where = {};
        ownerScope(req, where);
        const requestedStatus = text(req.query.estatus).toUpperCase();
        const requestedType = text(req.query.tipo).toUpperCase();
        if (STATUS.has(requestedStatus)) where.estatus = requestedStatus;
        if (TYPES.has(requestedType)) where.tipo = requestedType;
        const include = includeHouse();
        const calle = text(req.query.calle);
        const numero = text(req.query.numero);
        if ((calle || numero) && SECURITY_ROLES.has(req.usuario.rol)) {
            include[0].where = {};
            if (calle) include[0].where.calle = calle;
            if (numero) include[0].where.numero = { [Op.like]: `%${numero}%` };
        }
        const visits = await Visita.findAll({ where, include, order: [['fechaProgramada', 'DESC'], ['horaProgramada', 'DESC']], limit: 1000 });
        return res.json({ ok: true, total: visits.length, data: visits });
    } catch (error) {
        console.error('Error al consultar visitas:', error);
        return res.status(500).json({ ok: false, message: 'No fue posible consultar las visitas' });
    }
}

async function create(req, res) {
    try {
        const adminOrSecurity = SECURITY_ROLES.has(req.usuario.rol);
        const casaId = adminOrSecurity ? Number(req.body.casaId) : Number(req.usuario.casaId);
        const name = text(req.body.nombreVisitante);
        const authorizedBy = text(req.body.autorizadoPor);
        const date = parseDate(req.body.fechaProgramada);
        const type = text(req.body.tipo).toUpperCase();
        if (!Number.isInteger(casaId) || casaId <= 0 || !name || !authorizedBy || !date || !TYPES.has(type)) {
            return res.status(400).json({ ok: false, message: 'Casa, visitante, autorización, tipo y fecha son obligatorios' });
        }
        const house = await Casa.findByPk(casaId, { attributes: ['id'] });
        if (!house) return res.status(404).json({ ok: false, message: 'La vivienda seleccionada no existe' });
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
        console.error('Error al registrar visita:', error);
        return res.status(500).json({ ok: false, message: 'No fue posible registrar la visita' });
    }
}

async function findAllowed(req, res, statuses) {
    const visit = await Visita.findByPk(req.params.id);
    if (!visit) { res.status(404).json({ ok: false, message: 'Visita no encontrada' }); return null; }
    if (!SECURITY_ROLES.has(req.usuario.rol) && Number(visit.casaId) !== Number(req.usuario.casaId)) {
        res.status(403).json({ ok: false, message: 'No tienes permiso sobre esta visita' }); return null;
    }
    if (statuses && !statuses.includes(visit.estatus)) {
        res.status(409).json({ ok: false, message: `La visita se encuentra ${visit.estatus.toLowerCase()}` }); return null;
    }
    return visit;
}

async function enter(req, res) {
    try {
        const visit = await findAllowed(req, res, ['PROGRAMADA']); if (!visit) return;
        await visit.update({ estatus: 'EN_CURSO', fechaEntrada: new Date(), entradaPorUsuarioId: req.usuario.usuarioId });
        return res.json({ ok: true, message: 'Entrada registrada', data: await Visita.findByPk(visit.id, { include: includeHouse() }) });
    } catch (error) { console.error(error); return res.status(500).json({ ok: false, message: 'No fue posible registrar la entrada' }); }
}

async function exit(req, res) {
    try {
        const visit = await findAllowed(req, res, ['EN_CURSO']); if (!visit) return;
        await visit.update({ estatus: 'FINALIZADA', fechaSalida: new Date(), salidaPorUsuarioId: req.usuario.usuarioId });
        return res.json({ ok: true, message: 'Salida registrada', data: await Visita.findByPk(visit.id, { include: includeHouse() }) });
    } catch (error) { console.error(error); return res.status(500).json({ ok: false, message: 'No fue posible registrar la salida' }); }
}

async function cancel(req, res) {
    try {
        if (req.usuario.rol === 'SEGURIDAD') {
            return res.status(403).json({ ok: false, message: 'Seguridad no puede cancelar autorizaciones' });
        }
        const visit = await findAllowed(req, res, ['PROGRAMADA']); if (!visit) return;
        await visit.update({ estatus: 'CANCELADA' });
        return res.json({ ok: true, message: 'Visita cancelada', data: await Visita.findByPk(visit.id, { include: includeHouse() }) });
    } catch (error) { console.error(error); return res.status(500).json({ ok: false, message: 'No fue posible cancelar la visita' }); }
}

module.exports = { list, create, enter, exit, cancel };
