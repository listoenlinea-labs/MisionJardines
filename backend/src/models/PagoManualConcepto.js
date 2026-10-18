const { DataTypes } = require('sequelize');
const db = require('../config/database');
module.exports = db.define('PagoManualConcepto', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  casaId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'casa_id' },
  tipoPago: { type: DataTypes.ENUM('EXTRAORDINARIO','CASA_CLUB'), allowNull: false, field: 'tipo_pago' },
  cargoExtraordinarioId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'cargo_extraordinario_id' },
  reservaCasaClubId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true, field: 'reserva_casa_club_id' },
  monto: { type: DataTypes.DECIMAL(12,2), allowNull: false },
  formaPago: { type: DataTypes.ENUM('EFECTIVO','TRANSFERENCIA','DEPOSITO','OTRO'), allowNull: false, field: 'forma_pago' },
  referencia: { type: DataTypes.STRING(120), allowNull: false, unique: true },
  registradoPor: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, field: 'registrado_por' },
  creadoEn: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'creado_en' }
}, { tableName: 'pagos_manuales_concepto', timestamps: false,
  indexes: [{ name: 'uq_pago_manual_cargo', unique: true, fields: ['cargo_extraordinario_id'] },
    { name: 'uq_pago_manual_reserva', unique: true, fields: ['reserva_casa_club_id'] }] });
