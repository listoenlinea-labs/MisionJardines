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
}
module.exports={asegurarProyectosExtraordinarios};
