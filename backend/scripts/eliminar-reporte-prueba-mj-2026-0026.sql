-- Elimina EXCLUSIVAMENTE MJ-2026-0026 de la vivienda ficticia Prueba TEST-001,
-- siempre que siga PENDIENTE_VALIDACION y sin conciliación bancaria.
-- NO elimina MJ-2026-0020 VALIDADO, cuotas ni movimientos TAGs.
-- Revisar en MySQL Workbench antes de ejecutar sobre producción.
SET @pago_prueba_id = NULL;

START TRANSACTION;
SELECT id INTO @pago_prueba_id
FROM pagos_reportados
WHERE folio_reporte = 'MJ-2026-0026'
  AND calle_snapshot = 'Prueba'
  AND numero_casa_snapshot = 'TEST-001'
  AND monto = 10.00
  AND estatus = 'PENDIENTE_VALIDACION'
  AND fecha_validacion IS NULL
  AND correo_bancario_hash IS NULL
LIMIT 1
FOR UPDATE;

SELECT @pago_prueba_id AS id_que_se_eliminara;

DELETE FROM pagos_reportados
WHERE id = @pago_prueba_id
  AND folio_reporte = 'MJ-2026-0026'
  AND calle_snapshot = 'Prueba'
  AND numero_casa_snapshot = 'TEST-001'
  AND monto = 10.00
  AND estatus = 'PENDIENTE_VALIDACION'
  AND fecha_validacion IS NULL
  AND correo_bancario_hash IS NULL;

SELECT ROW_COUNT() AS registros_eliminados;

-- Confirmar SOLO si registros_eliminados = 1.
-- Si resultó 0 o existe cualquier duda, ejecutar ROLLBACK en la misma sesión.
-- COMMIT;
