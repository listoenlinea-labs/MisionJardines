const { DataTypes } = require('sequelize');
const db = require('../config/database');

// An immutable intent, committed BEFORE TCP. Retries verify this exact intent.
module.exports = db.define('PagoAccesoTagC3', {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    pagoAccesoId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, field: 'pago_acceso_id' },
    tarjetaId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, field: 'tarjeta_id' },
    numeroTarjeta: { type: DataTypes.STRING(80), allowNull: false, field: 'numero_tarjeta' },
    autorizaciones: { type: DataTypes.TEXT, allowNull: true },
    pin: { type: DataTypes.STRING(80), allowNull: true },
    fechaAntes: { type: DataTypes.DATEONLY, allowNull: true, field: 'fecha_antes' },
    fechaDespues: { type: DataTypes.DATEONLY, allowNull: true, field: 'fecha_despues' },
    estado: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'PENDIENTE' },
    error: { type: DataTypes.STRING(1000), allowNull: true }
}, { tableName: 'pagos_acceso_tags_c3', indexes: [
    { unique: true, fields: ['pago_acceso_id', 'tarjeta_id'] }
] });
