-- Ejecutar después de 2026-11-17-whatsapp-bot.sql y presupuesto-cero.sql.
-- Los secretos de enlace se almacenan solo como SHA-256 y nunca se guarda la contraseña.
CREATE TABLE IF NOT EXISTS whatsapp_bot_vinculos (
  remitente VARCHAR(32) NOT NULL PRIMARY KEY,
  enlace_hash CHAR(64) NULL,
  enlace_expira_en DATETIME NULL,
  usuario_id BIGINT UNSIGNED NULL,
  casa_id INT UNSIGNED NULL,
  sesion_version INT UNSIGNED NULL,
  autenticado_hasta DATETIME NULL,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY ix_whatsapp_vinculo_usuario (usuario_id, casa_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS whatsapp_bot_pagos (
  pago_id BIGINT UNSIGNED NOT NULL PRIMARY KEY,
  remitente VARCHAR(32) NOT NULL,
  usuario_id BIGINT UNSIGNED NOT NULL,
  casa_id INT UNSIGNED NOT NULL,
  enviado_en DATETIME NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY ix_whatsapp_pagos_pendientes (enviado_en, creado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
