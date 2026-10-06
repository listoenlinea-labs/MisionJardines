const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ZkAccessCommand = sequelize.define('ZkAccessCommand', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  tipo: { type: DataTypes.ENUM('SINCRONIZAR_USUARIOS','ACTUALIZAR_VIGENCIA'), allowNull: false },
  tarjetaId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'tarjeta_id' },
  payloadJson: { type: DataTypes.TEXT('long'), allowNull: false, field: 'payload_json' },
  estatus: { type: DataTypes.ENUM('PENDIENTE','PROCESANDO','COMPLETADO','ERROR'), allowNull: false, defaultValue: 'PENDIENTE' },
  solicitadoPorUsuarioId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'solicitado_por_usuario_id' },
  resultadoJson: { type: DataTypes.TEXT('long'), allowNull: true, field: 'resultado_json' },
  creadoEn: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'creado_en' },
  tomadoEn: { type: DataTypes.DATE, allowNull: true, field: 'tomado_en' },
  finalizadoEn: { type: DataTypes.DATE, allowNull: true, field: 'finalizado_en' }
}, { tableName: 'zk_access_commands', timestamps: false });

module.exports = ZkAccessCommand;
