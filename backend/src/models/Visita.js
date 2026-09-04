const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Visita = sequelize.define(
    'Visita',
    {
        id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
        codigo: { type: DataTypes.STRING(32), allowNull: false, unique: true },
        casaId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'casa_id' },
        nombreVisitante: { type: DataTypes.STRING(150), allowNull: false, field: 'nombre_visitante' },
        telefono: { type: DataTypes.STRING(25), allowNull: true },
        placas: { type: DataTypes.STRING(25), allowNull: true },
        identificacion: { type: DataTypes.STRING(100), allowNull: true },
        autorizadoPor: { type: DataTypes.STRING(180), allowNull: false, field: 'autorizado_por' },
        tipo: {
            type: DataTypes.ENUM('FAMILIAR', 'AMISTAD', 'PROVEEDOR', 'SERVICIO', 'REPARTIDOR', 'OTRO'),
            allowNull: false,
            defaultValue: 'FAMILIAR'
        },
        fechaProgramada: { type: DataTypes.DATEONLY, allowNull: false, field: 'fecha_programada' },
        horaProgramada: { type: DataTypes.TIME, allowNull: true, field: 'hora_programada' },
        vigenciaHasta: { type: DataTypes.DATE, allowNull: true, field: 'vigencia_hasta' },
        estatus: {
            type: DataTypes.ENUM('PROGRAMADA', 'EN_CURSO', 'FINALIZADA', 'CANCELADA'),
            allowNull: false,
            defaultValue: 'PROGRAMADA'
        },
        notas: { type: DataTypes.TEXT, allowNull: true },
        fechaEntrada: { type: DataTypes.DATE, allowNull: true, field: 'fecha_entrada' },
        fechaSalida: { type: DataTypes.DATE, allowNull: true, field: 'fecha_salida' },
        creadoPorUsuarioId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'creado_por_usuario_id' },
        entradaPorUsuarioId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'entrada_por_usuario_id' },
        salidaPorUsuarioId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'salida_por_usuario_id' },
        creadoEn: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'creado_en' },
        actualizadoEn: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'actualizado_en' }
    },
    { tableName: 'visitas_programadas', timestamps: false }
);

module.exports = Visita;
