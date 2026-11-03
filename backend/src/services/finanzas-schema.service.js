'use strict';
const db=require('../config/database');
const {QueryTypes}=require('sequelize');
const Egreso=require('../models/Egreso');
// Agrega nuevas opciones al ENUM conservando todos los valores anteriores;
// no convierte ni elimina gastos existentes.
const opciones=['LUZ','AGUA','JARDINERIA','MANTENIMIENTO','CUOTA_EXTRAORDINARIA','OTROS',
 'PROYECTOS','CFE','SIAPA','INTERNET','SERVICIOS'];
async function asegurarFinanzas(){
 await Egreso.sync();
 const [col]=await db.query("SELECT COLUMN_TYPE FROM information_schema.COLUMNS "+
  "WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='egresos_fraccionamiento' AND COLUMN_NAME='categoria'",
  {type:QueryTypes.SELECT});
 if(!col)throw Error('No se encontró la columna categoria de egresos_fraccionamiento');
 const columnType=String(col.COLUMN_TYPE||'').toUpperCase();
 if(opciones.every(c=>columnType.includes("'"+c+"'")))return;
 // Ejecutar ALTER solo al cambiar el catálogo, no en cada arranque.
 const safe=opciones.map(c=>"'"+c+"'").join(',');
 await db.query('ALTER TABLE egresos_fraccionamiento MODIFY COLUMN categoria ENUM('+safe+') NOT NULL');
}
module.exports={asegurarFinanzas};
