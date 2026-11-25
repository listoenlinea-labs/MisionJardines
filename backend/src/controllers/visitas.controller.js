'use strict';
const { esViviendaVisible } = require('../services/viviendas-visibles.service');
const crypto = require('crypto');
const { Op } = require('sequelize');
const { Visita, Casa } = require('../models');
const db = require('../config/database');
const identificationPhoto = require('../services/visitas-identificacion.service');

const ADMIN_ROLES = new Set(['SUPER_ADMIN', 'ADMINISTRADOR', 'MESA_DIRECTIVA']);
const SECURITY_ROLES = new Set([...ADMIN_ROLES, 'SEGURIDAD']);
const TYPES = new Set(['FAMILIAR', 'AMISTAD', 'PROVEEDOR', 'SERVICIO', 'REPARTIDOR', 'OTRO']);
const STATUS = new Set(['PROGRAMADA', 'EN_CURSO', 'FINALIZADA', 'CANCELADA']);
const text = value => String(value || '').trim();
const isGuard = req => req.usuario.rol === 'SEGURIDAD';
const isManager = req => ADMIN_ROLES.has(req.usuario.rol);
const houseColumns = ['id', 'calle', 'calleCorrecta', 'numero'];
const MEXICO_ZONE = 'America/Mexico_City';
function dateTimeMexico(now = new Date()) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
        timeZone: MEXICO_ZONE, year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
    }).formatToParts(now).filter(p => p.type !== 'literal').map(p => [p.type, p.value]));
    return { fecha: `${parts.year}-${parts.month}-${parts.day}`, hora: `${parts.hour}:${parts.minute}` };
}

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
    // Mis visitas: un condómino consulta únicamente las que él registró, no las de vecinos.
    if (req.usuario.rol === 'CONDOMINO') where.creadoPorUsuarioId = req.usuario.usuarioId;
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
        // Solo id/calle/número: nunca datos de residentes para los guardias.
        const where = (isManager(req) || isGuard(req)) ? {} : { id: req.usuario.casaId || -1 };
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
// Consulta puntual y privada: nunca agregar estos datos a /viviendas o a la vista de Seguridad.
async function contactoViviendaAdmin(req, res) {
    try {
        if (!['SUPER_ADMIN', 'ADMINISTRADOR'].includes(req.usuario?.rol))
            return res.status(403).json({ ok: false, message: 'Solo administración puede consultar contactos de viviendas' });
        const id = Number(req.params.id);
        if (!Number.isSafeInteger(id) || id <= 0)
            return res.status(400).json({ ok: false, message: 'Vivienda inválida' });
        const record = await Casa.findByPk(id, {
            attributes: [...houseColumns, 'nombre', 'telefono']
        });
        if (!record || !esViviendaVisible(record))
            return res.status(404).json({ ok: false, message: 'La vivienda seleccionada no existe' });
        const casa = plain(record);
        res.set('Cache-Control', 'private, no-store');
        return res.json({ ok: true, data: {
            nombre: text(casa.nombre) || null,
            telefono: text(casa.telefono) || null
        } });
    } catch (error) {
        console.error('Error consultando contacto de vivienda para administración:', error.name);
        return res.status(503).json({ ok: false, message: 'No fue posible consultar el contacto de la vivienda' });
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
        const visibles = visits.filter(v => (!v.casa || esViviendaVisible(v.casa)) && (!(isGuard(req) || req.usuario.rol === 'CONDOMINO') || v.estatus !== 'CANCELADA'));
        return res.json({ ok: true, total: visibles.length, data: privateView ? visibles.map(publicForGuard) : visibles });
    } catch (error) {
        console.error('Error al consultar visitas:', error.name);
        return res.status(500).json({ ok: false, message: 'No fue posible consultar las visitas' });
    }
}
async function create(req, res) {
    try {
        const guard = isGuard(req);
        const resident = req.usuario.rol === 'CONDOMINO';
        // El administrador utiliza el mismo registro inmediato que caseta cuando
        // llega desde el tablero. No modifica solicitudes tradicionales externas.
        const immediate = guard || resident || (isManager(req) && req.body.registroInmediato === true);
        const casaId = (isManager(req) || guard) ? Number(req.body.casaId) : Number(req.usuario.casaId);
        if (!isManager(req) && !guard && (!req.usuario.casaId || casaId <= 0))
            return res.status(403).json({ ok: false, message: 'Debes tener una vivienda vinculada para registrar visitas' });
        const name = text(req.body.nombreVisitante), authorizedBy = resident ? 'Condómino' : text(req.body.autorizadoPor);
        const timestamp = immediate ? dateTimeMexico() : null;
        const date = immediate ? timestamp.fecha : parseDate(req.body.fechaProgramada);
        const time = immediate ? timestamp.hora : (/^\d{2}:\d{2}/.test(text(req.body.horaProgramada)) ? text(req.body.horaProgramada).slice(0, 5) : null);
        const type = text(req.body.tipo).toUpperCase();
        if (!Number.isSafeInteger(casaId) || casaId <= 0 || !name || name.length > 150 ||
            !authorizedBy || authorizedBy.length > 180 || !date || !TYPES.has(type)) {
            return res.status(400).json({ ok: false, message: 'Casa, visitante, autorización y tipo son obligatorios' });
        }
        if (req.body.identificacionFoto && resident)
            return res.status(403).json({ ok: false, message: 'La fotografía de identificación solo se permite al personal autorizado' });
        if (!immediate && req.body.identificacionFoto)
            return res.status(403).json({ ok: false, message: 'La fotografía solo se admite en el registro inmediato autorizado' });
        const photo = !resident && immediate ? identificationPhoto.validatePhoto(req.body.identificacionFoto) : null;
        const encryptedPhoto = photo ? identificationPhoto.encryptPhoto(photo) : null;
        const house = await Casa.findByPk(casaId, { attributes: houseColumns });
        if (!house || !esViviendaVisible(house))
            return res.status(404).json({ ok: false, message: 'La vivienda seleccionada no existe' });
        const fields = {
            codigo: await uniqueCode(), casaId, nombreVisitante: name,
            telefono: immediate ? null : text(req.body.telefono) || null,
            placas: text(req.body.placas).toUpperCase().slice(0,25) || null,
            identificacion: immediate ? null : text(req.body.identificacion) || null,
            autorizadoPor: authorizedBy, tipo: type, fechaProgramada: date,
            horaProgramada: time,
            vigenciaHasta: immediate ? null : req.body.vigenciaHasta || null,
            notas: immediate ? null : text(req.body.notas) || null,
            creadoPorUsuarioId: req.usuario.usuarioId
        };
        // Foto y visita se guardan en una sola transacción; si falla una, no se publica ninguna.
        const visit = encryptedPhoto
            ? await db.transaction(async transaction => {
                const entry = await Visita.create(fields, { transaction });
                await identificationPhoto.save(entry.id, encryptedPhoto, { transaction });
                return entry;
            })
            : await Visita.create(fields);
        if (guard) {
            return res.status(201).json({
                ok: true, message: 'Visita registrada en caseta',
                data: publicForGuard({ ...plain(visit), casa: plain(house) })
            });
        }
        const result = await Visita.findByPk(visit.id, { include: includeHouse() });
        return res.status(201).json({ ok: true, message: resident ? 'Visita registrada correctamente' : 'Visita autorizada correctamente', data: result });
    } catch (error) {
        console.error('Error al registrar visita:', error.name);
        return res.status(error.status || 500).json({ ok: false, message: error.status ? error.message : 'No fue posible registrar la visita' });
    }
}
async function readIdentificationPhoto(req, res) {
    try {
        if (!['SUPER_ADMIN', 'ADMINISTRADOR'].includes(req.usuario.rol)) return res.status(403).json({ ok: false, message: 'Solo administración puede consultar identificaciones' });
        const id = Number(req.params.id);
        if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ ok: false, message: 'Visita inválida' });
        const image = await identificationPhoto.findForAdmin(id);
        if (!image) return res.status(404).json({ ok: false, message: 'No hay identificación registrada' });
        res.set('Cache-Control', 'private, no-store');
        res.set('X-Content-Type-Options', 'nosniff');
        res.set('Content-Type', image.mime);
        res.set('Content-Disposition', 'inline');
        return res.send(image.bytes);
    } catch (error) {
        console.error('Error al consultar identificación:', error.name);
        return res.status(503).json({ ok: false, message: 'No fue posible consultar identificación' });
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
// Eliminar del listado activo es una cancelación auditada: nunca borrar una entrada real.
async function deleteOwn(req, res) {
    try {
        if (req.usuario.rol !== 'CONDOMINO')
            return res.status(403).json({ ok: false, message: 'Esta acción es exclusiva del condómino' });
        const id=Number(req.params.id),casaId=Number(req.usuario.casaId),userId=Number(req.usuario.usuarioId);
        if (!Number.isSafeInteger(id) || id<=0 || !Number.isSafeInteger(casaId) || casaId<=0)
            return res.status(400).json({ ok: false, message: 'Registro inválido o vivienda sin vincular' });
        const record=await Visita.findByPk(id,{
            attributes:['id','casaId','creadoPorUsuarioId','estatus']
        });
        if (!record || Number(record.casaId)!==casaId || Number(record.creadoPorUsuarioId)!==userId)
            return res.status(404).json({ ok: false, message: 'No se encontró una visita propia' });
        if (record.estatus!=='PROGRAMADA')
            return res.status(409).json({ ok:false, message:'Solo puedes eliminar una visita antes de que ingrese' });
        // CASO CONCURRENTE: evitar cancelar después de que el guardia registre entrada.
        const [affected]=await Visita.update({estatus:'CANCELADA',actualizadoEn:new Date()},{
            where:{id,casaId,creadoPorUsuarioId:userId,estatus:'PROGRAMADA'}
        });
        if (!affected) return res.status(409).json({ok:false,message:'La visita cambió de estado. Actualiza Mis visitas.'});
        res.set('Cache-Control','private, no-store');
        return res.json({ok:true,message:'Registro de visita eliminado',data:{id,estatus:'CANCELADA'}});
    } catch(error) {
        console.error('Error al eliminar registro de visita:',error.name);
        return res.status(500).json({ok:false,message:'No fue posible eliminar el registro'});
    }
}
async function cancel(req, res) {
    if (isGuard(req)) return res.status(403).json({ ok: false, message: 'Seguridad no puede cancelar autorizaciones' });
    if (req.usuario.rol === 'CONDOMINO') return deleteOwn(req,res);
    return transition(req, res, 'PROGRAMADA', 'CANCELADA', {}, 'Visita cancelada');
}
module.exports = { list, create, enter, exit, cancel, deleteOwn, pendientes, viviendas, contactoViviendaAdmin, readIdentificationPhoto };
