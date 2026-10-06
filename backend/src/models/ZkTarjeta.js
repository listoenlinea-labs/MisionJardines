const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ZkTarjeta = sequelize.define('ZkTarjeta', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  casaId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'casa_id' },
  numeroTarjeta: { type: DataTypes.STRING(80), allowNull: false, unique: true, field: 'numero_tarjeta' },
  pinDispositivo: { type: DataTypes.STRING(80), allowNull: true, field: 'pin_dispositivo' },
  departamento: { type: DataTypes.STRING(150), allowNull: true },
  fechaInicio: { type: DataTypes.DATEONLY, allowNull: true, field: 'fecha_inicio' },
  fechaFin: { type: DataTypes.DATEONLY, allowNull: true, field: 'fecha_fin' },
  fechaFinOriginal: { type: DataTypes.DATEONLY, allowNull: true, field: 'fecha_fin_original' },
  bloqueado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  ultimaLectura: { type: DataTypes.DATE, allowNull: true, field: 'ultima_lectura' }
}, { tableName: 'zk_tarjetas', timestamps: false });

module.exports = ZkTarjeta;
