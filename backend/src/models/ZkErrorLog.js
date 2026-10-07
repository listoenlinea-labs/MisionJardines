const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ZkErrorLog = sequelize.define('ZkErrorLog', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  accion: { type: DataTypes.STRING(80), allowNull: false },
  metodo: { type: DataTypes.STRING(12), allowNull: true },
  ruta: { type: DataTypes.STRING(255), allowNull: true },
  tarjetaId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'tarjeta_id' },
  numeroTarjeta: { type: DataTypes.STRING(80), allowNull: true, field: 'numero_tarjeta' },
  casaId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'casa_id' },
  usuarioId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'usuario_id' },
  error: { type: DataTypes.TEXT, allowNull: false },
  detalle: { type: DataTypes.TEXT, allowNull: true },
  createdAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'created_at' }
}, {
  tableName: 'zk_error_logs',
  timestamps: false,
  indexes: [
    { name: 'idx_zk_error_logs_created_at', fields: ['created_at'] },
    { name: 'idx_zk_error_logs_accion', fields: ['accion'] }
  ]
});

module.exports = ZkErrorLog;
