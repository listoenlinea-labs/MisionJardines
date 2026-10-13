const { DataTypes } = require('sequelize');
const db = require('../config/database');
module.exports = db.define('AutoUserInvitacion', {
    usuarioId: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, field: 'usuario_id' },
    tokenHash: { type: DataTypes.STRING(64), allowNull: true, unique: true, field: 'token_hash' },
    expiraEn: { type: DataTypes.DATE, allowNull: true, field: 'expira_en' },
    enviadoEn: { type: DataTypes.DATE, allowNull: true, field: 'enviado_en' },
    envioEstado: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'SIN_ENVIAR', field: 'envio_estado' },
    mensajeId: { type: DataTypes.STRING(190), allowNull: true, field: 'mensaje_id' },
    ultimoError: { type: DataTypes.STRING(500), allowNull: true, field: 'ultimo_error' }
}, { tableName: 'auto_users_invitaciones', timestamps: false });
