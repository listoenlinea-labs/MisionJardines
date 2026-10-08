-- Misión Jardines · Casa Club y análisis financiero.
-- Ejecutar una vez en MySQL de Hostinger si la cuenta Node no tiene permisos CREATE.
-- Cambios aditivos: no modifica, elimina ni migra registros existentes.
CREATE TABLE IF NOT EXISTS reservas_casa_club (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 usuario_id BIGINT UNSIGNED NOT NULL,
 casa_id INT UNSIGNED NOT NULL,
 fecha DATE NOT NULL,
 fecha_bloqueada DATE NULL,
 solicitante VARCHAR(180) NOT NULL,
 telefono VARCHAR(25) NOT NULL,
 correo VARCHAR(150) NOT NULL,
 propietario TINYINT(1) NOT NULL DEFAULT 0,
 motivo VARCHAR(200) NOT NULL,
 estatus ENUM('PENDIENTE','APROBADA','RECHAZADA','CANCELADA') NOT NULL DEFAULT 'PENDIENTE',
 cuota_recuperacion DECIMAL(12,2) NOT NULL DEFAULT 0,
 deposito_garantia DECIMAL(12,2) NOT NULL DEFAULT 0,
 garantia_devuelta TINYINT(1) NOT NULL DEFAULT 0,
 limpieza DECIMAL(12,2) NOT NULL DEFAULT 0,
 pagado TINYINT(1) NOT NULL DEFAULT 0,
 fecha_pago DATE NULL,
 folio VARCHAR(60) NULL,
 notas VARCHAR(600) NULL,
 revisado_por BIGINT UNSIGNED NULL,
 creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 UNIQUE KEY uq_casa_club_fecha_bloqueada (fecha_bloqueada),
 INDEX ix_casa_club_casa_fecha (casa_id,fecha),
 INDEX ix_casa_club_estatus_fecha (estatus,fecha)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS egresos_fraccionamiento (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 fecha DATE NOT NULL,
 categoria ENUM('LUZ','AGUA','JARDINERIA','MANTENIMIENTO','PROYECTOS','OTROS') NOT NULL,
 concepto VARCHAR(250) NOT NULL,
 monto DECIMAL(12,2) NOT NULL,
 referencia VARCHAR(120) NULL,
 registrado_por BIGINT UNSIGNED NOT NULL,
 creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 INDEX ix_egresos_fecha_categoria (fecha,categoria)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Validación:
-- SHOW TABLES LIKE 'reservas_casa_club';
-- SHOW TABLES LIKE 'egresos_fraccionamiento';
-- SHOW INDEX FROM reservas_casa_club WHERE Key_name='uq_casa_club_fecha_bloqueada';
