-- Control preventivo sin plantillas: MAX 900 respuestas por cualquier periodo móvil
-- de 31 días, lo que también limita el mes comercial de Meta sin importar
-- diferencias entre el huso horario de MySQL y la cuenta de Meta.
-- Ejecutar DESPUÉS del SQL original del bot.
-- Lock compartido entre trabajadores/instancias, por número de Meta.
CREATE TABLE IF NOT EXISTS whatsapp_bot_presupuesto_lock (
 numero_meta VARCHAR(64) NOT NULL PRIMARY KEY
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Intentos reservados ANTES de emitir el request de Meta. No se reembolsan
-- por errores de red porque la respuesta pudo haberse entregado.
CREATE TABLE IF NOT EXISTS whatsapp_bot_presupuesto_dias (
 numero_meta VARCHAR(64) NOT NULL,
 dia DATE NOT NULL,
 intentos_reservados INT UNSIGNED NOT NULL DEFAULT 0,
 actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
 PRIMARY KEY (numero_meta, dia)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
