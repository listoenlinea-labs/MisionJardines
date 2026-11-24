'use strict';
const { DataTypes } = require('sequelize');
const db = require('../config/database');

// Fotografías de documentos: tabla separada de visitas_programadas.
// Nunca se incluyen en las consultas comunes de visitas.
module.exports = db.define('VisitaIdentificacionFoto', {
  visitaId: { type: DataTypes.BIGINT.UNSIGNED, primaryKey: true, field: 'visita_id' },
  datosCifrados: { type: DataTypes.BLOB('long'), allowNull: false, field: 'datos_cifrados' },
  nonce: { type: DataTypes.BLOB('tiny'), allowNull: false },
  etiqueta: { type: DataTypes.BLOB('tiny'), allowNull: false },
  mime: { type: DataTypes.STRING(32), allowNull: false },
  creadoEn: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW, field: 'creado_en' }
}, { tableName: 'visitas_identificaciones_fotos', timestamps: false });
