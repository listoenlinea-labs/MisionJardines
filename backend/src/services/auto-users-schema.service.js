const { DataTypes } = require('sequelize');
const db = require('../config/database');
async function asegurarAutoUsers() {
    const qi = db.getQueryInterface(), columns = await qi.describeTable('usuarios');
    const additions = {
        condomino_id: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true,
            references: { model: 'condominos', key: 'id' }, onDelete: 'RESTRICT', onUpdate: 'CASCADE' },
        nombre_usuario: { type: DataTypes.STRING(190), allowNull: true },
        // Existing accounts remain accepted; new preregistrations explicitly use false.
        cuenta_aceptada: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true }
    };
    for (const [name, definition] of Object.entries(additions)) if (!columns[name]) await qi.addColumn('usuarios', name, definition);
    if (!columns.correo.allowNull) await qi.changeColumn('usuarios', 'correo', { type: DataTypes.STRING(150), allowNull: true });
    const indexes = await qi.showIndex('usuarios');
    for (const [field, name] of [['condomino_id', 'uq_usuarios_condomino'], ['nombre_usuario', 'uq_usuarios_nombre_usuario']]) {
        if (!indexes.some(i => i.unique && i.fields.length === 1 && (i.fields[0].attribute || i.fields[0].name) === field)) {
            await qi.addIndex('usuarios', [field], { name, unique: true });
        }
    }
    await require('../models/AutoUserInvitacion').sync();
    await require('../models/AutoUserReporte').sync();
}
module.exports = { asegurarAutoUsers };
