const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Acceso = sequelize.define(
    'Acceso',
    {
        id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
        tipo: {
            type: DataTypes.ENUM('VISITA', 'PAQUETERIA', 'TRANSPORTE'),
            allowNull: false
        },
        nombre: { type: DataTypes.STRING(150), allowNull: false },
        telefono: { type: DataTypes.STRING(25), allowNull: true },
        identificacion: { type: DataTypes.STRING(100), allowNull: true },
        placas: { type: DataTypes.STRING(25), allowNull: true },
        proveedor: { type: DataTypes.STRING(100), allowNull: true },
        casaId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'casa_id' },
        motivo: { type: DataTypes.STRING(180), allowNull: true },
        observaciones: { type: DataTypes.TEXT, allowNull: true },
        fechaEntrada: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
            field: 'fecha_entrada'
        },
        fechaSalida: { type: DataTypes.DATE, allowNull: true, field: 'fecha_salida' },
        registradoPorUsuarioId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
            field: 'registrado_por_usuario_id'
        },
        salidaRegistradaPorUsuarioId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
            field: 'salida_registrada_por_usuario_id'
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
    { tableName: 'accesos_seguridad', timestamps: false }
);

module.exports = Acceso;
