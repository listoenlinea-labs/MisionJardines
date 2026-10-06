const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ZkGateCommand = sequelize.define('ZkGateCommand', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  accion: { type: DataTypes.ENUM('ABRIR','CERRAR'), allowNull: false },
  salidasJson: { type: DataTypes.TEXT, allowNull: false, field: 'salidas_json' },
  pulsoSegundos: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1, field: 'pulso_segundos' },
  estatus: { type: DataTypes.ENUM('PENDIENTE','PROCESANDO','COMPLETADO','ERROR'), allowNull: false, defaultValue: 'PENDIENTE' },
  solicitadoPorUsuarioId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'solicitado_por_usuario_id' },
  resultadoJson: { type: DataTypes.TEXT('long'), allowNull: true, field: 'resultado_json' },
  creadoEn: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'creado_en' },
  tomadoEn: { type: DataTypes.DATE, allowNull: true, field: 'tomado_en' },
  finalizadoEn: { type: DataTypes.DATE, allowNull: true, field: 'finalizado_en' }
}, { tableName: 'zk_gate_commands', timestamps: false });

module.exports = ZkGateCommand;
