const { QueryTypes } = require('sequelize');
const db = require('../config/database');
const SolicitudRegistro = require('../models/SolicitudRegistro');

// Runs before accepting registrations. Keeps the original integer type and
// foreign key of usuarios.casa_id; security accounts have no assigned home.
async function asegurarRegistroPublico() {
  const [column] = await db.query(
    `SELECT COLUMN_TYPE AS columnType, IS_NULLABLE AS nullable
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'usuarios' AND COLUMN_NAME = 'casa_id'`,
    { type: QueryTypes.SELECT }
  );
  if (!column) throw new Error('No existe usuarios.casa_id');
  if (column.nullable !== 'YES') {
    if (!/^(int|bigint)(\\(\\d+\\))?( unsigned)?$/i.test(column.columnType)) {
      throw new Error('Tipo inesperado de usuarios.casa_id: revisión manual necesaria');
    }
    await db.query(`ALTER TABLE usuarios MODIFY COLUMN casa_id ${column.columnType} NULL`);
  }
  await SolicitudRegistro.sync();
}
module.exports = { asegurarRegistroPublico };
