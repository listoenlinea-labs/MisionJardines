-- Inventario SOLO administrativo de controles RF PO1000.
-- Seguro para ejecutar más de una vez. CERO controles iniciales.
-- No cambia direcciones, pagos, TAGs, C3-200, ni motores BFT.
CREATE TABLE IF NOT EXISTS controles_remotos_mj (
 id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 casa_id INT UNSIGNED NOT NULL,
 codigo VARCHAR(80) NOT NULL,
 descripcion VARCHAR(160) NULL,
 botones JSON NOT NULL,
 activo TINYINT(1) NOT NULL DEFAULT 1,
 fecha_fin DATE NULL,
 creado_por INT UNSIGNED NULL,
 actualizado_por INT UNSIGNED NULL,
 created_at DATETIME NOT NULL,
 updated_at DATETIME NOT NULL,
 UNIQUE KEY uq_control_remoto_codigo (codigo),
 KEY idx_control_remoto_casa (casa_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS controles_remotos_eventos_mj (
 id INT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 control_id INT UNSIGNED NULL,
 casa_id INT UNSIGNED NULL,
 accion VARCHAR(45) NOT NULL,
 detalle TEXT NULL,
 actor_id INT UNSIGNED NULL,
 created_at DATETIME NOT NULL,
 KEY idx_eventos_control (control_id),
 KEY idx_eventos_fecha (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
