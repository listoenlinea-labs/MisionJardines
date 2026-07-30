const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Evento = sequelize.define(
    'Evento',
    {
        id: {
            type: DataTypes.BIGINT.UNSIGNED,
            primaryKey: true,
            autoIncrement: true
        },
        titulo: {
            type: DataTypes.STRING(160),
            allowNull: false
        },
        fecha: {
            type: DataTypes.DATEONLY,
            allowNull: false
        },
        hora: {
            type: DataTypes.TIME,
            allowNull: true
        },
        tipo: {
            type: DataTypes.ENUM(
                'mantenimiento',
                'asamblea',
                'basura',
                'seguridad',
                'evento'
            ),
            allowNull: false,
            defaultValue: 'evento'
        },
        ubicacion: {
            type: DataTypes.STRING(180),
            allowNull: false
        },
        descripcion: {
            type: DataTypes.TEXT,
            allowNull: true
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
        tableName: 'eventos',
        timestamps: false
    }
);

module.exports = Evento;
