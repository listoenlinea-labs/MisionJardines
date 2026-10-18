const { DataTypes } = require('sequelize');
const db = require('../config/database');

module.exports = db.define('CargoExtraordinario', {
  id: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, autoIncrement: true },
  cuotaExtraordinariaId: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false, field: 'cuota_extraordinaria_id' },
  casaId: { type: DataTypes.INTEGER.UNSIGNED, allowNull: false, field: 'casa_id' },
  periodo: { type: DataTypes.DATEONLY, allowNull: false },
  monto: { type: DataTypes.DECIMAL(12, 2), allowNull: false }
}, { tableName: 'cargos_extraordinarios', timestamps: false,
  indexes: [{ name: 'uq_cargo_cuota_casa_periodo', unique: true, fields: ['cuota_extraordinaria_id','casa_id','periodo'] },
    { name: 'ix_cargo_casa_periodo', fields: ['casa_id','periodo'] }] });
