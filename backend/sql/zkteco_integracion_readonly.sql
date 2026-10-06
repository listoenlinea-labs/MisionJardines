CREATE TABLE IF NOT EXISTS zk_tarjetas (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
 casa_id INT UNSIGNED NULL,
 numero_tarjeta VARCHAR(80) NOT NULL UNIQUE,
 pin_dispositivo VARCHAR(80) NULL,
 departamento VARCHAR(150) NULL,
 fecha_inicio DATE NULL,
 fecha_fin DATE NULL,
 ultima_lectura DATETIME NULL,
 INDEX idx_zk_tarjetas_casa (casa_id),
 CONSTRAINT fk_zk_tarjetas_casa FOREIGN KEY (casa_id) REFERENCES direcciones(id) ON DELETE SET NULL
);
