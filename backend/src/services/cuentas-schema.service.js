const { DataTypes } = require('sequelize');
const db = require('../config/database');
const { Rol, SolicitudCuenta, VerificacionCuenta, SolicitudRol } = require('../models');

async function asegurarCuentas() {
    const qi = db.getQueryInterface();
    const columns = await qi.describeTable('usuarios');
    // Match the actual INT UNSIGNED FK to direcciones. No fake house for staff
    // or unverified residents; the membership is granted only on approval.
    if (!columns.casa_id.allowNull) {
        await qi.changeColumn('usuarios', 'casa_id', { type: DataTypes.INTEGER.UNSIGNED, allowNull: true });
    }
    await VerificacionCuenta.sync();
    await SolicitudRol.sync();
    await SolicitudCuenta.sync();
    for (const nombre of ['CONDOMINO', 'SEGURIDAD', 'ADMINISTRADOR']) {
        await Rol.findOrCreate({ where: { nombre }, defaults: { activo: true, descripcion: nombre } });
    }
}
module.exports = { asegurarCuentas };
