'use strict';
const db=require('../config/database');
const {QueryTypes}=require('sequelize');
const Egreso=require('../models/Egreso');
// Agrega nuevas opciones al ENUM conservando todos los valores anteriores;
// no convierte ni elimina gastos existentes.
const opciones=['LUZ','AGUA','JARDINERIA','MANTENIMIENTO','CUOTA_EXTRAORDINARIA','OTROS',
 'PROYECTOS','CFE','SIAPA','INTERNET','SERVICIOS','PROYECTO'];
async function asegurarFinanzas(){
 await Egreso.sync();
 const [col]=await db.query("SELECT COLUMN_TYPE FROM information_schema.COLUMNS "+
  "WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='egresos_fraccionamiento' AND COLUMN_NAME='categoria'",
  {type:QueryTypes.SELECT});
 if(!col)throw Error('No se encontró la columna categoria de egresos_fraccionamiento');
 const columnType=String(col.COLUMN_TYPE||'').toUpperCase();
 if(!opciones.every(c=>columnType.includes("'"+c+"'"))){
 // Ejecutar ALTER solo al cambiar el catálogo, no en cada arranque.
 const safe=opciones.map(c=>"'"+c+"'").join(',');
 await db.query('ALTER TABLE egresos_fraccionamiento MODIFY COLUMN categoria ENUM('+safe+') NOT NULL');
 }
 const columns=await db.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='egresos_fraccionamiento'",{type:QueryTypes.SELECT});
 const names=new Set(columns.map(c=>c.COLUMN_NAME));
 if(!names.has('ambito'))await db.query("ALTER TABLE egresos_fraccionamiento ADD COLUMN ambito ENUM('MANTENIMIENTO','EXTRAORDINARIO','CASA_CLUB') NOT NULL DEFAULT 'MANTENIMIENTO'");
 if(!names.has('proyecto_id'))await db.query('ALTER TABLE egresos_fraccionamiento ADD COLUMN proyecto_id BIGINT UNSIGNED NULL');
 if(!names.has('comprobante_archivo'))await db.query('ALTER TABLE egresos_fraccionamiento ADD COLUMN comprobante_archivo VARCHAR(100) NULL');
 if(!names.has('incluido_presupuesto'))await db.query('ALTER TABLE egresos_fraccionamiento ADD COLUMN incluido_presupuesto TINYINT(1) NOT NULL DEFAULT 1');
 await db.query("UPDATE egresos_fraccionamiento SET ambito='EXTRAORDINARIO' WHERE categoria IN ('CUOTA_EXTRAORDINARIA','PROYECTOS','PROYECTO') AND ambito='MANTENIMIENTO'");
}
module.exports={asegurarFinanzas};
