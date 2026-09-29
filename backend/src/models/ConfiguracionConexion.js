const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ConfiguracionConexion = sequelize.define('ConfiguracionConexion', {
    id: {
        type: DataTypes.INTEGER.UNSIGNED,
        primaryKey: true,
        autoIncrement: true
    },
    tipo: {
        type: DataTypes.ENUM('PLUMAS', 'CAMARAS', 'TELEFONIA'),
        allowNull: false
    },
    nombre: {
        type: DataTypes.STRING(80),
        allowNull: false,
        defaultValue: 'principal'
    },
    activo: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true
    },
    host: {
        type: DataTypes.STRING(255),
        allowNull: true
    },
    puerto: {
        type: DataTypes.INTEGER.UNSIGNED,
        allowNull: true
    },
    usuario: {
        type: DataTypes.STRING(190),
        allowNull: true
    },
    secreto: {
        type: DataTypes.TEXT,
        allowNull: true
    },
    configuracionJson: {
        type: DataTypes.TEXT('long'),
        allowNull: true,
        field: 'configuracion_json'
    },
    creadoPorUsuarioId: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
        field: 'creado_por_usuario_id'
    },
    actualizadoPorUsuarioId: {
        type: DataTypes.BIGINT.UNSIGNED,
        allowNull: true,
        field: 'actualizado_por_usuario_id'
    }
}, {
    tableName: 'configuraciones_conexion',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
    indexes: [
        { unique: true, fields: ['tipo', 'nombre'] }
    ]
});

module.exports = ConfiguracionConexion;
