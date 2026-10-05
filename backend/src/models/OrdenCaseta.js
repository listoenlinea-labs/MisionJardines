const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

module.exports = sequelize.define('OrdenCaseta', {
    id: { type: DataTypes.UUID, primaryKey: true },
    agenteId: { type: DataTypes.STRING(80), allowNull: false },
    usuarioId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    solicitudId: { type: DataTypes.UUID, allowNull: false },
    puerta: { type: DataTypes.INTEGER, allowNull: false },
    duracionSegundos: { type: DataTypes.INTEGER, allowNull: false },
    estado: { type: DataTypes.STRING(24), allowNull: false },
    venceEn: { type: DataTypes.DATE, allowNull: false },
    reclamadaEn: DataTypes.DATE,
    reclamoId: DataTypes.UUID,
    resultado: DataTypes.STRING(500)
}, {
    tableName: 'ordenes_caseta', timestamps: true,
    indexes: [{ unique: true, fields: ['usuarioId', 'solicitudId'] },
        { fields: ['agenteId', 'estado', 'createdAt'] }]
});
