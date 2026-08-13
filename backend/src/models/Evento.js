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
            type: DataTypes.STRING(200),
            allowNull: false
        },
        casaId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
            field: 'casa_id'
        },
        creadoPorUsuarioId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
            field: 'creado_por_usuario_id'
        },
        descripcion: {
            type: DataTypes.TEXT,
            allowNull: true
        },
        tipoEvento: {
            type: DataTypes.ENUM(
                'MANTENIMIENTO',
                'ASAMBLEA',
                'RECOLECCION',
                'SOCIAL',
                'SEGURIDAD',
                'SUSPENSION_SERVICIO',
                'OTRO'
            ),
            allowNull: false,
            field: 'tipo_evento'
        },
        ubicacion: {
            type: DataTypes.STRING(250),
            allowNull: true
        },
        fechaInicio: {
            type: DataTypes.DATE,
            allowNull: false,
            field: 'fecha_inicio'
        },
        fechaFin: {
            type: DataTypes.DATE,
            allowNull: false,
            field: 'fecha_fin'
        },
        todoElDia: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            field: 'todo_el_dia'
        },
        visibilidad: {
            type: DataTypes.ENUM(
                'TODOS',
                'SOLO_CASA',
                'ADMINISTRACION',
                'SEGURIDAD'
            ),
            allowNull: false,
            defaultValue: 'TODOS'
        },
        estatus: {
            type: DataTypes.ENUM(
                'PROGRAMADO',
                'EN_CURSO',
                'FINALIZADO',
                'CANCELADO'
            ),
            allowNull: false,
            defaultValue: 'PROGRAMADO'
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
        tableName: 'calendario',
        timestamps: false
    }
);

module.exports = Evento;
