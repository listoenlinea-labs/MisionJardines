'use strict';
// Migración de UNA sola ejecución al iniciar el backend.
// Las filas guardadas de Casa Club tenían importes distintos a la tarifa
// acordada. Se respaldan los importes originales ANTES de homologar.
// No modifica comprobantes, folios, estatus, fechas ni pagos recibidos.
const db=require('../config/database');
const CLAVE='casa_club_1000_700_300_20261112';
const VALORES=Object.freeze({cuotaRecuperacion:1000,depositoGarantia:700,limpieza:300});
async function homologar(){
 await db.query(`CREATE TABLE IF NOT EXISTS casa_club_migraciones (
  clave VARCHAR(90) NOT NULL PRIMARY KEY,
  aplicada_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
 await db.query(`CREATE TABLE IF NOT EXISTS casa_club_importes_respaldo_20261112 (
  reserva_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  cuota_recuperacion DECIMAL(12,2) NOT NULL,
  deposito_garantia DECIMAL(12,2) NOT NULL,
  limpieza DECIMAL(12,2) NOT NULL,
  pagado TINYINT(1) NOT NULL,
  folio VARCHAR(60) NULL,
  respaldado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
 ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
 return db.transaction(async transaction=>{
  const [ya]=await db.query('SELECT clave FROM casa_club_migraciones WHERE clave=? FOR UPDATE',
   {replacements:[CLAVE],transaction});
  if(ya.length)return {aplicada:false};
  // Snapshot sin tocar pruebas de pago ni respaldos previos.
  await db.query(`INSERT IGNORE INTO casa_club_importes_respaldo_20261112
   (reserva_id,cuota_recuperacion,deposito_garantia,limpieza,pagado,folio)
   SELECT id,cuota_recuperacion,deposito_garantia,limpieza,pagado,folio
   FROM reservas_casa_club`,{transaction});
  const [,meta]=await db.query(`UPDATE reservas_casa_club SET
   cuota_recuperacion=1000,deposito_garantia=700,limpieza=300
   WHERE cuota_recuperacion<>1000 OR deposito_garantia<>700 OR limpieza<>300`,{transaction});
  await db.query(`UPDATE casa_club_tarifas SET
   cuota_recuperacion=1000,deposito_garantia=700,limpieza=300,
   actualizado_en=CURRENT_TIMESTAMP WHERE id=1`,{transaction});
  await db.query('INSERT INTO casa_club_migraciones (clave) VALUES (?)',
   {replacements:[CLAVE],transaction});
  return {aplicada:true,filasActualizadas:Number(meta?.affectedRows??meta?.changedRows??0)};
 });
}
module.exports={homologar,CLAVE,VALORES};
