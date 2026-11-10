-- Para instalaciones existentes si la cuenta Node no puede alterar tablas.
-- Confirmar antes la definición de usuario_id y el índice único de fecha_bloqueada.
ALTER TABLE reservas_casa_club MODIFY COLUMN usuario_id BIGINT UNSIGNED NULL;
