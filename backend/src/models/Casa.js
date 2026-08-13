const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Casa = sequelize.define(
    'Casa',
    {
        id: {
            type: DataTypes.INTEGER.UNSIGNED,
            primaryKey: true,
            autoIncrement: true
        },

        calle: {
            type: DataTypes.STRING(100),
            allowNull: false
        },

        numero: {
            type: DataTypes.STRING(20),
            allowNull: false
        },

        nombre: {
            type: DataTypes.STRING(150),
            allowNull: true
        },

        controles: {
            type: DataTypes.STRING(255),
            allowNull: true
        },

        pago: {
            type: DataTypes.ENUM(
                'ANUAL',
                'MENSUAL',
                'CONVENIO',
                'OTRO'
            ),
            allowNull: true
        },

        enRenta: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            field: 'en_renta'
        },

        telefono: {
            type: DataTypes.STRING(25),
            allowNull: true
        },

        correo: {
            type: DataTypes.STRING(150),
            allowNull: true
        },

        observaciones: {
            type: DataTypes.TEXT,
            allowNull: true
        },

        createdAt: {
            type: DataTypes.DATE,
            allowNull: true,
            field: 'created_at'
        },

        updatedAt: {
            type: DataTypes.DATE,
            allowNull: true,
            field: 'updated_at'
        }
    },
    {
        // IMPORTANTE:
        // En MySQL se llama "direcciones", aunque en el backend
        // conceptualmente lo manejemos como Casa.
        tableName: 'direcciones',

        timestamps: false
    }
);

module.exports = Casa;