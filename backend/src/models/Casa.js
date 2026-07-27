const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Casa = sequelize.define(
    'Casa',
    {
        id: {
            type: DataTypes.BIGINT.UNSIGNED,
            primaryKey: true,
            autoIncrement: true
        },

        codigoCasa: {
            type: DataTypes.STRING(20),
            allowNull: false,
            unique: true,
            field: 'codigo_casa'
        },

        numeroCasa: {
            type: DataTypes.STRING(20),
            allowNull: false,
            field: 'numero_casa'
        },

        calle: {
            type: DataTypes.STRING(100),
            allowNull: false
        },

        manzana: {
            type: DataTypes.STRING(20),
            allowNull: true
        },

        lote: {
            type: DataTypes.STRING(20),
            allowNull: true
        },

        correoPrincipal: {
            type: DataTypes.STRING(150),
            allowNull: true,
            field: 'correo_principal'
        },

        telefonoPrincipal: {
            type: DataTypes.STRING(25),
            allowNull: true,
            field: 'telefono_principal'
        },

        estatus: {
            type: DataTypes.ENUM(
                'ACTIVA',
                'INACTIVA',
                'DESHABITADA',
                'RENTADA',
                'BLOQUEADA'
            ),
            allowNull: false,
            defaultValue: 'ACTIVA'
        },

        motivoBloqueo: {
            type: DataTypes.STRING(500),
            allowNull: true,
            field: 'motivo_bloqueo'
        },

        observaciones: {
            type: DataTypes.TEXT,
            allowNull: true
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
        tableName: 'casas',
        timestamps: false
    }
);

module.exports = Casa;