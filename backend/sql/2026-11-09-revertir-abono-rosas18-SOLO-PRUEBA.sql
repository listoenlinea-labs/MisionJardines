-- IMPORTANTE: Esta consulta revierte el ABONO CONTABLE de prueba,
-- NO solo una copia del PDF. Cambia el saldo de Rosas 18 de nuevo.
-- No ejecutar si el abono correspondía a dinero realmente recibido.
-- La tabla de recibos manuales (recibos_manuales) NO se toca.
--
-- 1) Confirma exactamente una fila. Respalda la base antes de continuar.
START TRANSACTION;
SELECT c.id,c.casa_id,c.mes,c.anio,c.monto_pagado,c.estatus_pago,
       c.origen_importacion,c.referencia
FROM cuotas AS c
JOIN direcciones AS d ON d.id = c.casa_id
WHERE COALESCE(d.calle_correcta,d.calle) = 'Rosas'
  AND d.numero = '18'
  AND c.mes = 'NOVIEMBRE'
  AND c.anio = 2026
  AND c.monto_pagado = 300
  AND c.estatus_pago = 'PAGO_PARCIAL'
  AND c.origen_importacion = 'MANUAL_ABONO_ADEUDO'
  AND c.referencia = 'MJABONO:7fb22c0b-71a8-4632-b4dd-b08215b5e146'
FOR UPDATE;

-- 2) Solo si el SELECT previo devuelve el movimiento correcto:
DELETE c FROM cuotas AS c
JOIN direcciones AS d ON d.id = c.casa_id
WHERE COALESCE(d.calle_correcta,d.calle) = 'Rosas'
  AND d.numero = '18'
  AND c.mes = 'NOVIEMBRE'
  AND c.anio = 2026
  AND c.monto_pagado = 300
  AND c.estatus_pago = 'PAGO_PARCIAL'
  AND c.origen_importacion = 'MANUAL_ABONO_ADEUDO'
  AND c.referencia = 'MJABONO:7fb22c0b-71a8-4632-b4dd-b08215b5e146';

SELECT ROW_COUNT() AS movimientos_revertidos; -- Debe ser EXACTAMENTE 1.

-- 3) Revisa el conteo:
-- Si es 1, ejecuta COMMIT; si no es 1, ejecuta ROLLBACK.
-- El archivo termina en ROLLBACK para evitar borrados accidentales al ejecutarlo.
ROLLBACK;
