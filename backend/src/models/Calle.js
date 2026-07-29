const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Calle = sequelize.define(
    'Calle',
    {
        id: {
            type: DataTypes.BIGINT.UNSIGNED,
            primaryKey: true,
            autoIncrement: true
        },

        nombre: {
            type: DataTypes.STRING(120),
            allowNull: false,
            unique: true
        },

        codigo: {
            type: DataTypes.STRING(20),
            allowNull: false,
            unique: true
        },

        activo: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true
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
        tableName: 'calles',
        timestamps: false
    }
);

module.exports = Calle;