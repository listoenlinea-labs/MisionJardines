-- Conserva los archivos anteriores en egresos_fraccionamiento.comprobante_archivo.
-- También se crea por Sequelize.sync() en el arranque.
CREATE TABLE IF NOT EXISTS egresos_comprobantes (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 egreso_id BIGINT UNSIGNED NOT NULL,
 archivo VARCHAR(100) NOT NULL,
 nombre VARCHAR(255) NOT NULL,
 hash VARCHAR(64) NOT NULL,
 subido_por BIGINT UNSIGNED NOT NULL,
 creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 KEY idx_egreso (egreso_id),
 UNIQUE KEY uq_egreso_hash (egreso_id,hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;