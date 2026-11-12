-- Misión Jardines · Tarjetas rojas de Casa Club
-- Ejecutar en Hostinger/MySQL antes o junto con el despliegue del backend.
-- Idempotente: no modifica ni borra reservas ni pagos existentes.
CREATE TABLE IF NOT EXISTS casa_club_sanciones_config (
  id TINYINT UNSIGNED NOT NULL PRIMARY KEY,
  anios_bloqueo INT UNSIGNED NOT NULL DEFAULT 1,
  actualizado_por BIGINT UNSIGNED NULL,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
INSERT IGNORE INTO casa_club_sanciones_config (id,anios_bloqueo) VALUES(1,1);

CREATE TABLE IF NOT EXISTS casa_club_tarjetas_rojas (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  casa_id INT UNSIGNED NOT NULL,
  motivo VARCHAR(500) NOT NULL,
  asignada_por BIGINT UNSIGNED NOT NULL,
  asignada_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  retirada_por BIGINT UNSIGNED NULL,
  retirada_en DATETIME NULL,
  motivo_retiro VARCHAR(500) NULL,
  KEY idx_tarjetas_rojas_casa (casa_id,retirada_en),
  KEY idx_tarjetas_rojas_fecha (asignada_en),
  CONSTRAINT fk_tarjetas_rojas_casa FOREIGN KEY (casa_id) REFERENCES direcciones(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS casa_club_sanciones (
  casa_id INT UNSIGNED NOT NULL PRIMARY KEY,
  bloqueado_desde DATE NULL,
  bloqueado_hasta DATE NULL,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_sanciones_casa FOREIGN KEY (casa_id) REFERENCES direcciones(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
