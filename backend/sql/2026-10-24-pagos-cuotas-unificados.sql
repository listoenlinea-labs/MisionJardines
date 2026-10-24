-- Ejecutar con la base correcta seleccionada, después de respaldar.
-- MySQL 5.7+/8: solo agrega columnas nullable. No borra ni reescribe datos.
-- El arranque del backend también asegura estas columnas de forma idempotente.
SET @mj_ddl = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='cuotas' AND COLUMN_NAME='recargo_pagado'),
 'SELECT ''cuotas.recargo_pagado ya existe'' AS resultado',
 'ALTER TABLE cuotas ADD COLUMN recargo_pagado DECIMAL(12,2) NULL');
PREPARE mj_stmt FROM @mj_ddl;
EXECUTE mj_stmt;
DEALLOCATE PREPARE mj_stmt;

SET @mj_ddl = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pagos_reportados' AND COLUMN_NAME='aplicacion_cuotas'),
 'SELECT ''pagos_reportados.aplicacion_cuotas ya existe'' AS resultado',
 'ALTER TABLE pagos_reportados ADD COLUMN aplicacion_cuotas JSON NULL');
PREPARE mj_stmt FROM @mj_ddl;
EXECUTE mj_stmt;
DEALLOCATE PREPARE mj_stmt;

SET @mj_ddl = IF(EXISTS(SELECT 1 FROM information_schema.COLUMNS
 WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='pagos_acceso_c3' AND COLUMN_NAME='fecha_objetivo'),
 'SELECT ''pagos_acceso_c3.fecha_objetivo ya existe'' AS resultado',
 'ALTER TABLE pagos_acceso_c3 ADD COLUMN fecha_objetivo DATE NULL');
PREPARE mj_stmt FROM @mj_ddl;
EXECUTE mj_stmt;
DEALLOCATE PREPARE mj_stmt;

-- Reportes pendientes anteriores: revisar ANTES de operar. No se les atribuyen
-- meses automáticamente porque fueron cotizados con otra fuente de fechas.
SELECT id, casa_id, estatus, monto, recargo, fecha_operacion
FROM pagos_reportados
WHERE tipo_pago='MANTENIMIENTO' AND estatus='PENDIENTE_VALIDACION'
  AND aplicacion_cuotas IS NULL;

-- Entregas antiguas aún sin terminar: conservar su auditoría y conciliarlas.
SELECT id, casa_id, origen, origen_id, estado, meses
FROM pagos_acceso_c3
WHERE estado NOT IN ('COMPLETADO','SIN_TAGS');
