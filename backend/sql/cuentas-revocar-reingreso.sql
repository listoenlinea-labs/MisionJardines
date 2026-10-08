-- Misión Jardines — migración opcional de respaldo para Hostinger.
-- El backend la aplica automáticamente al arrancar si MySQL autoriza ALTER.
-- Ejecutar solo cuando el administrador de MySQL lo requiera; hacer respaldo previo.
-- Las solicitudes históricas se conservan; NUNCA borrar usuarios ni pagos.
-- IMPORTANTE: seleccionar primero la base u327351184_fracc_mj en Workbench.

SET @schema := DATABASE();

-- 1. La versión invalida JWT viejos aun si el mismo usuario vuelve a ser ACTIVO.
SELECT COUNT(*) INTO @has_version
FROM information_schema.COLUMNS
WHERE TABLE_SCHEMA = @schema
  AND TABLE_NAME = 'usuarios'
  AND COLUMN_NAME = 'sesion_version';
SET @ddl := IF(@has_version = 0,
  'ALTER TABLE usuarios ADD COLUMN sesion_version INT UNSIGNED NOT NULL DEFAULT 0',
  'SELECT 1');
PREPARE apply_ddl FROM @ddl;
EXECUTE apply_ddl;
DEALLOCATE PREPARE apply_ddl;

-- 2. Añadir estado REVOCADA a la lista anterior (conserva todas las opciones).
ALTER TABLE solicitudes_cuenta
MODIFY COLUMN estatus ENUM('PENDIENTE','APROBADA','RECHAZADA','REVOCADA')
NOT NULL DEFAULT 'PENDIENTE';

-- 3. Crear un índice normal antes de retirar la restricción de solicitud única
-- por usuario; puede existir una FOREIGN KEY que necesite su propio índice.
SELECT COUNT(*) INTO @has_normal_index
FROM information_schema.STATISTICS
WHERE TABLE_SCHEMA = @schema
  AND TABLE_NAME = 'solicitudes_cuenta'
  AND INDEX_NAME = 'idx_solicitudes_cuenta_usuario';
SET @ddl := IF(@has_normal_index = 0,
  'CREATE INDEX idx_solicitudes_cuenta_usuario ON solicitudes_cuenta(usuario_id)',
  'SELECT 1');
PREPARE apply_ddl FROM @ddl;
EXECUTE apply_ddl;
DEALLOCATE PREPARE apply_ddl;

-- Localizar y quitar SOLO un índice UNIQUE de exactamente usuario_id.
SELECT MAX(INDEX_NAME) INTO @unique_user_index
FROM (
  SELECT INDEX_NAME
  FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = @schema
    AND TABLE_NAME = 'solicitudes_cuenta'
    AND INDEX_NAME <> 'PRIMARY'
  GROUP BY INDEX_NAME
  HAVING COUNT(*) = 1 AND MAX(NON_UNIQUE) = 0 AND MAX(COLUMN_NAME) = 'usuario_id'
) AS t;
SET @ddl := IF(@unique_user_index IS NULL,
  'SELECT 1',
  CONCAT('ALTER TABLE solicitudes_cuenta DROP INDEX `',
    REPLACE(@unique_user_index, '`', '``'), '`'));
PREPARE apply_ddl FROM @ddl;
EXECUTE apply_ddl;
DEALLOCATE PREPARE apply_ddl;

-- 4. Cuentas revocadas previamente: mover histórico de Aprobadas a Eliminadas.
UPDATE solicitudes_cuenta AS s
JOIN usuarios AS u ON u.id = s.usuario_id
SET s.estatus = 'REVOCADA'
WHERE s.estatus = 'APROBADA' AND u.estatus = 'BAJA';

-- Comprobar después del despliegue:
-- SHOW COLUMNS FROM usuarios LIKE 'sesion_version';
-- SHOW COLUMNS FROM solicitudes_cuenta LIKE 'estatus';
-- SHOW INDEX FROM solicitudes_cuenta;
-- SELECT estatus, COUNT(*) FROM solicitudes_cuenta GROUP BY estatus;
