const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CuotaExtraordinaria = sequelize.define(
    'CuotaExtraordinaria',
    {
        id: {
            type: DataTypes.BIGINT.UNSIGNED,
            primaryKey: true,
            autoIncrement: true
        },
        concepto: {
            type: DataTypes.STRING(300),
            allowNull: false
        },
        monto: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false
        },
        egresoId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, unique: true, field: 'egreso_id' },
        montoTotal: { type: DataTypes.DECIMAL(12,2), allowNull: true, field: 'monto_total' },
        meses: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 1 },
        fechaInicio: { type: DataTypes.DATEONLY, allowNull: true, field: 'fecha_inicio' },
        viviendas: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 231 },
        activo: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },
        creadoPorUsuarioId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
            field: 'creado_por_usuario_id'
        },
        creadoEn: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
            field: 'creado_en'
        },
        actualizadoEn: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
            field: 'actualizado_en'
        }
    },
    {
        tableName: 'cuotas_extraordinarias',
        timestamps: false
    }
);

module.exports = CuotaExtraordinaria;
