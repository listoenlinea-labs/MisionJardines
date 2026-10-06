const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ZkTarjeta = sequelize.define('ZkTarjeta', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  casaId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'casa_id' },
  uidDispositivo: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'uid_dispositivo' },
  numeroTarjeta: { type: DataTypes.STRING(80), allowNull: false, unique: true, field: 'numero_tarjeta' },
  pinDispositivo: { type: DataTypes.STRING(80), allowNull: true, field: 'pin_dispositivo' },
  nombreDispositivo: { type: DataTypes.STRING(150), allowNull: true, field: 'nombre_dispositivo' },
  departamentoId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'departamento_id' },
  departamento: { type: DataTypes.STRING(150), allowNull: true },
  grupoDispositivo: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'grupo_dispositivo' },
  puertasAutorizadas: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'puertas_autorizadas' },
  timezoneId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'timezone_id' },
  fechaInicio: { type: DataTypes.DATEONLY, allowNull: true, field: 'fecha_inicio' },
  fechaFin: { type: DataTypes.DATEONLY, allowNull: true, field: 'fecha_fin' },
  fechaFinOriginal: { type: DataTypes.DATEONLY, allowNull: true, field: 'fecha_fin_original' },
  bloqueado: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  origen: { type: DataTypes.ENUM('ZKTECO','APP'), allowNull: false, defaultValue: 'ZKTECO' },
  enControlador: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false, field: 'en_controlador' },
  ultimaLectura: { type: DataTypes.DATE, allowNull: true, field: 'ultima_lectura' }
}, { tableName: 'zk_tarjetas', timestamps: false });

module.exports = ZkTarjeta;
