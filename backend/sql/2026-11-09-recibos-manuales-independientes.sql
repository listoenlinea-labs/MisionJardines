-- Generador de recibos MANUALES, independiente de cuotas, pagos y contabilidad.
-- No existen triggers, claves foráneas ni inserciones en tablas financieras.
CREATE TABLE IF NOT EXISTS recibos_manuales (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  folio VARCHAR(70) NOT NULL,
  referencia VARCHAR(80) NOT NULL,
  casa_id INT UNSIGNED DEFAULT NULL COMMENT 'ID opcional solo para precargar datos; snapshot independiente',
  calle VARCHAR(100) NOT NULL,
  inicial_calle CHAR(1) NOT NULL,
  numero_casa VARCHAR(20) NOT NULL,
  nombre VARCHAR(150) NOT NULL,
  mes_folio TINYINT UNSIGNED NOT NULL,
  anio_folio SMALLINT UNSIGNED NOT NULL,
  concepto_pago VARCHAR(150) NOT NULL,
  mes_cubierto TINYINT UNSIGNED NOT NULL,
  anio_cubierto SMALLINT UNSIGNED NOT NULL,
  concepto_detalle VARCHAR(120) NOT NULL,
  monto INT UNSIGNED NOT NULL,
  forma_pago ENUM('EFECTIVO','TRANSFERENCIA') NOT NULL,
  sello VARCHAR(100) NOT NULL,
  fecha_emision DATE NOT NULL,
  creado_por_usuario_id INT UNSIGNED NOT NULL,
  creado_en DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uk_recibos_manuales_folio (folio),
  UNIQUE KEY uk_recibos_manuales_referencia (referencia),
  INDEX idx_recibos_manuales_creado (creado_en, id),
  INDEX idx_recibos_manuales_casa (casa_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
