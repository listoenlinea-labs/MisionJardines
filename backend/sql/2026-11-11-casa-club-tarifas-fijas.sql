-- Migración aditiva: aplicar en Hostinger si Node no puede crear tablas.
CREATE TABLE IF NOT EXISTS casa_club_tarifas (
 id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
 cuota_recuperacion DECIMAL(12,2) NOT NULL DEFAULT 700,
 deposito_garantia DECIMAL(12,2) NOT NULL DEFAULT 700,
 limpieza DECIMAL(12,2) NOT NULL DEFAULT 600,
 actualizado_por BIGINT UNSIGNED NULL,
 actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT IGNORE INTO casa_club_tarifas(id,cuota_recuperacion,deposito_garantia,limpieza)
 VALUES(1,700,700,600);
-- No modificar ni actualizar importes de reservas existentes.
