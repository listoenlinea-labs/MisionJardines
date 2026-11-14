-- Casa Club / Misión Jardines: homologar importes de TODOS los registros existentes
-- Ejecutar MANUALMENTE en MySQL Workbench (no se ejecuta por el despliegue).
-- No cambia: pagado, estatus, folio, fecha_pago, garantia_devuelta, fechas ni recibos.
-- Atención: las métricas que agregan importes de filas pagadas se recalcularán
-- con la tarifa homologada, incluso si en el pasado registraron otro importe.
-- Verificar que se busca normalizar tarifas contractuales antes de ejecutarla.

START TRANSACTION;

SELECT
  COUNT(*) AS total_registros,
  SUM(CASE WHEN pagado = 1 THEN 1 ELSE 0 END) AS registros_marcados_pagados,
  SUM(CASE WHEN cuota_recuperacion <> 1000
                 OR deposito_garantia <> 700
                 OR limpieza <> 300
           THEN 1 ELSE 0 END) AS importes_distintos
FROM reservas_casa_club;

UPDATE reservas_casa_club
SET
  cuota_recuperacion = 1000,
  deposito_garantia = 700,
  limpieza = 300
WHERE cuota_recuperacion <> 1000
   OR deposito_garantia <> 700
   OR limpieza <> 300;

SELECT ROW_COUNT() AS registros_homologados;

COMMIT;

SELECT
  id, fecha, solicitante, estatus, pagado, folio,
  cuota_recuperacion, deposito_garantia, limpieza,
  (cuota_recuperacion + deposito_garantia + limpieza) AS tarifa_total
FROM reservas_casa_club
ORDER BY fecha DESC, id DESC;
