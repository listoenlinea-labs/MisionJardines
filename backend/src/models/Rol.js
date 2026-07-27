const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Rol = sequelize.define(
    'Rol',
    {
        id: {
            type: DataTypes.BIGINT.UNSIGNED,
            primaryKey: true,
            autoIncrement: true
        },

        nombre: {
            type: DataTypes.STRING(60),
            allowNull: false,
            unique: true
        },

        descripcion: {
            type: DataTypes.STRING(300),
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
        tableName: 'roles',
        timestamps: false
    }
);

module.exports = Rol;