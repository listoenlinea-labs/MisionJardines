const { DataTypes } = require('sequelize');
const db = require('../config/database');
module.exports = db.define('CondominoVivienda', {
    condominoId: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, allowNull: false, field: 'condomino_id' },
    viviendaId: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, allowNull: false, field: 'vivienda_id' },
    activo: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    creadoEn: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'creado_en' },
    actualizadoEn: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'actualizado_en' }
}, { tableName: 'condominos_viviendas', timestamps: false });
