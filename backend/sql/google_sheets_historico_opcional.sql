-- Migración OPCIONAL: ejecutar solamente cuando se habilite Google Sheets.
-- No ejecutar en el arranque general de la API / C3-200.
-- Validar en una copia de MySQL y crear respaldo antes de producción.
CREATE TABLE IF NOT EXISTS google_sheets_historico (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  spreadsheet_id VARCHAR(120) NOT NULL,
  tipo ENUM('pagos','ingresos','egresos') NOT NULL,
  fila INT UNSIGNED NOT NULL,
  encabezados JSON NOT NULL,
  valores JSON NOT NULL,
  hash VARCHAR(64) NOT NULL,
  estado ENUM('PENDIENTE_REVISION','REVISADO') NOT NULL DEFAULT 'PENDIENTE_REVISION',
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(id),
  UNIQUE KEY uq_sheets_hist_origen (spreadsheet_id,tipo,fila)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
