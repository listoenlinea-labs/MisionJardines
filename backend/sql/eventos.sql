CREATE TABLE IF NOT EXISTS eventos (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    titulo VARCHAR(160) NOT NULL,
    fecha DATE NOT NULL,
    hora TIME NULL,
    tipo ENUM('mantenimiento', 'asamblea', 'basura', 'seguridad', 'evento')
        NOT NULL DEFAULT 'evento',
    ubicacion VARCHAR(180) NOT NULL,
    descripcion TEXT NULL,
    creado_por_usuario_id BIGINT UNSIGNED NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_eventos_fecha (fecha),
    INDEX idx_eventos_tipo_fecha (tipo, fecha),
    CONSTRAINT fk_eventos_usuario
        FOREIGN KEY (creado_por_usuario_id)
        REFERENCES usuarios(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE
);
