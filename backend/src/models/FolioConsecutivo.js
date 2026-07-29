const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const FolioConsecutivo = sequelize.define(
    'FolioConsecutivo',
    {
        anio: {
            type: DataTypes.SMALLINT.UNSIGNED,
            primaryKey: true,
            allowNull: false
        },

        ultimoNumero: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            defaultValue: 0,
            field: 'ultimo_numero'
        },

        actualizadoEn: {
            type: DataTypes.DATE,
            allowNull: false,
            defaultValue: DataTypes.NOW,
            field: 'actualizado_en'
        }
    },
    {
        tableName: 'folios_consecutivos',
        timestamps: false
    }
);

module.exports = FolioConsecutivo;