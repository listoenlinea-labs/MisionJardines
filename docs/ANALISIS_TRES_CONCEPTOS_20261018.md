# Análisis de cuotas: tres conceptos por vivienda

La tarjeta «Quién pagó y quién está pendiente» comparte padrón, búsqueda,
calle, estado, filtro de último mes pagado, paginación, consulta de TAGs y
formulario administrativo de pago en tres pestañas horizontales:

1. **Mantenimiento:** mantiene íntegros los datos y el cálculo de adeudo del
   módulo existente, incluidos abonos y recargos históricos. Es la vista inicial.
2. **Cuotas extraordinarias:** obtiene los `cargos_extraordinarios` vinculados
   a una `cuota_extraordinaria` activa. Un egreso `CUOTA_EXTRAORDINARIA` **sin
   configurar cobro** no genera deuda hasta que Administración seleccione
   meses y fecha de inicio y se emitan los cargos por vivienda. Cada cargo se
   salda solo con un comprobante **VALIDADO** o pago manual registrado para
   ese cargo específico.
3. **Casa club:** toma únicamente reservas `APROBADA`. `PENDIENTE`, `RECHAZADA`
   y `CANCELADA` no son cargos. La deuda es renta/recuperación + garantía +
   limpieza opcional; se asigna al mes de `fecha_limite_pago` o, si falta,
   al mes de la fecha de la reservación. Un comprobante pendiente de revisión
   **no** representa pago confirmado.

## Definiciones de columnas

Para Extraordinarias y Casa club:

- **Estado:** `PENDIENTE` si hay saldo exigible hasta el mes/año seleccionado;
  `PAGADO` si existieron cargos exigibles y ya están saldados; `SIN CARGOS`
  si no hay cargos exigibles a ese corte. `SIN CARGOS` muestra $0.00, no
  asegura que haya existido un pago ni que no existan obligaciones futuras.
- **Pagado:** importe de cargos asignados al mes/año seleccionado y cubiertos
  mediante comprobante validado o asiento manual. No se confunde con el total
  de todos los años ni con el ingreso bancario del mes de depósito.
- **Último mes pagado:** el último período pagado de ese concepto, incluso si
  está adelantado. Para Casa club es el mes de vencimiento del cobro.
- **Saldo pendiente:** suma de cargos no saldados del concepto hasta el
  mes/año seleccionado; no anticipa cargos futuros.

Las advertencias por deuda y TAG pertenecen **solo a Mantenimiento**;
el estado físico de los TAGs sigue disponible como consulta en las otras
dos pestañas. «Registrar pago» abre el mismo modal existente, preseleccionando
el concepto de la pestaña. Ningún cargo extra o de Casa club altera fechas
ni permisos C3.

## Gráfica de movimientos

«Ingresos y egresos» incorpora **Casa club cobrado**: el total de
`pagos_reportados` tipo `CASA_CLUB` **VALIDADO** cuya fecha bancaria cae en el
mes consultado, más `pagos_manuales_concepto` del mismo tipo creados en el
mes consultado. No suma las reservas por aprobar ni el monto meramente
prometido. El asiento contable manual ya se incluye en `totalManualConcepto`
para el saldo de la administración y la nueva barra no lo vuelve a agregar.

## Despliegue y consultas SQL

No se agrega tabla ni columna con este cambio. Se reutiliza la migración
[2026-10-18-cuotas-extraordinarias-casa-club.sql](../backend/sql/2026-10-18-cuotas-extraordinarias-casa-club.sql)
de la funcionalidad anterior. Si el servidor aún no la tiene completamente
instalada, **no volver a ejecutar sin revisión los `ALTER TABLE ADD COLUMN`**:
pueden producir `Duplicate column name` o un fallo parcial. Verificar primero
`SHOW COLUMNS` / `SHOW CREATE TABLE` y aplicar únicamente las diferencias
faltantes mediante migración revisada en copia de respaldo.

Para diagnóstico de solo lectura, ejecutar
[consultas-analisis-tres-conceptos-20261018.sql](../backend/sql/consultas-analisis-tres-conceptos-20261018.sql).
Empieza y termina comprobando `SQL_SAFE_UPDATES=1`.

**Importante:** la captura del 18/oct indicaba **232 de 232 viviendas**, en
tanto el reparto de un proyecto extraordinario requiere **231 viviendas**.
El nuevo análisis no cambia ese padrón, no redistribuye los $4,000 de egresos
históricos de la captura ni inventa cobros. Conciliar las viviendas antes de
«Configurar cobro» o registrar un egreso extraordinario nuevo.

Desplegar **backend y frontend** juntos. La pestaña de mantenimiento sigue
funcionando si el backend es antiguo, pero el frontend bloquea las dos nuevas
consultas con un aviso, en lugar de mostrar falsos saldos de $0.00.

Las pruebas son con datos simulados; verificar importes reales de una vivienda
con proyecto emitido, comprobante en revisión, pago validado, reserva aprobada,
reserva cancelada y meses futuros contra MySQL antes de confiar en los reportes.
