CREATE TABLE IF NOT EXISTS configuraciones_conexion (
    id INT UNSIGNED NOT NULL AUTO_INCREMENT,
    tipo ENUM('PLUMAS','CAMARAS','TELEFONIA') NOT NULL,
    nombre VARCHAR(80) NOT NULL DEFAULT 'principal',
    activo TINYINT(1) NOT NULL DEFAULT 1,
    host VARCHAR(255) NULL,
    puerto INT UNSIGNED NULL,
    usuario VARCHAR(190) NULL,
    secreto TEXT NULL COMMENT 'Valor cifrado por la aplicación (AES-256-GCM)',
    configuracion_json LONGTEXT NULL,
    creado_por_usuario_id BIGINT UNSIGNED NULL,
    actualizado_por_usuario_id BIGINT UNSIGNED NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    PRIMARY KEY (id),
    UNIQUE KEY uq_configuracion_conexion_tipo_nombre (tipo, nombre),
    KEY idx_configuracion_conexion_tipo (tipo),
    KEY idx_configuracion_conexion_activo (activo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
