-- Control preventivo de cuota gratuita de servicio por mes y número Meta.
-- Ejecutar DESPUÉS del SQL del piloto WhatsApp original.
-- Cuenta intentos de salida (incluidos los fallidos), antes de contactar a Meta.
CREATE TABLE IF NOT EXISTS whatsapp_bot_presupuesto (
  periodo CHAR(7) NOT NULL,
  numero_meta VARCHAR(64) NOT NULL,
  intentos_reservados INT UNSIGNED NOT NULL DEFAULT 0,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (periodo, numero_meta)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
