-- Historial verificado del Conmutador, Misión Jardines (23-NOV-2026)
-- No contiene teléfonos, nombres ni números de contacto.
-- NUEVO: los intentos antiguos permanecen en conmutador_intentos_llamada.
-- NO migrar automáticamente históricos: nunca se guardó su resultado real.
CREATE TABLE IF NOT EXISTS conmutador_llamadas_seguimiento (
  solicitud CHAR(36) NOT NULL PRIMARY KEY,
  usuario_id INT NOT NULL,
  grupo VARCHAR(60) NOT NULL,
  numero VARCHAR(12) NOT NULL,
  estado VARCHAR(16) NOT NULL DEFAULT 'PENDIENTE',
  creado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  confirmado_en DATETIME(3) NULL,
  INDEX idx_conmutador_seguimiento_fecha (creado_en),
  INDEX idx_conmutador_seguimiento_estado_fecha (estado, creado_en)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Diagnóstico (solo personal autorizado a MySQL):
-- SELECT grupo, numero, estado, creado_en, confirmado_en
-- FROM conmutador_llamadas_seguimiento ORDER BY creado_en DESC LIMIT 100;
-- PENDIENTE + tiempo > 30s sin confirmación = solicitud expirada/no verificada.
-- ENVIADA = agente entregó el archivo a Asterisk, NO significa contestada.
-- FINALIZADA = agente terminó de procesar el archivo, NO confirma contestación.
-- ERROR = el agente comunicó un fallo al preparar la llamada.
