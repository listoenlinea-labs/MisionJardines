# Vigencia ligada a mantenimiento

La unidad de cobro es la vivienda. Administración registra una sola vez su fecha final real (siempre día 10) en Pagos. Esta fecha es inclusiva en la zona America/Mexico_City: el día 11 ya está vencida. No existe mes ni día de gracia. La tarifa actual es $300 MXN por mensualidad.

Antes de confirmar cobros nuevos, registra la fecha inicial que corresponde a los cobros manuales existentes. El registro inicial guarda el total histórico confirmado como referencia; no lo vuelve a convertir en meses. Si una vivienda aún no tiene fecha inicial, los cobros pueden registrarse pero la respuesta indica `pendienteConfiguracion: true`; deberá ingresarse entonces la fecha real que ya incluya esos cobros. Nunca se inventa una fecha.

Por cada pago confirmado se recalcula:

- Principal = importe pagado menos recargo confirmado.
- Principal nuevo = total confirmado de mantenimiento menos total histórico de la configuración inicial.
- Meses completos = división entera del principal nuevo entre $300.
- Fecha final = fecha inicial más los meses completos, conservando el día 10.
- El remanente queda como abono acumulado para completar otra mensualidad.

Ejemplos sin recargos: fecha final anterior 2026-08-10 + $600 = 2026-10-10, aunque el pago ocurra en noviembre y continúe vencida; + $3,600 = 2027-08-10. Dos abonos de $150 cubren un mes. Un adeudo restante no impide actualizar la fecha. Las cuotas extraordinarias y comprobantes pendientes o rechazados no suman meses.

El recargo sugerido mantiene la regla existente ($50 después del día 10). Administración revisa el recargo incluido en cada depósito; no se supone que cada mes adelantado lleva recargo. La lectura OCR ayuda a capturar datos y no verifica que el banco haya recibido el dinero. El comprobante queda pendiente hasta la revisión administrativa.

## API

Requiere JWT. Consulta de vigencia y reporte se limitan a la vivienda activa validada por el middleware. Inicialización, pendientes, imágenes y revisión requieren SUPER_ADMIN o ADMINISTRADOR.

- `GET /api/pagos/vigencia`: fecha calculada de la vivienda activa y abono acumulado.
- `PUT /api/pagos/vigencia/:casaId`: `{ "fechaFinal": "2026-08-10" }`. Se permite una sola inicialización por vivienda.
- `GET /api/pagos/pendientes`: hasta 100 pendientes por orden de registro; al revisarlos, aparecen los siguientes. Las imágenes se consultan por separado.
- `GET /api/pagos/:id/comprobante`: imagen del comprobante para revisión administrativa.
- `PATCH /api/pagos/:id/revision`: `{ "estatus": "VALIDADO", "recargo": "50.00", "observaciones": "Depósito verificado" }`; también admite RECHAZADO. Repetir la misma resolución no suma meses nuevamente; cambiar una resolución existente devuelve 409.
- Las confirmaciones, correcciones, cambios de estatus y eliminación de cuotas del módulo administrativo recalculan la vigencia en la misma transacción. En esos endpoints el campo `recargo` identifica el importe que no debe convertirse en meses; por defecto es cero.

Una operación bancaria reflejada en ambas pantallas debe tener exactamente la misma referencia en Cuotas y folio de operación en Pagos. Cuando el reporte queda validado, se toma su importe como fuente para no contar ese movimiento dos veces. No dupliques cobros usando referencias distintas. Cuotas históricas sin tipo se consideran mantenimiento; `tipoPago: EXTRAORDINARIO` se excluye. Corregir o eliminar un cobro confirmado puede retroceder la fecha calculada.

La migración de inicio crea `vigencias_mantenimiento` y añade `cuotas.recargo` sin borrar datos. Debe reiniciarse el backend para aplicar el esquema antes de publicar la nueva pantalla. Los scripts de Pagos están en `docs/assets/js/pagos.js` y `pagos-pdf.js`.

## Límites de integración

La vigencia es la fecha deseada en la plataforma y se devuelve con `sincronizacion: NO_IMPLEMENTADA`. Este cambio no envía órdenes al ZKTeco ni modifica sus tarjetas o plumas. Falta conectar esta fecha con la sincronización de tags de cada vivienda y confirmar que el controlador la aplicó. La pantalla muestra esa limitación.

No se incorpora una pasarela bancaria ni se generan automáticamente cuotas mensuales. Un futuro webhook de pago debe verificar firma, monto y operación única, y usar la misma transacción de confirmación/recalculo; nunca confirmar un pago desde el navegador solamente. La tarifa queda fijada al inicializar; cualquier cambio de tarifa requiere una migración de periodos, no modificar el valor retroactivamente.

Pruebas: `node --test backend/test/*.test.js`.
