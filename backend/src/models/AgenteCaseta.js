const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
module.exports = sequelize.define('AgenteCaseta', {
    id: { type: DataTypes.STRING(80), primaryKey: true },
    ultimoContacto: { type: DataTypes.DATE, allowNull: false },
    modo: { type: DataTypes.STRING(24), allowNull: false }
}, { tableName: 'agentes_caseta', timestamps: false });
