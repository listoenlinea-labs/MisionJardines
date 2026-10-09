const { DataTypes } = require('sequelize');
const db = require('../config/database');
module.exports = db.define('RecargoMantenimiento', {
  casaId: { type: DataTypes.INTEGER.UNSIGNED, primaryKey: true, field: 'casa_id' },
  corte: { type: DataTypes.DATEONLY, primaryKey: true },
  pagoId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, field: 'pago_id' },
  monto: { type: DataTypes.DECIMAL(12,2), allowNull: false, defaultValue: 50 }
}, { tableName: 'recargos_mantenimiento', timestamps: true });
