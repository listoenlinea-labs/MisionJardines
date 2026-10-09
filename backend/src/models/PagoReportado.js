const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PagoReportado = sequelize.define(
    'PagoReportado',
    {
        id: {
            type: DataTypes.BIGINT.UNSIGNED,
            primaryKey: true,
            autoIncrement: true
        },
        casaId: {
            type: DataTypes.INTEGER.UNSIGNED,
            allowNull: false,
            field: 'casa_id'
        },
        usuarioId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: false,
            field: 'usuario_id'
        },
        tipoPago: {
            type: DataTypes.ENUM('MANTENIMIENTO', 'EXTRAORDINARIO'),
            allowNull: false,
            defaultValue: 'MANTENIMIENTO',
            field: 'tipo_pago'
        },
        cuotaExtraordinariaId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
            field: 'cuota_extraordinaria_id'
        },
        folioReporte: {
            type: DataTypes.STRING(60),
            allowNull: false,
            unique: true,
            field: 'folio_reporte'
        },
        folioOperacion: {
            type: DataTypes.STRING(180),
            allowNull: false,
            unique: true,
            field: 'folio_operacion'
        },
        fechaOperacion: {
            type: DataTypes.DATEONLY,
            allowNull: false,
            field: 'fecha_operacion'
        },
        horaOperacion: {
            type: DataTypes.TIME,
            allowNull: false,
            field: 'hora_operacion'
        },
        concepto: {
            type: DataTypes.STRING(300),
            allowNull: false
        },
        monto: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false
        },
        montoRequerido: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false,
            defaultValue: 300,
            field: 'monto_requerido'
        },
        cortesRecargo: { type: DataTypes.JSON, allowNull: true, field: 'cortes_recargo' },
        recargo: {
            type: DataTypes.DECIMAL(12, 2),
            allowNull: false,
            defaultValue: 0,
            field: 'recargo'
        },
        calleSnapshot: {
            type: DataTypes.STRING(120),
            allowNull: false,
            field: 'calle_snapshot'
        },
        numeroCasaSnapshot: {
            type: DataTypes.STRING(30),
            allowNull: false,
            field: 'numero_casa_snapshot'
        },
        nombreReportante: {
            type: DataTypes.STRING(250),
            allowNull: true,
            field: 'nombre_reportante'
        },
        comprobanteData: {
            type: DataTypes.TEXT('medium'),
            allowNull: false,
            field: 'comprobante_data'
        },
        comprobanteNombre: {
            type: DataTypes.STRING(255),
            allowNull: true,
            field: 'comprobante_nombre'
        },
        comprobanteMime: {
            type: DataTypes.STRING(100),
            allowNull: true,
            field: 'comprobante_mime'
        },
        textoOcr: {
            type: DataTypes.TEXT,
            allowNull: true,
            field: 'texto_ocr'
        },
        estatus: {
            type: DataTypes.ENUM('PENDIENTE_VALIDACION', 'VALIDADO', 'RECHAZADO'),
            allowNull: false,
            defaultValue: 'PENDIENTE_VALIDACION'
        },
        reciboFolio: {
            type: DataTypes.STRING(50),
            allowNull: true,
            unique: true,
            field: 'recibo_folio'
        },
        reciboPdfUrl: {
            type: DataTypes.STRING(500),
            allowNull: true,
            field: 'recibo_pdf_url'
        },
        reciboPdfData: {
            type: DataTypes.BLOB('long'),
            allowNull: true,
            field: 'recibo_pdf_data'
        },
        reciboPdfNombre: {
            type: DataTypes.STRING(255),
            allowNull: true,
            field: 'recibo_pdf_nombre'
        },
        reciboPdfMime: {
            type: DataTypes.STRING(100),
            allowNull: true,
            field: 'recibo_pdf_mime'
        },
        fechaEmisionRecibo: {
            type: DataTypes.DATE,
            allowNull: true,
            field: 'fecha_emision_recibo'
        },
        observacionesRevision: {
            type: DataTypes.STRING(600),
            allowNull: true,
            field: 'observaciones_revision'
        },
        validadoPorUsuarioId: {
            type: DataTypes.BIGINT.UNSIGNED,
            allowNull: true,
            field: 'validado_por_usuario_id'
        },
        fechaValidacion: {
            type: DataTypes.DATE,
            allowNull: true,
            field: 'fecha_validacion'
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
        tableName: 'pagos_reportados',
        timestamps: false
    }
);

module.exports = PagoReportado;
