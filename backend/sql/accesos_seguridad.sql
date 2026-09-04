CREATE TABLE IF NOT EXISTS accesos_seguridad (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    tipo ENUM('VISITA', 'PAQUETERIA', 'TRANSPORTE') NOT NULL,
    nombre VARCHAR(150) NOT NULL,
    telefono VARCHAR(25) NULL,
    identificacion VARCHAR(100) NULL,
    placas VARCHAR(25) NULL,
    proveedor VARCHAR(100) NULL,
    casa_id INT UNSIGNED NOT NULL,
    motivo VARCHAR(180) NULL,
    observaciones TEXT NULL,
    fecha_entrada DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    fecha_salida DATETIME NULL,
    registrado_por_usuario_id BIGINT UNSIGNED NULL,
    salida_registrada_por_usuario_id BIGINT UNSIGNED NULL,
    creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    INDEX idx_accesos_tipo_entrada (tipo, fecha_entrada),
    INDEX idx_accesos_casa_entrada (casa_id, fecha_entrada),
    INDEX idx_accesos_salida (fecha_salida),
    CONSTRAINT fk_accesos_casa FOREIGN KEY (casa_id)
        REFERENCES direcciones(id) ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT fk_accesos_registrado_por FOREIGN KEY (registrado_por_usuario_id)
        REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT fk_accesos_salida_por FOREIGN KEY (salida_registrada_por_usuario_id)
        REFERENCES usuarios(id) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
