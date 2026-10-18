-- Consultas de diagnóstico de Análisis de cuotas: solo lectura.
-- Ejecutar después de revisar las tablas instaladas en Hostinger.
-- Nunca actualiza cobros, egresos, reservas, cuotas ni TAGs.
SET SQL_SAFE_UPDATES = 1;
SELECT @@SQL_SAFE_UPDATES AS safe_mode;

-- 1. Verificar existencia y estructura. Si falta alguna tabla o columna,
--    revisar la migración incremental antes de desplegar el nuevo backend.
SHOW TABLES LIKE 'cargos_extraordinarios';
SHOW TABLES LIKE 'pagos_manuales_concepto';
SHOW COLUMNS FROM cuotas_extraordinarias;
SHOW COLUMNS FROM cargos_extraordinarios;
SHOW COLUMNS FROM reservas_casa_club;
SHOW COLUMNS FROM pagos_reportados;
SHOW COLUMNS FROM pagos_manuales_concepto;

-- 2. Egresos de proyectos, diferenciando los programados de los históricos
--    sin cuota asignada: estos últimos NO generan deuda por sí mismos.
SELECT e.id, e.fecha, e.concepto, e.monto AS egreso_total,
       ce.id AS cuota_id, ce.meses, ce.viviendas, ce.fecha_inicio,
       COUNT(c.id) AS cargos_generados,
       COALESCE(SUM(c.monto), 0) AS importe_distribuido
FROM egresos_fraccionamiento e
LEFT JOIN cuotas_extraordinarias ce ON ce.egreso_id = e.id
LEFT JOIN cargos_extraordinarios c ON c.cuota_extraordinaria_id = ce.id
WHERE e.categoria IN ('CUOTA_EXTRAORDINARIA', 'PROYECTOS')
GROUP BY e.id, e.fecha, e.concepto, e.monto, ce.id, ce.meses, ce.viviendas, ce.fecha_inicio
ORDER BY e.fecha DESC, e.id DESC;

-- 3. Resumen de cuotas extraordinarias activas realmente emitidas por casa.
SELECT c.casa_id, COUNT(*) AS cargos, SUM(c.monto) AS total_programado
FROM cargos_extraordinarios c
JOIN cuotas_extraordinarias ce ON ce.id = c.cuota_extraordinaria_id AND ce.activo = 1
GROUP BY c.casa_id ORDER BY c.casa_id LIMIT 30;

-- 4. Reservas que podrían generar saldo. Pendientes de aprobación y
--    canceladas quedan fuera del cálculo de Casa club.
SELECT casa_id, estatus, pagado, fecha, fecha_limite_pago,
       cuota_recuperacion, deposito_garantia, limpieza
FROM reservas_casa_club
WHERE estatus = 'APROBADA'
ORDER BY fecha DESC LIMIT 30;

-- 5. Pagos manuales segregados por tipo para auditar montos sin mezclarlos.
SELECT tipo_pago, COUNT(*) AS pagos, SUM(monto) AS total_cobrado
FROM pagos_manuales_concepto
GROUP BY tipo_pago;

SELECT @@SQL_SAFE_UPDATES AS safe_mode_final;
