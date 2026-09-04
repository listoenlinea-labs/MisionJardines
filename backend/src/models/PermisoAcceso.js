const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PermisoAcceso = sequelize.define(
    'PermisoAcceso',
    {
        id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
        casaId: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            unique: true,
            field: 'casa_id'
        },
        pluma: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        porton1: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'porton_1' },
        porton2: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'porton_2' },
        porton3: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true, field: 'porton_3' },
        actualizadoPorUsuarioId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
            field: 'actualizado_por_usuario_id'
        },
        creadoEn: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'creado_en' },
        actualizadoEn: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'actualizado_en' }
    },
    { tableName: 'permisos_acceso_vivienda', timestamps: false }
);

module.exports = PermisoAcceso;
