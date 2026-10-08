const { DataTypes } = require('sequelize');
const db = require('../config/database');

module.exports = db.define('SolicitudCuenta', {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    usuarioId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, field: 'usuario_id' },
    tipoCuenta: { type: DataTypes.ENUM('CONDOMINO', 'SEGURIDAD'), allowNull: false, field: 'tipo_cuenta' },
    calle: { type: DataTypes.STRING(100), allowNull: true },
    numeroCasa: { type: DataTypes.STRING(20), allowNull: true, field: 'numero_casa' },
    casaSugeridaId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: true, field: 'casa_sugerida_id' },
    tipoVinculo: { type: DataTypes.ENUM('MIEMBRO', 'RESPONSABLE'), allowNull: false, defaultValue: 'MIEMBRO', field: 'tipo_vinculo' },
    estatus: { type: DataTypes.ENUM('PENDIENTE', 'APROBADA', 'RECHAZADA', 'REVOCADA'), allowNull: false, defaultValue: 'PENDIENTE' },
    rolAsignado: { type: DataTypes.STRING(60), allowNull: true, field: 'rol_asignado' },
    revisadoPorUsuarioId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'revisado_por_usuario_id' },
    comentarioRevision: { type: DataTypes.STRING(600), allowNull: true, field: 'comentario_revision' },
    creadoEn: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'creado_en' },
    revisadoEn: { type: DataTypes.DATE, allowNull: true, field: 'revisado_en' }
}, { tableName: 'solicitudes_cuenta', timestamps: false, indexes: [{ fields: ['estatus', 'creado_en', 'id'] }, { fields: ['usuario_id', 'estatus'] }] });
