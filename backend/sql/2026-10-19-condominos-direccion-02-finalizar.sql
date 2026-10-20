-- ETAPA 2: solo DESPUÉS de desplegar el nuevo código en TODAS las instancias,
-- detener trabajos/importadores antiguos y verificar altas/correcciones/pruebas.
-- Ejecutar en ventana sin escrituras concurrentes, con respaldo previo.
-- No usar START TRANSACTION para prometer rollback de ALTER TABLE: DDL confirma implícitamente.
-- No copiar direccion_id otra vez ni activar vínculos inactivos.

SET @cd_existe = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = 'condominos' AND COLUMN_NAME = 'direccion_id'
);
-- Comprueba existencia del par, incluso si se desactivó intencionalmente.
-- Los registros nuevos del código actualizado dejan direccion_id en NULL.
SET @cd_faltantes = NULL;
SET @cd_sql = IF(@cd_existe = 1,
    'SELECT COUNT(*) INTO @cd_faltantes
     FROM condominos c
     LEFT JOIN condominos_viviendas cv
       ON cv.condomino_id = c.id AND cv.vivienda_id = c.direccion_id
     WHERE c.direccion_id IS NOT NULL AND cv.condomino_id IS NULL',
    'SET @cd_faltantes = 0'
);
PREPARE cd_stmt FROM @cd_sql;
EXECUTE cd_stmt;
DEALLOCATE PREPARE cd_stmt;

-- Detener si otra tabla referencia esta columna o una dependencia compuesta requiere revisión.
SET @cd_entrantes = (
    SELECT COUNT(*) FROM information_schema.KEY_COLUMN_USAGE
    WHERE REFERENCED_TABLE_SCHEMA = DATABASE()
      AND REFERENCED_TABLE_NAME = 'condominos' AND REFERENCED_COLUMN_NAME = 'direccion_id'
);
SET @cd_fk_compuestas = (
    SELECT COUNT(*) FROM (
        SELECT CONSTRAINT_NAME
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'condominos'
          AND REFERENCED_TABLE_NAME IS NOT NULL
        GROUP BY CONSTRAINT_NAME
        HAVING SUM(COLUMN_NAME = 'direccion_id') > 0 AND COUNT(*) > 1
    ) AS claves
);
SET @cd_indices_compuestos = (
    SELECT COUNT(*) FROM (
        SELECT INDEX_NAME FROM information_schema.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'condominos'
        GROUP BY INDEX_NAME
        HAVING SUM(COLUMN_NAME = 'direccion_id') > 0 AND COUNT(*) > 1
    ) AS indices
);
SET @cd_triggers = (
    SELECT COUNT(*) FROM information_schema.TRIGGERS
    WHERE TRIGGER_SCHEMA = DATABASE()
      AND ACTION_STATEMENT LIKE '%direccion_id%'
      AND (EVENT_OBJECT_TABLE = 'condominos' OR ACTION_STATEMENT LIKE '%condominos%')
);
SET @cd_vistas = (
    SELECT COUNT(*) FROM information_schema.VIEWS
    WHERE TABLE_SCHEMA = DATABASE()
      AND VIEW_DEFINITION LIKE '%condominos%'
      AND VIEW_DEFINITION LIKE '%direccion_id%'
);

-- Descubrir nombres reales de las FK; no se asumen nombres del modelo.
SELECT GROUP_CONCAT(DISTINCT CONCAT('DROP FOREIGN KEY `',
       REPLACE(CONSTRAINT_NAME, '`', '``'), '`') SEPARATOR ', ')
INTO @cd_fk_drop
FROM information_schema.KEY_COLUMN_USAGE
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'condominos'
  AND COLUMN_NAME = 'direccion_id' AND REFERENCED_TABLE_NAME IS NOT NULL;

SELECT @cd_faltantes AS relaciones_sin_copiar,
       @cd_entrantes AS referencias_entrantes,
       @cd_fk_compuestas AS claves_compuestas,
       @cd_indices_compuestos AS indices_compuestos,
       @cd_triggers AS triggers_a_revisar,
       @cd_vistas AS vistas_a_revisar;

-- Si hay bloqueos devuelve diagnóstico y NO ejecuta ALTER TABLE.
SET @cd_sql = CASE
    WHEN @cd_existe = 0 THEN
        'SELECT ''direccion_id ya fue eliminada'' AS resultado'
    WHEN @cd_faltantes IS NULL
         OR @cd_faltantes + @cd_entrantes + @cd_fk_compuestas + @cd_indices_compuestos
         + @cd_triggers + @cd_vistas > 0 THEN
        'SELECT ''NO SE ELIMINO: revisar los contadores anteriores; no restaurar relaciones automáticamente'' AS resultado'
    ELSE CONCAT('ALTER TABLE `condominos` ',
        IF(@cd_fk_drop IS NULL, '', CONCAT(@cd_fk_drop, ', ')),
        'DROP COLUMN `direccion_id`')
END;
PREPARE cd_stmt FROM @cd_sql;
EXECUTE cd_stmt;
DEALLOCATE PREPARE cd_stmt;

-- Esperado: columna_restante = 0 y relaciones_huerfanas = 0.
SELECT COUNT(*) AS columna_restante FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'condominos' AND COLUMN_NAME = 'direccion_id';
SELECT COUNT(*) AS relaciones_huerfanas
FROM condominos_viviendas cv
LEFT JOIN condominos c ON c.id = cv.condomino_id
LEFT JOIN direcciones d ON d.id = cv.vivienda_id
WHERE c.id IS NULL OR d.id IS NULL;
SELECT COUNT(*) AS relaciones_totales FROM condominos_viviendas;
