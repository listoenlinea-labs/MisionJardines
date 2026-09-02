const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Condomino = sequelize.define(
    'Condomino',
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true
        },

        origenImportacionId: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: true,
            unique: true,
            field: 'origen_importacion_id'
        },

        direccionId: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            field: 'direccion_id'
        },

        fechaRegistro: {
            type: DataTypes.DATE,
            allowNull: true,
            field: 'fecha_registro'
        },

        nombreCompleto: {
            type: DataTypes.STRING(180),
            allowNull: false,
            field: 'nombre_completo'
        },

        telefono: {
            type: DataTypes.STRING(80),
            allowNull: true
        },

        correo: {
            type: DataTypes.STRING(190),
            allowNull: true
        },

        activo: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
        },

        creadoEn: {
            type: DataTypes.DATE,
            allowNull: false,
            field: 'creado_en'
        },

        actualizadoEn: {
            type: DataTypes.DATE,
            allowNull: false,
            field: 'actualizado_en'
        }
    },
    {
        tableName: 'condominos',
        timestamps: false
    }
);

module.exports = Condomino;
