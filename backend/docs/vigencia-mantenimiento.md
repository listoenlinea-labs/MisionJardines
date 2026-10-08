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

## Sincronización con ZKTeco

La inicialización y cada recálculo dejan `sincronizacion: PENDIENTE` dentro de la misma transacción del pago. Un evento registrado con `transaction.afterCommit` solicita el envío inmediatamente después de confirmar esa transacción. No se espera un temporizador para un pago nuevo. `zkteco-vigencias.service.js` procesa la fecha final de todos los tags vinculados a la vivienda con `en_controlador=true`, usando `writeUserValidity` y exclusivamente TCP directo. No utiliza bridge aunque el modo global sea AUTO o PULLSDK.

El proceso cambia únicamente `user.EndTime`, conserva `StartTime` y las autorizaciones de puertas, y verifica la fecha leyendo nuevamente el controlador. No activa relés ni quita bloqueos manuales. También actualiza una fecha de restauración previamente guardada para que una activación manual posterior no recupere una vigencia antigua. Un pago no necesariamente deja acceso vigente: si la fecha calculada todavía está vencida, el TAG continúa vencido.

Si la conexión falla, el pago permanece confirmado y la sincronización queda en ERROR, con espera progresiva registrada de 30 segundos hasta 15 minutos. La recuperación revisa los pendientes al iniciar y cada cinco minutos; por ello el reintento efectivo ocurre en la siguiente revisión posterior a esa espera. Los pendientes sobreviven a reinicios. Se repite la fecha absoluta, sin sumar meses otra vez. La fila de vigencia y las tarjetas se bloquean en una transacción independiente mientras se escribe, para impedir escrituras obsoletas entre procesos y pagos concurrentes; un recálculo concurrente puede esperar a que termine esa escritura. No se recorren viviendas completadas. Crear, editar, agregar al controlador o asociar un tag deja pendiente su vivienda y solicita un envío inmediato. La importación manual del inventario también solicita sincronizar las viviendas vinculadas; permite recuperar cambios externos o pasar de simulación a escrituras reales.

El inventario no se importa automáticamente. Se actualiza mediante `POST /api/zkteco/sincronizar`; las variables antiguas `ZKTECO_AUTOSYNC_ENABLED` y `ZKTECO_AUTOSYNC_MS` ya no activan un temporizador. Si se modifican tags desde ZKAccess, ejecutar esa sincronización manual. Los estados SIN_TAGS y SIMULACION no se consultan repetidamente: un nuevo pago, configuración inicial, cambio de tag o sincronización manual vuelve a solicitar el envío.

Estados consultables en `GET /api/pagos/vigencia`: PENDIENTE, COMPLETADO (fecha confirmada), ERROR (se reintentará), SIN_TAGS (falta vincular/importar tarjetas), SIMULACION (`ZKTECO_DRY_RUN=true`) y SIN_CONFIGURAR (falta fecha inicial). El detalle interno del último error queda en `vigencias_mantenimiento.error_sincronizacion`; no se expone al residente.

Para producción:

1. Configurar host, puerto externo y contraseña del C3-200 con las variables `ZKTECO_DIRECT_*` y `ZKTECO_COMM_PASSWORD` existentes.
2. Verificar la asociación real de cada vivienda con sus tags e ingresar una sola vez su fecha final manual, siempre día 10. El historial previo ya cobrado queda como referencia, sin conceder meses adicionales.
3. Establecer `ZKTECO_DRY_RUN=false` para habilitar escrituras y `ZKTECO_WRITE_MODE=DIRECT` para que las operaciones manuales también eviten el bridge.
4. Reiniciar el backend: la migración añade las columnas de seguimiento sin eliminar datos y arranca la recuperación de pendientes. `ZKTECO_VIGENCIAS_MS` ajusta esa revisión (300000 ms, cinco minutos por defecto; mínimo un minuto), incluso si quedó un valor antiguo de 15000. Los pagos nuevos se envían por evento; el tiempo total depende del volumen y de la conexión.

No se ejecuta una prueba física durante las pruebas automatizadas: las respuestas TCP y el almacenamiento se simulan. La primera prueba real debe comprobar EndTime del tag de prueba en el controlador y la vigencia inclusiva del día 10.

No se incorpora una pasarela bancaria ni se generan automáticamente cuotas mensuales. Un futuro webhook de pago debe verificar firma, monto y operación única, y usar la misma transacción de confirmación/recalculo; nunca confirmar un pago desde el navegador solamente. La tarifa queda fijada al inicializar; cualquier cambio de tarifa requiere una migración de periodos, no modificar el valor retroactivamente.

Pruebas: `node --test backend/test/*.test.js`.
