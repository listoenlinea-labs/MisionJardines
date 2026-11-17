-- Piloto conversacional de WhatsApp: ejecutar en la BD de Misión Jardines.
-- Las sesiones no guardan contraseñas. El contexto se cifra AES-256-GCM.
CREATE TABLE IF NOT EXISTS whatsapp_bot_sesiones (
 remitente VARCHAR(32) NOT NULL PRIMARY KEY,
 estado VARCHAR(40) NOT NULL DEFAULT 'MENU',
 contexto LONGTEXT NULL,
 actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 KEY ix_whatsapp_sesiones_estado (estado, actualizado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS whatsapp_bot_eventos (
 id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
 mensaje_id VARCHAR(255) NOT NULL,
 remitente VARCHAR(32) NOT NULL,
 tipo VARCHAR(25) NOT NULL,
 payload JSON NOT NULL,
 estado ENUM('PENDIENTE','PROCESANDO','PROCESADO','ERROR') NOT NULL DEFAULT 'PENDIENTE',
 intentos TINYINT UNSIGNED NOT NULL DEFAULT 0,
 procesando_en DATETIME NULL,
 creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
 procesado_en DATETIME NULL,
 UNIQUE KEY uq_whatsapp_bot_mensaje (mensaje_id),
 KEY ix_whatsapp_bot_pendientes (estado, intentos, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
