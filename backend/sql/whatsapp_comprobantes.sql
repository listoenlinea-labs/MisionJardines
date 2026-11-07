CREATE TABLE IF NOT EXISTS whatsapp_comprobantes (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    mensaje_id VARBINARY(255) NOT NULL,
    remitente VARCHAR(32) NOT NULL,
    mime VARCHAR(32) NOT NULL,
    archivo MEDIUMBLOB NOT NULL,
    recibido_en TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_whatsapp_mensaje (mensaje_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
