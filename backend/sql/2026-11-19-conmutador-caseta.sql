CREATE TABLE IF NOT EXISTS conmutador_caseta (
  id TINYINT UNSIGNED PRIMARY KEY,
  solicitud CHAR(36) NULL,
  usuario_id INT NULL,
  destino CHAR(10) NULL,
  estado VARCHAR(16) NULL,
  vence_en DATETIME(3) NULL,
  reclamo CHAR(36) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT IGNORE INTO conmutador_caseta (id) VALUES (1);
