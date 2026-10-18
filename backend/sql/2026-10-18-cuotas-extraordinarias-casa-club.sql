-- MISIÓN JARDINES · Migración de pagos por concepto · 18/oct/2026
-- Ejecutar en copia de respaldo y posteriormente en MySQL de Hostinger, ANTES
-- de desplegar el backend de esta rama. DDL hace COMMIT implícito en MySQL:
-- revisar columnas existentes con SHOW CREATE TABLE y no repetir ADD COLUMN.
-- No modifica datos de TAGs, cuotas de mantenimiento ni vigencias C3.

SET SQL_SAFE_UPDATES = 1;
SELECT @@SQL_SAFE_UPDATES AS safe_updates_activado;

-- Primero ampliar ENUM para no truncar proyectos históricos.
ALTER TABLE egresos_fraccionamiento
  MODIFY COLUMN categoria ENUM('LUZ','AGUA','JARDINERIA','MANTENIMIENTO','PROYECTOS','CUOTA_EXTRAORDINARIA','OTROS') NOT NULL;

-- Esta modificación usa la llave primaria (id) y funciona con Safe Updates.
-- NO crea cuotas a partir de egresos antiguos: el administrador debe definir
-- meses y fecha inicial desde Análisis -> "Configurar cobro".
START TRANSACTION;
SELECT id, fecha, concepto, monto FROM egresos_fraccionamiento
 WHERE categoria = 'PROYECTOS' ORDER BY id;
UPDATE egresos_fraccionamiento SET categoria = 'CUOTA_EXTRAORDINARIA'
 WHERE id > 0 AND categoria = 'PROYECTOS';
SELECT ROW_COUNT() AS proyectos_renombrados;
COMMIT;

ALTER TABLE egresos_fraccionamiento
  MODIFY COLUMN categoria ENUM('LUZ','AGUA','JARDINERIA','MANTENIMIENTO','CUOTA_EXTRAORDINARIA','OTROS') NOT NULL;

ALTER TABLE cuotas_extraordinarias
  ADD COLUMN egreso_id BIGINT UNSIGNED NULL,
  ADD COLUMN monto_total DECIMAL(12,2) NULL,
  ADD COLUMN meses INT UNSIGNED NOT NULL DEFAULT 1,
  ADD COLUMN fecha_inicio DATE NULL,
  ADD COLUMN viviendas INT UNSIGNED NOT NULL DEFAULT 231,
  ADD UNIQUE KEY uq_cuota_extraordinaria_egreso (egreso_id);

CREATE TABLE IF NOT EXISTS cargos_extraordinarios (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  cuota_extraordinaria_id BIGINT UNSIGNED NOT NULL,
  casa_id INT UNSIGNED NOT NULL,
  periodo DATE NOT NULL,
  monto DECIMAL(12,2) NOT NULL,
  UNIQUE KEY uq_cargo_cuota_casa_periodo (cuota_extraordinaria_id,casa_id,periodo),
  INDEX ix_cargo_casa_periodo (casa_id,periodo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pagos_manuales_concepto (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  casa_id INT UNSIGNED NOT NULL,
  tipo_pago ENUM('EXTRAORDINARIO','CASA_CLUB') NOT NULL,
  cargo_extraordinario_id BIGINT UNSIGNED NULL,
  reserva_casa_club_id BIGINT UNSIGNED NULL,
  monto DECIMAL(12,2) NOT NULL,
  forma_pago ENUM('EFECTIVO','TRANSFERENCIA','DEPOSITO','OTRO') NOT NULL,
  referencia VARCHAR(120) NOT NULL,
  registrado_por BIGINT UNSIGNED NOT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_pago_manual_referencia (referencia),
  UNIQUE KEY uq_pago_manual_cargo (cargo_extraordinario_id),
  UNIQUE KEY uq_pago_manual_reserva (reserva_casa_club_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

ALTER TABLE pagos_reportados
  MODIFY COLUMN tipo_pago ENUM('MANTENIMIENTO','EXTRAORDINARIO','CASA_CLUB') NOT NULL DEFAULT 'MANTENIMIENTO',
  ADD COLUMN cargo_extraordinario_id BIGINT UNSIGNED NULL,
  ADD COLUMN reserva_casa_club_id BIGINT UNSIGNED NULL,
  ADD INDEX ix_pago_cargo_extraordinario (cargo_extraordinario_id),
  ADD INDEX ix_pago_reserva_casa_club (reserva_casa_club_id);

ALTER TABLE reservas_casa_club ADD COLUMN fecha_limite_pago DATE NULL;

-- Verificación final: no queda categoría PROYECTOS ni se cambiaron los TAGs.
SELECT categoria, COUNT(*) AS egresos, SUM(monto) AS total
 FROM egresos_fraccionamiento GROUP BY categoria ORDER BY categoria;
SHOW COLUMNS FROM cuotas_extraordinarias;
SHOW COLUMNS FROM pagos_reportados;
SHOW COLUMNS FROM reservas_casa_club LIKE 'fecha_limite_pago';
SHOW TABLES LIKE 'cargos_extraordinarios';
SHOW TABLES LIKE 'pagos_manuales_concepto';
SELECT @@SQL_SAFE_UPDATES AS safe_updates_sigue_activo;

