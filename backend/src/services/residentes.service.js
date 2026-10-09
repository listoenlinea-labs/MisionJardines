const { Op } = require('sequelize');
const db = require('../config/database');
const { Casa, Condomino, UsuarioCasa, Usuario, Rol, InvitacionCasa, HistorialVinculo } = require('../models');
const { admin, fallo } = require('./viviendas.service');

function identificador(value) {
    const n = Number(value);
    if (!/^[1-9]\d*$/.test(String(value)) || !Number.isSafeInteger(n)) throw fallo(400, 'Identificador inválido');
    return n;
}
function texto(value, max, nombre, obligatorio = false) {
    if (value != null && typeof value !== 'string') throw fallo(400, `${nombre} inválido`);
    const result = String(value ?? '').trim();
    if (result.length > max || (obligatorio && !result)) throw fallo(400, `Revisa ${nombre} (máximo ${max} caracteres)`);
    return result || null;
}
function validar(body) {
    const modo = body.modo;
    if (!['ALTA', 'EDITAR', 'CAMBIO'].includes(modo)) throw fallo(400, 'Operación inválida');
    const nombreCompleto = texto(body.nombreCompleto, 150, 'el nombre', true);
    const telefono = texto(body.telefono, 25, 'el teléfono');
    const correo = texto(body.correo, 150, 'el correo')?.toLowerCase() || null;
    if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw fallo(400, 'Correo inválido');
    if (typeof body.enRenta !== 'boolean' || typeof body.actualizarContacto !== 'boolean') throw fallo(400, 'Indica el estado de renta y contacto principal');
    const observaciones = texto(body.observaciones, 3000, 'las observaciones');
    const residenteId = modo === 'ALTA' ? null : identificador(body.residenteId);
    const ids = body.desvincularUsuarioIds ?? [];
    if (!Array.isArray(ids) || ids.length > 50) throw fallo(400, 'Selección de cuentas inválida');
    const desvincular = [...new Set(ids.map(identificador))];
    if (modo !== 'CAMBIO' && desvincular.length) throw fallo(400, 'Solo un cambio de inquilino puede retirar cuentas');
    if (modo === 'CAMBIO' && body.confirmarCambio !== true) throw fallo(400, 'Confirma el cambio de inquilino');
    return { modo, nombreCompleto, telefono, correo, enRenta: body.enRenta, observaciones,
        actualizarContacto: modo === 'CAMBIO' || body.actualizarContacto, residenteId, desvincular };
}
async function detalle(actor, casaId) {
    if (!admin(actor.rol)) throw fallo(403, 'Solo Administración puede gestionar residentes');
    casaId = identificador(casaId);
    const casa = await Casa.findByPk(casaId, { attributes: ['id', 'calle', 'calleCorrecta', 'numero', 'nombre', 'telefono', 'correo', 'enRenta', 'observaciones'] });
    if (!casa) throw fallo(404, 'Vivienda no encontrada');
    const residentes = await Condomino.findAll({ where: { direccionId: casaId, activo: true }, order: [['id', 'ASC']] });
    const cuentas = await UsuarioCasa.findAll({ where: { casaId, activo: true },
        include: [{ model: Usuario, as: 'usuario', attributes: ['id', 'nombre', 'apellidoPaterno', 'apellidoMaterno', 'correo', 'estatus'],
            include: [{ model: Rol, as: 'rol', attributes: ['nombre'] }] }], order: [['id', 'ASC']] });
    return { casa, residentes, cuentas };
}
async function guardar(actor, casaId, body) {
    if (!admin(actor.rol)) throw fallo(403, 'Solo Administración puede gestionar residentes');
    casaId = identificador(casaId);
    const data = validar(body);
    return db.transaction({ isolationLevel: 'READ COMMITTED' }, async transaction => {
        const options = { transaction, lock: transaction.LOCK.UPDATE };
        const casa = await Casa.findByPk(casaId, options);
        if (!casa) throw fallo(404, 'Vivienda no encontrada');
        let anterior = null;
        if (data.residenteId) {
            anterior = await Condomino.findOne({ where: { id: data.residenteId, direccionId: casaId, activo: true }, ...options });
            if (!anterior) throw fallo(409, 'El residente ya no está activo en esta vivienda. Actualiza el padrón.');
        }
        const duplicate = await Condomino.findOne({ where: { direccionId: casaId, activo: true,
            nombreCompleto: data.nombreCompleto, ...(data.residenteId ? { id: { [Op.ne]: data.residenteId } } : {}) }, ...options });
        if (duplicate) throw fallo(409, 'Ya existe un residente activo con ese nombre en la vivienda');
        if (data.modo === 'CAMBIO' && anterior.nombreCompleto.trim().toLowerCase() === data.nombreCompleto.toLowerCase() &&
            String(anterior.correo || '').toLowerCase() === String(data.correo || '')) throw fallo(400, 'Para corregir datos de la misma persona, usa Editar residente');
        const now = new Date();
        // Retirar únicamente las cuentas elegidas, conservando el acceso a otras viviendas.
        for (const usuarioId of data.desvincular) {
            const link = await UsuarioCasa.findOne({ where: { casaId, usuarioId, activo: true }, ...options });
            const user = await Usuario.findByPk(usuarioId, { ...options, include: [{ model: Rol, as: 'rol', attributes: ['nombre'] }] });
            if (!link || !user || user.rol?.nombre !== 'CONDOMINO') throw fallo(409, 'Solo puedes retirar cuentas de condóminos vinculadas a esta vivienda');
            await link.update({ activo: false, desvinculadoEn: now }, { transaction });
            await HistorialVinculo.create({ usuarioId, casaId, actorId: actor.usuarioId, tipo: link.tipo, accion: 'DESVINCULAR' }, { transaction });
            await InvitacionCasa.update({ revocadoEn: now }, { where: { casaId, creadoPor: usuarioId, aceptadoEn: null, revocadoEn: null }, transaction });
            if (Number(user.casaId) === casaId) {
                const remaining = await UsuarioCasa.findOne({ where: { usuarioId, activo: true }, order: [['id', 'ASC']], transaction });
                await user.update({ casaId: remaining?.casaId || null }, { transaction });
            }
        }
        if (data.modo === 'CAMBIO') {
            await anterior.update({ activo: false, actualizadoEn: now }, { transaction });
            if (anterior.correo) await InvitacionCasa.update({ revocadoEn: now }, {
                where: { casaId, correo: anterior.correo.trim().toLowerCase(), aceptadoEn: null, revocadoEn: null }, transaction });
        }
        const values = { nombreCompleto: data.nombreCompleto, telefono: data.telefono, correo: data.correo, actualizadoEn: now };
        let residente;
        if (data.modo === 'EDITAR') {
            residente = await anterior.update(values, { transaction });
        } else {
            residente = await Condomino.create({ ...values, direccionId: casaId, activo: true, fechaRegistro: now, creadoEn: now }, { transaction });
        }
        await casa.update({ enRenta: data.enRenta, observaciones: data.observaciones,
            ...(data.actualizarContacto ? { nombre: data.nombreCompleto, telefono: data.telefono, correo: data.correo } : {}) }, { transaction });
        // La vivienda conserva su ID, cuotas, pagos, vigencia y TAGs.
        return { residente, casaId, cuentasDesvinculadas: data.desvincular.length };
    });
}
module.exports = { detalle, guardar, validar };
