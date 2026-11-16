-- Planificación administrativa; NO registra movimientos bancarios ni cambia pagos o egresos.
CREATE TABLE IF NOT EXISTS finanzas_planes_mutex (
 id TINYINT UNSIGNED NOT NULL PRIMARY KEY
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO finanzas_planes_mutex (id) VALUES (1);
CREATE TABLE IF NOT EXISTS finanzas_planes_mensuales (
 periodo CHAR(7) NOT NULL PRIMARY KEY,
 version INT UNSIGNED NOT NULL DEFAULT 1,
 asignaciones JSON NOT NULL,
 observaciones VARCHAR(1200) NOT NULL DEFAULT '',
 actualizado_por BIGINT UNSIGNED NOT NULL,
 creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 INDEX ix_finanzas_planes_actualizacion (actualizado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
