-- Observaciones opcionales Asterisk, no altera el conmutador activo.
CREATE TABLE IF NOT EXISTS conmutador_eventos_asterisk (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 solicitud CHAR(36) NOT NULL,
 evento VARCHAR(20) NOT NULL,
 motivo VARCHAR(20) NULL,
 duracion_segundos INT NULL,
 ocurrido_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 UNIQUE KEY uk_conmutador_asterisk_solicitud_evento (solicitud,evento),
 INDEX idx_conmutador_asterisk_solicitud_fecha (solicitud,ocurrido_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
