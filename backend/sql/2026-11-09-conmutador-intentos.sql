-- Misión Jardines · Historial de intentos de marcado (09-Nov-2026)
-- NO almacena números telefónicos, nombres, correos ni contenido de llamadas.
-- La fecha usa la zona horaria de la sesión MySQL configurada por la aplicación.
CREATE TABLE IF NOT EXISTS conmutador_intentos_llamada (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT NOT NULL,
  grupo VARCHAR(60) NOT NULL,
  numero VARCHAR(12) NOT NULL,
  creado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_conmutador_historial_fecha (creado_en),
  INDEX idx_conmutador_historial_usuario (usuario_id, creado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
