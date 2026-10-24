-- Mision Jardines — DIAGNOSTICO PREVIO TEST-001 (SOLO LECTURA)
-- Ejecutar antes de modificar cuotas, pagos, eventos de acceso o TAGs.
SELECT DATABASE() AS base_actual, @@hostname AS servidor_actual, NOW() AS consulta;

SET @casa_test := (
 SELECT MIN(id) FROM direcciones
 WHERE LOWER(TRIM(calle))='prueba' AND UPPER(TRIM(numero))='TEST-001'
);
SET @usuario_test := (
 SELECT MIN(id) FROM usuarios
 WHERE casa_id=@casa_test
 AND LOWER(TRIM(correo))='condomino.prueba@example.invalid'
);
SELECT @casa_test AS casa_id,@usuario_test AS usuario_id;

SELECT id,calle,numero,cuota_por_cobrar
FROM direcciones WHERE id=@casa_test;
SELECT anio,mes,origen_importacion,monto_cuota,recargo,
       monto_pagado,saldo_pendiente,estatus_pago,referencia
FROM cuotas WHERE casa_id=@casa_test ORDER BY anio,FIELD(mes,
 'ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO',
 'JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE');
SELECT id,folio_reporte,tipo_pago,estatus,monto,recargo,fecha_operacion,
       LEFT(folio_operacion,4) AS referencia_inicio,
       IF(correo_bancario_hash IS NULL,'NO','SI') AS aviso_usado
FROM pagos_reportados WHERE casa_id=@casa_test ORDER BY id DESC;
SELECT id,origen,origen_id,estado,meses,saldo_antes_centavos,
 saldo_despues_centavos,referencia FROM pagos_acceso_c3
 WHERE casa_id=@casa_test ORDER BY id DESC;
SELECT a.id,a.pago_acceso_id,a.numero_tarjeta,a.estado,a.fecha_antes,a.fecha_despues
FROM pagos_acceso_tags_c3 a
JOIN pagos_acceso_c3 e ON e.id=a.pago_acceso_id
WHERE e.casa_id=@casa_test;
SELECT numero_tarjeta,fecha_fin,en_controlador,bloqueado
FROM zk_tarjetas WHERE casa_id=@casa_test;
SELECT corte,pago_id,monto FROM recargos_mantenimiento
WHERE casa_id=@casa_test ORDER BY corte;
-- Si una transferencia de $10 ya fue VALIDADA por Titan, NO vuelva
-- a utilizar su mismo folio ni el mismo aviso para simular un pago nuevo.
