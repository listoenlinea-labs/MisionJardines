const { DataTypes } = require('sequelize');
const db = require('../config/database');

// Durable payment outbox. Dates in this table are never a source for C3 writes.
module.exports = db.define('PagoAccesoC3', {
    id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
    casaId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'casa_id' },
    claveMovimiento: { type: DataTypes.STRING(90), allowNull: false, field: 'clave_movimiento' },
    origen: { type: DataTypes.STRING(12), allowNull: false },
    origenId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, field: 'origen_id' },
    montoOrigen: { type: DataTypes.DECIMAL(14, 2), allowNull: false, field: 'monto_origen' },
    recargoOrigen: { type: DataTypes.DECIMAL(14, 2), allowNull: false, field: 'recargo_origen' },
    referencia: { type: DataTypes.STRING(150), allowNull: true },
    principalMovimiento: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, field: 'principal_movimiento_centavos' },
    principalAplicado: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, field: 'principal_aplicado_centavos' },
    meses: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false },
    saldoAntes: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'saldo_antes_centavos' },
    saldoDespues: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'saldo_despues_centavos' },
    usuarioId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'usuario_id' },
    estado: { type: DataTypes.STRING(24), allowNull: false, defaultValue: 'PENDIENTE' },
    intentos: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, defaultValue: 0 },
    proximoIntento: { type: DataTypes.DATE, allowNull: true, field: 'proximo_intento' },
    error: { type: DataTypes.STRING(1000), allowNull: true }
}, { tableName: 'pagos_acceso_c3', indexes: [
    { unique: true, fields: ['clave_movimiento', 'principal_movimiento_centavos'] },
    { fields: ['casa_id', 'id'] }, { fields: ['estado', 'proximo_intento'] }
] });
