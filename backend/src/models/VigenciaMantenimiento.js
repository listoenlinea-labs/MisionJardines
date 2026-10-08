const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
module.exports = sequelize.define('VigenciaMantenimiento', {
    casaId: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, field: 'casa_id' },
    fechaBase: { type: DataTypes.DATEONLY, allowNull: false, field: 'fecha_base' },
    fechaFinal: { type: DataTypes.DATEONLY, allowNull: false, field: 'fecha_final' },
    tarifaMensual: { type: DataTypes.DECIMAL(12, 2), allowNull: false, field: 'tarifa_mensual' },
    principalInicial: { type: DataTypes.DECIMAL(14, 2), allowNull: false, field: 'principal_inicial' },
    principalConfirmado: { type: DataTypes.DECIMAL(14, 2), allowNull: false, field: 'principal_confirmado' },
    saldoParcial: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0, field: 'saldo_parcial' },
    actualizadoPorUsuarioId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'actualizado_por_usuario_id' },
    sincronizacion: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'PENDIENTE' },
    sincronizadoEn: { type: DataTypes.DATE, allowNull: true, field: 'sincronizado_en' },
    proximoIntento: { type: DataTypes.DATE, allowNull: true, field: 'proximo_intento' },
    intentos: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    errorSincronizacion: { type: DataTypes.STRING(1000), allowNull: true, field: 'error_sincronizacion' }
}, { tableName: 'vigencias_mantenimiento', timestamps: true });
