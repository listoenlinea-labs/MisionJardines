-- ETAPA 1: ejecutar ANTES de desplegar el código que omite direccion_id.
-- Seleccionar primero la base de datos correcta. Guardar respaldo previo.
-- No borra datos ni copia vínculos; permite que convivan ambas versiones durante el despliegue.
SET @cd_existe = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'condominos' AND COLUMN_NAME = 'direccion_id'
);
SET @cd_sql = IF(@cd_existe = 1,
    'ALTER TABLE `condominos` MODIFY COLUMN `direccion_id` INT UNSIGNED NULL DEFAULT NULL',
    'SELECT ''direccion_id ya no existe; preparación innecesaria'' AS resultado'
);
PREPARE cd_stmt FROM @cd_sql;
EXECUTE cd_stmt;
DEALLOCATE PREPARE cd_stmt;

SELECT COLUMN_NAME, COLUMN_TYPE, IS_NULLABLE
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE()
  AND TABLE_NAME = 'condominos' AND COLUMN_NAME = 'direccion_id';
