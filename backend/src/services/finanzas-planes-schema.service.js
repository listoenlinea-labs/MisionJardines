'use strict';
// Compatible con la migración SQL del PR #434. Asegura únicamente las dos
// tablas del plan cuando todavía no se han instalado (sin tocar cuotas/pagos).
const db=require('../config/database');
let ready=false, pending=null;
async function asegurarPlanes(){
 if(ready)return;
 if(pending)return pending;
 pending=(async()=>{
  await db.query(`CREATE TABLE IF NOT EXISTS finanzas_planes_mutex (
   id TINYINT UNSIGNED NOT NULL PRIMARY KEY
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  await db.query('INSERT IGNORE INTO finanzas_planes_mutex (id) VALUES (1)');
  await db.query(`CREATE TABLE IF NOT EXISTS finanzas_planes_mensuales (
   periodo CHAR(7) NOT NULL PRIMARY KEY,
   version INT UNSIGNED NOT NULL DEFAULT 1,
   asignaciones JSON NOT NULL,
   observaciones VARCHAR(1200) NOT NULL DEFAULT '',
   actualizado_por BIGINT UNSIGNED NOT NULL,
   creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
   actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
   INDEX ix_finanzas_planes_actualizacion (actualizado_en)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
  ready=true;
 })();
 try{return await pending;}finally{pending=null;}
}
module.exports={asegurarPlanes};
