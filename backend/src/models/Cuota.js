const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Cuota = sequelize.define(
    'Cuota',
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

        nombrePagador: {
            type: DataTypes.STRING(250),
            allowNull: true,
            field: 'nombre_pagador'
        },

        numeroCasaSnapshot: {
            type: DataTypes.STRING(30),
            allowNull: true,
            field: 'numero_casa_snapshot'
        },

        calleSnapshot: {
            type: DataTypes.STRING(120),
            allowNull: true,
            field: 'calle_snapshot'
        },

        anio: {
            type: DataTypes.SMALLINT.UNSIGNED,
            allowNull: false
        },

        mes: {
            type: DataTypes.ENUM(
                'ENERO',
                'FEBRERO',
                'MARZO',
                'ABRIL',
                'MAYO',
                'JUNIO',
                'JULIO',
                'AGOSTO',
                'SEPTIEMBRE',
                'OCTUBRE',
                'NOVIEMBRE',
                'DICIEMBRE'
            ),
            allowNull: false
        },

        montoCuota: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false,
            defaultValue: 0,
            field: 'monto_cuota'
        },

        montoPagado: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false,
            defaultValue: 0,
            field: 'monto_pagado'
        },

        saldoPendiente: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false,
            defaultValue: 0,
            field: 'saldo_pendiente'
        },

        formaPago: {
            type: DataTypes.ENUM(
                'EFECTIVO',
                'TRANSFERENCIA',
                'DEPOSITO',
                'TARJETA',
                'CHEQUE',
                'OTRO'
            ),
            allowNull: true,
            field: 'forma_pago'
        },

        referencia: {
            type: DataTypes.STRING(150),
            allowNull: true
        },

        fechaPago: {
            type: DataTypes.DATE,
            allowNull: true,
            field: 'fecha_pago'
        },

        estatusPago: {
            type: DataTypes.ENUM(
                'PENDIENTE',
                'PAGO_PARCIAL',
                'PAGADO',
                'CANCELADO',
                'CONDONADO'
            ),
            allowNull: false,
            defaultValue: 'PENDIENTE',
            field: 'estatus_pago'
        },

        folio: {
            type: DataTypes.STRING(50),
            allowNull: true,
            unique: true
        },

        reciboPdfUrl: {
            type: DataTypes.STRING(500),
            allowNull: true,
            field: 'recibo_pdf_url'
        },

        correoEnviado: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: false,
            field: 'correo_enviado'
        },

        fechaEnvioCorreo: {
            type: DataTypes.DATE,
            allowNull: true,
            field: 'fecha_envio_correo'
        },

        correoDestino: {
            type: DataTypes.STRING(150),
            allowNull: true,
            field: 'correo_destino'
        },

        confirmadoPorUsuarioId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
            field: 'confirmado_por_usuario_id'
        },

        fechaConfirmacion: {
            type: DataTypes.DATE,
            allowNull: true,
            field: 'fecha_confirmacion'
        },

        observaciones: {
            type: DataTypes.TEXT,
            allowNull: true
        },

        controles: {
            type: DataTypes.STRING(250),
            allowNull: true
        },

        tipoPago: {
            type: DataTypes.STRING(50),
            allowNull: true,
            field: 'tipo_pago'
        },

        origenImportacion: {
            type: DataTypes.STRING(150),
            allowNull: true,
            field: 'origen_importacion'
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
        tableName: 'cuotas',
        timestamps: false,

        indexes: [
            {
                unique: true,
                fields: [
                    'casa_id',
                    'anio',
                    'mes'
                ]
            }
        ]
    }
);

module.exports = Cuota;