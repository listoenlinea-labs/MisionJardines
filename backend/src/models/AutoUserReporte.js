const { DataTypes } = require('sequelize');
const db = require('../config/database');
module.exports = db.define('AutoUserReporte', {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    usuarioId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, field: 'usuario_id' },
    comentario: { type: DataTypes.STRING(2000), allowNull: false },
    datosReportados: { type: DataTypes.JSON, allowNull: false, field: 'datos_reportados' },
    estatus: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'ABIERTO' },
    creadoEn: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'creado_en' },
    corregidoEn: { type: DataTypes.DATE, allowNull: true, field: 'corregido_en' },
    corregidoPor: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'corregido_por' }
}, { tableName: 'auto_users_reportes', timestamps: false, indexes: [{ fields: ['usuario_id', 'estatus'] }] });
