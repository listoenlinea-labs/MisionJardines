-- PRUEBA EXCLUSIVAMENTE EN CLON/BASE DE PRUEBAS. NO EJECUTAR EN PRODUCCION.
-- Hace un reset de los asientos SINTETICOS DE TEST-001, no de dinero real.
-- Antes: backup/export de TODAS estas tablas; detener workers IMAP/C3 del clon.
-- No habilitar el IMAP de producción ni reutilizar avisos ya validados.
-- ¡NO modifica fecha_fin ni envía comandos a ZKTeco!
-- El control físico se ajusta MANUALMENTE en el panel de ZKTeco.
--
-- IMPORTANTE: cambiar @confirmar_clon a 1 solo después de confirmar
-- servidor, base CLON, backup y ausencia de operaciones ajenas.
SET @confirmar_clon := 0;
SET @casa_test := (
 SELECT MIN(id) FROM direcciones WHERE LOWER(TRIM(calle))='prueba'
   AND UPPER(TRIM(numero))='TEST-001'
);
SET @user_test := (
 SELECT MIN(id) FROM usuarios WHERE casa_id=@casa_test
   AND LOWER(TRIM(correo))='condomino.prueba@example.invalid'
);
SET @matches_house := (
 SELECT COUNT(*) FROM direcciones WHERE id=@casa_test
   AND LOWER(TRIM(calle))='prueba' AND UPPER(TRIM(numero))='TEST-001'
);
SET @matches_user := (
 SELECT COUNT(*) FROM usuarios WHERE id=@user_test AND casa_id=@casa_test
  AND LOWER(TRIM(correo))='condomino.prueba@example.invalid'
);
SET @otros_pagos := (
 SELECT COUNT(*) FROM pagos_reportados
 WHERE casa_id=@casa_test AND usuario_id<>@user_test
);
-- Requiere nombre de BASE que indique CLON, TEST o STAGING;
-- no permite activar el reset directamente sobre la base principal.
SET @es_clon := IF(LOWER(DATABASE()) REGEXP '(test|staging|clon|sandbox)',1,0);
SET @autorizar := IF(@confirmar_clon=1 AND @es_clon=1
 AND @matches_house=1 AND @matches_user=1 AND @otros_pagos=0,1,0);
SELECT DATABASE() base_actual,@@hostname servidor_actual,
 @es_clon base_de_pruebas,@matches_house casa_valida,
 @matches_user usuario_valido,@otros_pagos pagos_otros_usuarios,
 @confirmar_clon confirmacion_manual,@autorizar autorizacion;
-- Si autorizacion=0, este script NO cambia filas.

START TRANSACTION;
-- Orden de hijos antes de padres. NO se deben borrar estos eventos
-- en producción porque ya contienen historial de acciones físicas.
DELETE FROM pagos_acceso_tags_c3
WHERE @autorizar=1 AND pago_acceso_id IN(
 SELECT id FROM pagos_acceso_c3 WHERE casa_id=@casa_test
);
SELECT ROW_COUNT() AS aplicaciones_tag_eliminadas_en_clon;
DELETE FROM pagos_acceso_c3
WHERE @autorizar=1 AND casa_id=@casa_test;
SELECT ROW_COUNT() AS eventos_acceso_eliminados_en_clon;

DELETE FROM recargos_mantenimiento
WHERE @autorizar=1 AND casa_id=@casa_test;
SELECT ROW_COUNT() AS recargos_eliminados_en_clon;

-- Borrado SOLO de los recibos del USUARIO DE PRUEBA dentro de la BASE CLON.
-- Las transferencias originales de producción SE CONSERVAN allí.
DELETE FROM pagos_reportados
WHERE @autorizar=1 AND casa_id=@casa_test AND usuario_id=@user_test;
SELECT ROW_COUNT() AS recibos_eliminados_en_clon;

DELETE FROM cuotas WHERE @autorizar=1 AND casa_id=@casa_test;
SELECT ROW_COUNT() AS cuotas_eliminadas_en_clon;
UPDATE direcciones SET cuota_por_cobrar=10.00
WHERE @autorizar=1 AND id=@casa_test
 AND LOWER(TRIM(calle))='prueba' AND UPPER(TRIM(numero))='TEST-001';

-- Septiembre figura cubierto SOLO como dato sintético del laboratorio.
-- No inventar pagos bancarios o acuses reales.
INSERT INTO cuotas
(casa_id,anio,mes,monto_cuota,recargo,monto_pagado,saldo_pendiente,
 estatus_pago,tipo_pago,forma_pago,origen_importacion,observaciones,
 creado_en,actualizado_en)
SELECT @casa_test,2026,'SEPTIEMBRE',10,0,10,0,
 'PAGADO','MANTENIMIENTO','OTRO','PRUEBA_10_PESOS',
 'SIMULADO SOLO EN CLON: Septiembre 2026 cubierto para probar corte C3.',
 NOW(),NOW() WHERE @autorizar=1;

-- Octubre pendiente exclusivamente por $10 y SIN recargo para la prueba.
INSERT INTO cuotas
(casa_id,anio,mes,monto_cuota,recargo,monto_pagado,saldo_pendiente,
 estatus_pago,tipo_pago,forma_pago,origen_importacion,observaciones,
 creado_en,actualizado_en)
SELECT @casa_test,2026,'OCTUBRE',10,0,0,10,
 'PENDIENTE','MANTENIMIENTO','OTRO','PRUEBA_10_PESOS',
 'SIMULADO SOLO EN CLON: Octubre por $10 pendiente. Pago futuro debe ser real y distinto.',
 NOW(),NOW() WHERE @autorizar=1;

SELECT id,calle,numero,cuota_por_cobrar
FROM direcciones WHERE id=@casa_test;
SELECT anio,mes,monto_cuota,recargo,monto_pagado,
 saldo_pendiente,estatus_pago,origen_importacion
FROM cuotas WHERE casa_id=@casa_test ORDER BY anio,mes;
SELECT (SELECT COUNT(*) FROM pagos_reportados WHERE casa_id=@casa_test) recibos_restantes,
 (SELECT COUNT(*) FROM pagos_acceso_c3 WHERE casa_id=@casa_test) eventos_acceso_restantes,
 (SELECT COUNT(*) FROM recargos_mantenimiento WHERE casa_id=@casa_test) recargos_restantes,
 (SELECT COUNT(*) FROM zk_tarjetas WHERE casa_id=@casa_test) tags_sin_modificar;
-- ATENCION: revisa lo anterior. Sólo entonces:
-- COMMIT;
-- Si hay cualquier incongruencia:
-- ROLLBACK;
