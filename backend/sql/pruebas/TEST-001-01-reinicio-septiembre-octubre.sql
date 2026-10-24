-- MISION JARDINES - PRUEBA CONTROLADA Prueba TEST-001
-- FASE 1: REINICIO SQL del último pago $10, y SEPTIEMBRE pagado ($300),
-- OCTUBRE adeudado ($350). SOLO uso en entorno de prueba autorizado.
-- Ejecutar en MySQL Workbench con AUTOCOMMIT desactivado para esta sesión.
-- NUNCA cambia físicamente el ZKTeco; NO reescribe otro recibo validado.
-- El script deja COMMIT comentado. Revisar filas afectadas antes de confirmar.
--
-- Identificar usuario y vivienda sintética, sin confiar en nombres duplicados:
SET @prueba_casa_id := (
  SELECT MIN(d.id)
  FROM direcciones d JOIN usuarios u ON u.casa_id=d.id
  WHERE LOWER(TRIM(u.correo))='condomino.prueba@example.invalid'
    AND LOWER(TRIM(d.calle))='prueba'
    AND UPPER(TRIM(d.numero))='TEST-001'
);
SET @prueba_pagos_validos := (
  SELECT COUNT(*) FROM usuarios u JOIN direcciones d ON d.id=u.casa_id
  WHERE u.casa_id=@prueba_casa_id
    AND LOWER(TRIM(u.correo))='condomino.prueba@example.invalid'
    AND LOWER(TRIM(d.calle))='prueba'
    AND UPPER(TRIM(d.numero))='TEST-001'
);
SET @prueba_pago_id := (
 SELECT MIN(p.id) FROM pagos_reportados p
 WHERE p.casa_id=@prueba_casa_id AND p.folio_reporte='MJ-2026-0030'
 AND p.tipo_pago='MANTENIMIENTO' AND p.estatus='VALIDADO'
 AND p.monto=10.00
);
-- Detectar evento C3 ligado al pago: solo se permite eliminar el evento
-- contable si no compró meses ni contiene ninguna aplicación a TAG.
SET @prueba_eventos_inseguros := (
 SELECT COUNT(*) FROM pagos_acceso_c3 e
 WHERE e.casa_id=@prueba_casa_id AND e.origen='PAGO'
   AND e.origen_id=@prueba_pago_id
   AND (e.meses<>0 OR EXISTS(
      SELECT 1 FROM pagos_acceso_tags_c3 et
      WHERE et.pago_acceso_id=e.id
   ))
);
SET @prueba_recargos_vinculados := (
 SELECT COUNT(*) FROM recargos_mantenimiento r
 WHERE r.casa_id=@prueba_casa_id AND r.pago_id=@prueba_pago_id
);
SET @prueba_filas_sinteticas := (
 SELECT COUNT(*) FROM cuotas c
 WHERE c.casa_id=@prueba_casa_id
  AND c.anio=2026 AND c.mes IN('SEPTIEMBRE','OCTUBRE')
  AND c.origen_importacion='PRUEBA_10_PESOS'
);
SET @prueba_pagos_posteriores := (
 SELECT COUNT(*) FROM pagos_reportados p
 WHERE p.casa_id=@prueba_casa_id AND p.id>@prueba_pago_id
   AND p.tipo_pago='MANTENIMIENTO'
);
SET @prueba_habilitada := IF(
  @prueba_casa_id IS NOT NULL AND @prueba_pagos_validos=1
  AND @prueba_pago_id IS NOT NULL AND @prueba_eventos_inseguros=0
  AND @prueba_recargos_vinculados=0 AND @prueba_filas_sinteticas=2
  AND @prueba_pagos_posteriores=0,1,0
);
SELECT @prueba_casa_id casa_id,@prueba_pago_id pago_id,
 @prueba_eventos_inseguros eventos_c3_inseguros,
 @prueba_recargos_vinculados recargos_asociados,
 @prueba_filas_sinteticas cuotas_sinteticas,
 @prueba_pagos_posteriores pagos_posteriores,
 @prueba_habilitada autoriza_reinicio;
-- Debe ser 1 para continuar. Si es 0: NO operar, compartir diagnóstico.
SELECT id,folio_reporte,estatus,monto,folio_operacion
FROM pagos_reportados
WHERE casa_id=@prueba_casa_id AND tipo_pago='MANTENIMIENTO'
ORDER BY id DESC;
-- IMPORTANTE: otros recibos validados (p. ej. MJ-2026-0020 por $300 OCT)
-- se conservan: borrarlos o cambiarles el mes distorsionaría el banco.

START TRANSACTION;
-- Evitar un borrado si el control de identidad / trazabilidad falló.
DELETE FROM pagos_acceso_c3
WHERE @prueba_habilitada=1 AND casa_id=@prueba_casa_id
 AND origen='PAGO' AND origen_id=@prueba_pago_id
 AND meses=0
 AND NOT EXISTS (
   SELECT 1 FROM pagos_acceso_tags_c3 et
   WHERE et.pago_acceso_id=pagos_acceso_c3.id
 );
SELECT ROW_COUNT() AS eventos_c3_contables_eliminados;

DELETE FROM pagos_reportados
WHERE @prueba_habilitada=1 AND id=@prueba_pago_id
 AND casa_id=@prueba_casa_id AND folio_reporte='MJ-2026-0030'
 AND estatus='VALIDADO' AND monto=10.00;
SELECT ROW_COUNT() AS comprobantes_10_eliminados; -- Esperado: 1

UPDATE cuotas
SET monto_cuota=300.00,recargo=0.00,monto_pagado=300.00,
 saldo_pendiente=0.00,estatus_pago='PAGADO',
 referencia='TEST-SEP26-300',forma_pago='OTRO',
 observaciones='PRUEBA SINTETICA: Septiembre 2026 cubierto con $300 (sin afirmar otro deposito bancario).',
 actualizado_en=NOW()
WHERE @prueba_habilitada=1 AND casa_id=@prueba_casa_id
 AND anio=2026 AND mes='SEPTIEMBRE'
 AND origen_importacion='PRUEBA_10_PESOS';

UPDATE cuotas
SET monto_cuota=300.00,recargo=50.00,monto_pagado=0.00,
 saldo_pendiente=350.00,estatus_pago='PENDIENTE',
 referencia='TEST-OCT26-DEUDA-350',forma_pago='OTRO',
 fecha_pago=NULL,fecha_confirmacion=NULL,
 observaciones='PRUEBA SINTETICA: Octubre 2026 pendiente de $350.00; sin abonos.',
 actualizado_en=NOW()
WHERE @prueba_habilitada=1 AND casa_id=@prueba_casa_id
 AND anio=2026 AND mes='OCTUBRE'
 AND origen_importacion='PRUEBA_10_PESOS';

SELECT anio,mes,monto_cuota,recargo,monto_pagado,
 saldo_pendiente,estatus_pago,origen_importacion
FROM cuotas WHERE casa_id=@prueba_casa_id
 AND anio=2026 AND mes IN('SEPTIEMBRE','OCTUBRE')
ORDER BY FIELD(mes,'SEPTIEMBRE','OCTUBRE');
SELECT COUNT(*) AS existe_comprobante_0030
FROM pagos_reportados WHERE id=@prueba_pago_id;
SELECT numero_tarjeta,fecha_fin,estado 
FROM (
 SELECT numero_tarjeta,fecha_fin,
 IF(fecha_fin<'2026-10-24','VENCIDO_SEGUN_SQL','NO_VENCIDO_SEGUN_SQL') estado
 FROM zk_tarjetas WHERE casa_id=@prueba_casa_id
) resumen;
-- Si NO ves SEPTIEMBRE=0 pendiente y OCTUBRE=350 y el pago eliminado,
-- ejecuta ROLLBACK.
-- ROLLBACK;
-- Si todo es correcto: COMMIT;
-- COMMIT;
