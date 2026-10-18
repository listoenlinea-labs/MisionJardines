-- CONSULTAS DE SOLO LECTURA · MySQL Hostinger · octubre 2026
-- Cambiar únicamente la variable @casa_id al ID real en direcciones.
SET SQL_SAFE_UPDATES = 1;
SET @casa_id = 0; -- REEMPLAZAR 0 con direcciones.id; jamás usar número de TAG.
SELECT @@SQL_SAFE_UPDATES AS safe_updates;

-- 1. Identificar el ID correcto de la vivienda.
SELECT id AS casa_id, calle, calle_correcta, numero, nombre
FROM direcciones ORDER BY calle, numero;

-- 2. Historial mantenimiento, recargos y mensualidades adeudadas.
SELECT casa_id, anio, mes, monto_cuota, monto_pagado, recargo,
       saldo_pendiente, estatus_pago, fecha_pago, referencia
FROM cuotas WHERE casa_id = @casa_id ORDER BY anio, FIELD(mes,
 'ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE');

-- 3. Egresos clasificados como cuota extraordinaria, tengan o no cargos.
SELECT e.id AS egreso_id,e.fecha,e.concepto,e.monto AS monto_total,
       e.referencia,q.id AS cuota_id,q.meses,q.fecha_inicio,q.viviendas,
       COUNT(c.id) AS cargos_creados,COALESCE(SUM(c.monto),0) AS total_cargos
FROM egresos_fraccionamiento e
LEFT JOIN cuotas_extraordinarias q ON q.egreso_id=e.id
LEFT JOIN cargos_extraordinarios c ON c.cuota_extraordinaria_id=q.id
WHERE e.categoria='CUOTA_EXTRAORDINARIA'
GROUP BY e.id,e.fecha,e.concepto,e.monto,e.referencia,q.id,q.meses,q.fecha_inicio,q.viviendas
ORDER BY e.fecha DESC,e.id DESC;

-- 4. Deuda extraordinaria de una vivienda, con estados de comprobantes.
SELECT ce.id AS cargo_id,ce.casa_id,ce.periodo,qe.concepto,ce.monto,
       MAX(CASE WHEN p.estatus='VALIDADO' THEN 1 ELSE 0 END) AS banco_validado,
       MAX(CASE WHEN p.estatus='PENDIENTE_VALIDACION' THEN 1 ELSE 0 END) AS banco_pendiente,
       COUNT(DISTINCT pm.id) AS pagos_manuales
FROM cargos_extraordinarios ce
JOIN cuotas_extraordinarias qe ON qe.id=ce.cuota_extraordinaria_id
LEFT JOIN pagos_reportados p ON p.cargo_extraordinario_id=ce.id
LEFT JOIN pagos_manuales_concepto pm ON pm.cargo_extraordinario_id=ce.id
WHERE ce.casa_id=@casa_id
GROUP BY ce.id,ce.casa_id,ce.periodo,qe.concepto,ce.monto
ORDER BY ce.periodo,qe.concepto;

-- 5. Reservaciones de la casa club y fecha en que se libera la solicitud.
SELECT id,casa_id,solicitante,fecha,fecha_bloqueada,estatus,
       fecha_limite_pago,cuota_recuperacion AS renta,deposito_garantia,
       limpieza,pagado,fecha_pago,folio
FROM reservas_casa_club
WHERE @casa_id=0 OR casa_id=@casa_id ORDER BY fecha DESC;

-- 6. Comprobantes: separados por concepto, sin mostrar imágenes/OCR.
SELECT id,casa_id,tipo_pago,cuota_extraordinaria_id,cargo_extraordinario_id,
       reserva_casa_club_id,concepto,monto,recargo,folio_operacion,
       fecha_operacion,estatus,fecha_validacion
FROM pagos_reportados
WHERE @casa_id=0 OR casa_id=@casa_id ORDER BY creado_en DESC LIMIT 200;

-- 7. Pagos manuales administrativos (NO se reflejan en C3).
SELECT id,casa_id,tipo_pago,cargo_extraordinario_id,reserva_casa_club_id,
       monto,forma_pago,referencia,registrado_por,creado_en
FROM pagos_manuales_concepto
WHERE @casa_id=0 OR casa_id=@casa_id ORDER BY creado_en DESC LIMIT 200;

-- 8. Revisar si el padrón está conciliado con las 231 viviendas deseadas.
SELECT COUNT(*) AS total_registros_direcciones FROM direcciones;
SELECT COUNT(*) AS cargos_total,COUNT(DISTINCT casa_id) AS viviendas_cobradas,
       COUNT(DISTINCT cuota_extraordinaria_id) AS proyectos_cobrados
FROM cargos_extraordinarios;

