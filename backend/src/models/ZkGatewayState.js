const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ZkGatewayState = sequelize.define('ZkGatewayState', {
  clave: { type: DataTypes.STRING(40), primaryKey: true, defaultValue: 'principal' },
  ultimaSenal: { type: DataTypes.DATE, allowNull: true, field: 'ultima_senal' },
  dispositivoConectado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'dispositivo_conectado' },
  serial: { type: DataTypes.STRING(120), allowNull: true },
  firmware: { type: DataTypes.STRING(120), allowNull: true },
  lockCount: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'lock_count' },
  ultimoError: { type: DataTypes.TEXT, allowNull: true, field: 'ultimo_error' }
}, { tableName: 'zk_gateway_state', timestamps: false });

module.exports = ZkGatewayState;
