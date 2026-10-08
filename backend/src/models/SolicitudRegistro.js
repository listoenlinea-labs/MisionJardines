const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SolicitudRegistro = sequelize.define('SolicitudRegistro', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  usuarioId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, unique: true, field: 'usuario_id' },
  casaId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'casa_id' },
  tipoSolicitado: { type: DataTypes.ENUM('CONDOMINO', 'SEGURIDAD'), allowNull: false, field: 'tipo_solicitado' },
  estatus: { type: DataTypes.ENUM('PENDIENTE', 'APROBADA', 'RECHAZADA'), allowNull: false, defaultValue: 'PENDIENTE' },
  rolAsignado: { type: DataTypes.STRING(30), allowNull: true, field: 'rol_asignado' },
  revisadoPorUsuarioId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'revisado_por_usuario_id' },
  comentarioRevision: { type: DataTypes.STRING(600), allowNull: true, field: 'comentario_revision' },
  creadoEn: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'creado_en' },
  revisadoEn: { type: DataTypes.DATE, allowNull: true, field: 'revisado_en' }
}, {
  tableName: 'solicitudes_registro',
  timestamps: false,
  indexes: [{ fields: ['estatus', 'creado_en'] }]
});
module.exports = SolicitudRegistro;
