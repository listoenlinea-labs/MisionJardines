-- MISION JARDINES - PRUEBA CONTROLADA TEST-001
-- FASE 2: SÓLO DESPUÉS de confirmar (COMMIT) de la FASE 1.
-- Simula un saldo histórico de $340 ABONADOS durante OCTUBRE
-- y deja exactamente $10 pendientes. NO simula un nuevo depósito bancario.
-- No altera ni consulta código ZKTeco, ni reescribe pagos_reportados.

SET @casa_id_prueba := (
 SELECT MIN(d.id)
 FROM direcciones d JOIN usuarios u ON u.casa_id=d.id
 WHERE LOWER(TRIM(u.correo))='condomino.prueba@example.invalid'
  AND LOWER(TRIM(d.calle))='prueba'
  AND UPPER(TRIM(d.numero))='TEST-001'
);
SET @cuota_oct_prueba := (
 SELECT MIN(c.id) FROM cuotas c WHERE c.casa_id=@casa_id_prueba
  AND c.anio=2026 AND c.mes='OCTUBRE'
  AND c.origen_importacion='PRUEBA_10_PESOS'
  AND c.estatus_pago='PENDIENTE' AND c.monto_pagado=0.00
  AND c.saldo_pendiente=350.00 AND c.recargo=50.00
);
SET @sep_ok_prueba := (
 SELECT COUNT(*) FROM cuotas
 WHERE casa_id=@casa_id_prueba AND anio=2026 AND mes='SEPTIEMBRE'
  AND estatus_pago='PAGADO' AND monto_pagado=300.00 AND saldo_pendiente=0.00
  AND origen_importacion='PRUEBA_10_PESOS'
);
SET @ultimo_comprobante_eliminado := (
 SELECT COUNT(*) FROM pagos_reportados
 WHERE casa_id=@casa_id_prueba AND folio_reporte='MJ-2026-0030'
);
SET @preparado_para_abono := IF(@casa_id_prueba IS NOT NULL
 AND @cuota_oct_prueba IS NOT NULL AND @sep_ok_prueba=1
 AND @ultimo_comprobante_eliminado=0,1,0);
SELECT @casa_id_prueba casa_id,@cuota_oct_prueba cuota_octubre,
 @sep_ok_prueba septiembre_pagado,
 @ultimo_comprobante_eliminado existe_pago_anterior,
 @preparado_para_abono autorizado;

START TRANSACTION;
UPDATE cuotas
SET monto_cuota=300.00,recargo=50.00,monto_pagado=340.00,
 saldo_pendiente=10.00,estatus_pago='PAGO_PARCIAL',
 referencia='TEST-OCT26-ABONO-340',forma_pago='OTRO',
 fecha_pago=NULL,fecha_confirmacion=NULL,
 observaciones='PRUEBA SINTETICA: $340 contabilizados, octubre saldo $10; solo deposito bancario nuevo por $10 completara los $350.',
 actualizado_en=NOW()
WHERE @preparado_para_abono=1 AND id=@cuota_oct_prueba
 AND casa_id=@casa_id_prueba AND anio=2026 AND mes='OCTUBRE'
 AND origen_importacion='PRUEBA_10_PESOS'
 AND estatus_pago='PENDIENTE' AND saldo_pendiente=350.00;
SELECT ROW_COUNT() AS filas_preparadas; -- Esperado: 1
SELECT anio,mes,monto_cuota,recargo,monto_pagado,
 saldo_pendiente,estatus_pago,referencia,origen_importacion
FROM cuotas WHERE casa_id=@casa_id_prueba
 AND anio=2026 AND mes IN ('SEPTIEMBRE','OCTUBRE')
ORDER BY FIELD(mes,'SEPTIEMBRE','OCTUBRE');
-- Solo COMMIT si SEPTIEMBRE pendiente 0 y OCTUBRE pendiente $10.
-- ROLLBACK;
-- COMMIT;

-- VIGENCIA C3: ¡NO USAR UPDATE zk_tarjetas PARA CAMBIAR EL CONTROLADOR!
-- Después de preparar cuota, usar como ADMINISTRADOR la interfaz de edición
-- física de TAG 5112343 de Prueba TEST-001 para terminar en 10-OCT-2026.
-- Verificar en C3; el espejo SQL podría ser sobrescrito por autolectura.
-- Al acreditar $10 y aparecer octubre PAGADO, consultar nuevamente este SELECT.
SELECT numero_tarjeta,fecha_fin,en_controlador,bloqueado
FROM zk_tarjetas WHERE casa_id=@casa_id_prueba;
-- En la implementación actual, un banco de $10 no compra un mes C3 con
-- tarifa mensual $300. Por tanto, la restauración a 10-NOV-2026 requiere
-- INTERVENCIÓN MANUAL desde el administrador para esta prueba, o un futuro
-- cambio explícito de la lógica de acceso (fuera de este PR).
