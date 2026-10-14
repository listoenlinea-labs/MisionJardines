# Confirmar mensualidades desde Análisis de cuotas

## Flujo de administración

1. Entrar en **Administración → Análisis de cuotas**, sección «Quién pagó y quién está pendiente».
2. Buscar la vivienda y pulsar **Registrar pago**.
3. Seleccionar el **mes inicial**, **año**, **cantidad de mensualidades consecutivas (1 a 36)**, **$300 por mes o $350 incluyendo $50 de recargo**, y forma de pago.
4. Leer el resumen del período, total y **fecha final común solicitada al ZKTeco**. Ejemplo: octubre 2026 → **10/11/2026**; diciembre 2026 a febrero 2027 → **10/03/2027**.
5. Confirmar: backend realiza una sola transacción que crea o completa los períodos `cuotas` en MySQL. Si uno ya tenía pago, abono o referencia, **ninguna mensualidad se aplica** y responde 409.
6. Reutiliza `vigencia-mantenimiento.service.actualizar` con registro `origen:CUOTA`, deduplicación por referencia compartida `MJMAN:...:UUID` y **cola durable `pagos_acceso_c3`** existente. La transacción confirma el pago; el C3 se intenta actualizar después.
7. Revisar **Verificar vigencias de TAGs** en el modal. **PENDIENTE**, **PREPARADO** o **ERROR** no significan éxito físico; **CONFLICTO** requiere revisión administrativa. La referencia común solo se considera confirmada cuando la cola dice **COMPLETADO** y todas las `fechaFin` de los TAGs coinciden con la solicitada.
8. En **Seguridad → Cuotas por vivienda**, pulsar **Actualizar**: obtiene los estados directamente de `cuotas`, sin modificar TAGs. Los filtros y «Pagado/Deudor» reflejan el historial incluido.

## Protecciones y limitaciones

- Permisos administrativos: `SUPER_ADMIN` y `ADMINISTRADOR`. No hay cambios de permiso para el resto del sitio.
- No se aceptan meses anteriores a octubre de 2026, pagos parciales, pagos duplicados ni importes fuera de $300/$350 por mes.
- El C3 nunca recibe una vigencia física anterior a la existente. Si el destino mensual queda **antes** de la fecha C3, el pago SQL queda registrado pero el evento C3 se marca **CONFLICTO**, sin alterar ningún TAG (corregir la selección mediante revisión administrativa antes de reintentar). Se conserva el historial, no se borra el cobro automáticamente.
- Los eventos del C3 para referencias manuales calculan la **misma fecha final** para todos los TAGs vinculados al evento. Los otros flujos de pago preservan el cálculo incremental actual.
- El C3 carece de transacciones físicas conjuntas: es posible que algunos TAGs estén actualizados y otros no mientras se reintenta. Revisar `fechasTags` y el estado de la cola; **no mostrar éxito hasta completarse todos**.
- Si no hay TAGs asociados, se guardan las cuotas y el usuario recibe aviso `SIN_TAGS`; no se activan dispositivos.
- No se crean `pagos_reportados` ni registros bancarios validados, para evitar inventar comprobantes o duplicar ingresos contabilizados. Los indicadores de cuotas se actualizan; el balance de ingresos bancarios validados no aumenta por esta operación.
- El cálculo «Deudor» en Seguridad puede mantenerse si existen meses anteriores pendientes, aun cuando se marque pagado el período actual.
- **No es necesario modificar el firmware, el puente de ZKTeco ni agregar tablas SQL**. Se reutilizan modelos y tablas existentes. No activar `ZKTECO_DRY_RUN` en producción si se espera actualización física.

## Pruebas antes del merge

- Revisar una vivienda de prueba con TAGs reales y misma fecha actual; probar un período cuya vigencia destino sea igual o posterior a todas las vigencias físicas.
- Confirmar que dos meses crean dos cuotas y los TAGs terminan con una fecha común.
- Repetir el mismo mes: debe devolver **409**, sin duplicar el pago ni extender nuevamente los TAGs.
- Comprobar eventual estado de cola en `GET /api/finanzas/pagos-vivienda/:casaId/estado-c3`.
- Revisar `Seguridad → Cuotas por vivienda → Actualizar`.
- Probar pantalla móvil de Análisis y menú; la pestaña `cuotas.html` sigue conservando sus roles de acceso anteriores.

**Aviso:** el procedimiento involucra acceso vehicular físico. Este PR no fue probado contra el controlador C3-200 real ni contra la base de datos de producción.
