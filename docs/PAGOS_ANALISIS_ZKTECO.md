## Nuevo flujo: del último mes pagado hasta el seleccionado (octubre de 2026)

**Ejemplo Lirios 13**: Seguridad muestra último mes pagado **agosto de 2026**, mientras los dos TAGs físicos aún muestran **11/07/2026**. Los pagos se determinan **por `cuotas`**, no por la fecha de los TAGs.

1. Administración → Análisis de cuotas → Lirios 13 → Registrar pago.
2. El modal consulta `GET /api/finanzas/pagos-vivienda/:casaId/cotizar?anio=2026&mes=10`. Muestra el último mes **completamente** pagado (agosto) y autocalcula **septiembre + octubre**, `2` meses, total sugerido **$600**.
3. Editar el campo **Monto total recibido** si corresponde. Para 2 meses completos debe ser **$600 a $700**, donde cada peso por encima de $600 se asigna a recargo de hasta $50 por mensualidad. Ejemplo $650 → $350 septiembre + $300 octubre. Para abonos parciales no se deben marcar ambas mensualidades `PAGADO`.
4. La cuota histórica `PENDIENTE` con $0 pagados que tenga `folio = HIST-OCT26-...` y/o `referencia = HIST-OCT26-...` **no es un recibo real**. El backend acepta completar estos marcadores y conserva tanto el folio como la referencia originales en `observaciones`. El campo `folio` deja de contener la etiqueta histórica.
5. Si la cuota HIST pendiente tiene además fechaPago/fechaConfirmacion heredada, el modal exige marcar una **confirmación administrativa explícita**, después de revisar que el pago realmente se recibió. Se rechazan folios bancarios, `reciboPdfUrl`, `confirmadoPorUsuarioId`, cuotas ya pagadas y pagos parciales. Esto **no autoriza sobrescribir un cobro real**.
6. POST `/api/finanzas/pagos-vivienda` **vuelve a calcular la cantidad de meses dentro de una transacción con lock de vivienda**, guarda todas las cuotas y genera **un solo** evento `pagos_acceso_c3` de lote para el total, no uno por mes. La referencia MJMAN contiene la fecha de vencimiento final **2026-11-10**.
7. El worker ZKTeco vigente lee el C3 y solicita **2026-11-10** a cada TAG de la vivienda (para Lirios 13: 2 TAGs). La API muestra el estado de la cola. La actualización puede permanecer pendiente, fallar o entrar en conflicto; **no basta la confirmación MySQL para afirmar que el hardware cambió**.
8. Seguridad → Cuotas por vivienda → Actualizar refleja septiembre y octubre como meses abonados, aunque otras cuotas anteriores sigan afectando el estado general.

**No ejecutar dos veces el cobro** si los TAGs aún no cambiaron; usar «Verificar vigencias de TAGs» y revisar el estado del evento en lugar de crear un segundo pago.

### Limitaciones de conciliación

- La cotización toma el **último mes completamente pagado**, no necesariamente el último que tuvo abono parcial.
- Un registro PENDIENTE con importe positivo o evidencia de pago real sigue bloqueado, y requiere conciliación manual.
- Un evento C3 anterior en estado `CONFLICTO` puede bloquear la cola de esta casa. Resolver el evento existente antes de esperar que la nueva escritura avance.
- No hay escritura física transaccional para todos los TAGs: verificar que **todos** lleguen a la fecha indicada.
- El pago administrativo no crea por sí solo un depósito bancario validado; no se debe sumar nuevamente como ingreso bancario.


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
