-- Uso EXCLUSIVO en una base de pruebas o en la vivienda sintética Prueba TEST-001.
-- Octubre 2026: $300.00 mantenimiento + $50.00 recargo - $340.00 ya cubiertos = $10.00 pendientes.
-- Septiembre 2026: saldado en $350.00.
-- Respalda las filas existentes antes de ejecutar. NO borra recibos, pagos ni folios históricos.
-- La operación no debe representar un pago bancario real; solamente prepara el estado contable sintético.
--
-- 1) Identificar vivienda y usuario. Debe devolver UNA vivienda Prueba TEST-001.
SELECT u.id AS usuario_id, u.correo, d.id AS casa_id, d.calle, d.numero
FROM usuarios u
JOIN direcciones d ON d.id = u.casa_id
WHERE LOWER(TRIM(u.correo)) = 'condomino.prueba@example.invalid'
  AND LOWER(TRIM(d.calle)) = 'prueba'
  AND UPPER(TRIM(d.numero)) = 'TEST-001';

-- 2) Inspeccionar el estado actual antes de sustituir sus datos sintéticos.
SELECT c.*
FROM cuotas c
JOIN usuarios u ON u.casa_id = c.casa_id
JOIN direcciones d ON d.id = c.casa_id
WHERE LOWER(TRIM(u.correo)) = 'condomino.prueba@example.invalid'
  AND LOWER(TRIM(d.calle)) = 'prueba'
  AND UPPER(TRIM(d.numero)) = 'TEST-001'
  AND c.anio = 2026 AND c.mes IN ('SEPTIEMBRE','OCTUBRE')
ORDER BY c.mes;

-- IMPORTANTE: ejecutar lo siguiente solo después de verificar que no se
-- están sobrescribiendo pagos reales y que la vivienda es una prueba controlada.
START TRANSACTION;

-- SEPTIEMBRE: $350.00 íntegramente cubiertos (incluye $50.00 de recargo).
INSERT INTO cuotas
 (casa_id, anio, mes, monto_cuota, recargo, monto_pagado,
  saldo_pendiente, estatus_pago, forma_pago, referencia, origen_importacion)
SELECT d.id, 2026, 'SEPTIEMBRE', 300.00, 50.00, 350.00,
       0.00, 'PAGADO', 'OTRO', 'TEST-10-SEP-2026', 'PRUEBA_10_PESOS'
FROM usuarios u
JOIN direcciones d ON d.id = u.casa_id
WHERE LOWER(TRIM(u.correo)) = 'condomino.prueba@example.invalid'
  AND LOWER(TRIM(d.calle)) = 'prueba'
  AND UPPER(TRIM(d.numero)) = 'TEST-001'
ON DUPLICATE KEY UPDATE
 monto_cuota = VALUES(monto_cuota), recargo = VALUES(recargo),
 monto_pagado = VALUES(monto_pagado), saldo_pendiente = VALUES(saldo_pendiente),
 estatus_pago = VALUES(estatus_pago), forma_pago = VALUES(forma_pago),
 referencia = VALUES(referencia), origen_importacion = VALUES(origen_importacion);

-- OCTUBRE: adeudo de $10.00 exactos ($350 total - $340 abonados).
INSERT INTO cuotas
 (casa_id, anio, mes, monto_cuota, recargo, monto_pagado,
  saldo_pendiente, estatus_pago, forma_pago, referencia, origen_importacion)
SELECT d.id, 2026, 'OCTUBRE', 300.00, 50.00, 340.00,
       10.00, 'PAGO_PARCIAL', 'OTRO', 'TEST-10-OCT-2026', 'PRUEBA_10_PESOS'
FROM usuarios u
JOIN direcciones d ON d.id = u.casa_id
WHERE LOWER(TRIM(u.correo)) = 'condomino.prueba@example.invalid'
  AND LOWER(TRIM(d.calle)) = 'prueba'
  AND UPPER(TRIM(d.numero)) = 'TEST-001'
ON DUPLICATE KEY UPDATE
 monto_cuota = VALUES(monto_cuota), recargo = VALUES(recargo),
 monto_pagado = VALUES(monto_pagado), saldo_pendiente = VALUES(saldo_pendiente),
 estatus_pago = VALUES(estatus_pago), forma_pago = VALUES(forma_pago),
 referencia = VALUES(referencia), origen_importacion = VALUES(origen_importacion);

-- 3) Comprobar las dos cuotas ANTES de confirmar.
SELECT c.casa_id, c.anio, c.mes, c.monto_cuota, c.recargo,
       c.monto_pagado, c.saldo_pendiente, c.estatus_pago, c.origen_importacion
FROM cuotas c
JOIN usuarios u ON u.casa_id = c.casa_id
JOIN direcciones d ON d.id = c.casa_id
WHERE LOWER(TRIM(u.correo)) = 'condomino.prueba@example.invalid'
  AND LOWER(TRIM(d.calle)) = 'prueba'
  AND UPPER(TRIM(d.numero)) = 'TEST-001'
  AND c.anio = 2026 AND c.mes IN ('SEPTIEMBRE','OCTUBRE')
ORDER BY c.mes;

-- Si la comprobación no devuelve septiembre $0 y octubre $10: ROLLBACK.
-- Para guardar la preparación de pruebas: ejecutar COMMIT manualmente.
-- COMMIT;
