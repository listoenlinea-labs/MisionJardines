const { Op } = require('sequelize');
const db = require('../config/database');
const { Casa, Condomino } = require('../models');
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
    if (!['ALTA', 'EDITAR'].includes(modo)) throw fallo(400, 'Operación inválida');
    const nombreCompleto = texto(body.nombreCompleto, 150, 'el nombre', true);
    const telefono = texto(body.telefono, 25, 'el teléfono');
    const correo = texto(body.correo, 150, 'el correo')?.toLowerCase() || null;
    if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw fallo(400, 'Correo inválido');
    if (typeof body.enRenta !== 'boolean' || typeof body.actualizarContacto !== 'boolean') throw fallo(400, 'Indica el estado de renta y contacto principal');
    const observaciones = texto(body.observaciones, 3000, 'las observaciones');
    const residenteId = modo === 'ALTA' ? null : identificador(body.residenteId);
    if (body.desvincularUsuarioIds != null && (!Array.isArray(body.desvincularUsuarioIds) || body.desvincularUsuarioIds.length)) {
        throw fallo(400, 'Gestiona las cuentas vinculadas desde Mis viviendas');
    }
    return { modo, nombreCompleto, telefono, correo, enRenta: body.enRenta, observaciones,
        actualizarContacto: body.actualizarContacto, residenteId };
}
async function detalle(actor, casaId) {
    if (!admin(actor.rol)) throw fallo(403, 'Solo Administración puede gestionar residentes');
    casaId = identificador(casaId);
    const casa = await Casa.findByPk(casaId, { attributes: ['id', 'calle', 'calleCorrecta', 'numero', 'nombre', 'telefono', 'correo', 'enRenta', 'observaciones'] });
    if (!casa) throw fallo(404, 'Vivienda no encontrada');
    const residentes = await Condomino.findAll({ where: { direccionId: casaId, activo: true }, order: [['id', 'ASC']] });
    return { casa, residentes };
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
        const now = new Date();
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
        return { residente, casaId };
    });
}
module.exports = { detalle, guardar, validar };
