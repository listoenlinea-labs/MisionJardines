const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Usuario = sequelize.define(
    'Usuario',
    {
        id: {
            type: DataTypes.BIGINT.UNSIGNED,
            primaryKey: true,
            autoIncrement: true
        },

        casaId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
            field: 'casa_id'
        },

        rolId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
            field: 'rol_id'
        },

        nombre: {
            type: DataTypes.STRING(100),
            allowNull: false
        },

        apellidoPaterno: {
            type: DataTypes.STRING(100),
            allowNull: false,
            field: 'apellido_paterno'
        },

        apellidoMaterno: {
            type: DataTypes.STRING(100),
            allowNull: true,
            field: 'apellido_materno'
        },

        telefono: {
            type: DataTypes.STRING(25),
            allowNull: true
        },

        correo: {
            type: DataTypes.STRING(150),
            allowNull: false,
            unique: true,
            validate: {
                isEmail: true
            }
        },

        contrasenaHash: {
            type: DataTypes.STRING(255),
            allowNull: false,
            field: 'contrasena_hash'
        },

        esContactoPrincipal: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            field: 'es_contacto_principal'
        },

        recibeCorreosPago: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            field: 'recibe_correos_pago'
        },

        estatus: {
            type: DataTypes.ENUM(
                'PENDIENTE',
                'ACTIVO',
                'SUSPENDIDO',
                'BLOQUEADO',
                'BAJA'
            ),
            allowNull: false,
            defaultValue: 'PENDIENTE'
        },

        ultimoAccesoEn: {
            type: DataTypes.DATE,
            allowNull: true,
            field: 'ultimo_acceso_en'
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
        tableName: 'usuarios',
        timestamps: false,
        defaultScope: {
            attributes: {
                exclude: ['contrasenaHash']
            }
        },

        scopes: {
            conContrasena: {
                attributes: {
                    include: ['contrasenaHash']
                }
            }
        }
    }
);

module.exports = Usuario;