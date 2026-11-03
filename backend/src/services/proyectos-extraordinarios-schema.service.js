'use strict';
const db=require('../config/database');
const {QueryTypes}=require('sequelize');
const Aportacion=require('../models/AportacionExtraordinaria');
async function asegurarProyectosExtraordinarios(){
 // Idempotente: conserva las cuotas históricas y no crea cargos ni importaciones automáticamente.
 const cols=await db.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cuotas_extraordinarias' AND COLUMN_NAME='codigo'",{type:QueryTypes.SELECT});
 if(!cols.length)await db.query("ALTER TABLE cuotas_extraordinarias ADD COLUMN codigo VARCHAR(90) NULL");
 const idx=await db.query("SELECT INDEX_NAME FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cuotas_extraordinarias' AND INDEX_NAME='uq_cuota_extra_codigo'",{type:QueryTypes.SELECT});
 if(!idx.length)await db.query("ALTER TABLE cuotas_extraordinarias ADD UNIQUE KEY uq_cuota_extra_codigo (codigo)");
 await Aportacion.sync();
 // Archivo permanente e idempotente de anulaciones, antes de retirar cualquier abono.
 await db.query(`CREATE TABLE IF NOT EXISTS proyectos_aportaciones_anulaciones (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  cuota_extraordinaria_id BIGINT UNSIGNED NOT NULL,
  cargo_extraordinario_id BIGINT UNSIGNED NOT NULL,
  casa_id INT UNSIGNED NOT NULL,
  origen_tipo VARCHAR(20) NOT NULL,
  origen_id BIGINT UNSIGNED NOT NULL,
  referencia VARCHAR(180) NOT NULL,
  monto DECIMAL(12,2) NOT NULL,
  usuario_id BIGINT UNSIGNED NOT NULL,
  datos_originales JSON NOT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_aportacion_anulada (origen_tipo,origen_id),
  INDEX ix_anulacion_proyecto_casa (cuota_extraordinaria_id,casa_id),
  INDEX ix_anulacion_referencia (referencia)
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
 await db.query(`CREATE TABLE IF NOT EXISTS proyectos_cuotas_auditoria (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  cuota_extraordinaria_id BIGINT UNSIGNED NOT NULL,
  casa_id INT UNSIGNED NOT NULL,
  monto_anterior DECIMAL(12,2) NOT NULL,
  monto_nuevo DECIMAL(12,2) NOT NULL,
  usuario_id BIGINT UNSIGNED NOT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX ix_proyecto_auditoria (cuota_extraordinaria_id,casa_id)
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}
module.exports={asegurarProyectosExtraordinarios};
