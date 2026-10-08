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

El inventario se consulta automáticamente cada minuto mediante `ZKTECO_AUTOSYNC_ENABLED=true` y `ZKTECO_AUTOSYNC_MS=60000`, además de `POST /api/zkteco/sincronizar` al refrescar. Las lecturas simultáneas se comparten. Un inventario vacío inesperado no declara todos los TAGs inexistentes. El buscador por calle y casa también considera vínculos en `direcciones.controles` y `zk_tarjetas.casa_id` si ZKAccess no trae `DEPTNAME`. La lectura no crea TAGs físicos ni anula bloqueos manuales. La reconciliación de una fecha detectada como diferente en el C3 marca la vivienda como pendiente para actualizar exclusivamente `EndTime`.

Estados consultables en `GET /api/pagos/vigencia`: PENDIENTE, COMPLETADO (fecha confirmada), ERROR (se reintentará), SIN_TAGS (falta vincular/importar tarjetas), SIMULACION (`ZKTECO_DRY_RUN=true`) y SIN_CONFIGURAR (falta fecha inicial). El detalle interno del último error queda en `vigencias_mantenimiento.error_sincronizacion`; no se expone al residente.

Para producción:

1. Configurar host, puerto externo y contraseña del C3-200 con las variables `ZKTECO_DIRECT_*` y `ZKTECO_COMM_PASSWORD` existentes.
2. Verificar la asociación real de cada vivienda con sus tags e ingresar una sola vez su fecha final manual, siempre día 10. El historial previo ya cobrado queda como referencia, sin conceder meses adicionales.
3. Establecer `ZKTECO_DRY_RUN=false` para habilitar escrituras y `ZKTECO_WRITE_MODE=DIRECT` para que las operaciones manuales también eviten el bridge.
4. Reiniciar el backend: la migración añade las columnas de seguimiento sin eliminar datos y arranca la recuperación de pendientes. `ZKTECO_VIGENCIAS_MS` ajusta esa revisión (300000 ms, cinco minutos por defecto; mínimo un minuto), incluso si quedó un valor antiguo de 15000. Los pagos nuevos se envían por evento; el tiempo total depende del volumen y de la conexión.

No se ejecuta una prueba física durante las pruebas automatizadas: las respuestas TCP y el almacenamiento se simulan. La primera prueba real debe comprobar EndTime del tag de prueba en el controlador y la vigencia inclusiva del día 10.

No se incorpora una pasarela bancaria ni se generan automáticamente cuotas mensuales. Un futuro webhook de pago debe verificar firma, monto y operación única, y usar la misma transacción de confirmación/recalculo; nunca confirmar un pago desde el navegador solamente. La tarifa queda fijada al inicializar; cualquier cambio de tarifa requiere una migración de periodos, no modificar el valor retroactivamente.

Pruebas: `node --test backend/test/*.test.js`.

## Validación automática temporal para pruebas

`backend/src/config/pagos-pruebas.js` contiene `VALIDAR_PAGOS_SIN_ADMIN: true`. Cada nuevo reporte válido se registra directamente como VALIDADO, con fecha y una nota de validación automática, sin atribuirlo a un administrador. No comprueba el depósito bancario. Mantenimiento recalcula la vigencia en la misma transacción y solicita el envío al controlador tras el commit; los extraordinarios no modifican las fechas de acceso. Los pagos antiguos pendientes no se aprueban retroactivamente. Se mantienen sesión, vivienda, formato y protección de folios duplicados.

Cambiar la constante a `false` y desplegar/reiniciar el backend restaura PENDIENTE_VALIDACION y la revisión administrativa. Para una prueba de Gardenias 5, configurar primero su vigencia inicial; activar este modo no crea una fecha inicial ni cambia los recargos.


## Mensualidades desde octubre 2026
El período automático inicial es octubre de 2026 (corte inicial 2026-10-10).
Cada **mensualidad completa validada por Administración** avanza un corte mensual.
Por ejemplo: transferencia de $300 del **8 de octubre** => corte **10 de noviembre de 2026**;
transferencia de $300 del **8 de noviembre** como primer pago => también **10 de noviembre**,
porque primero cubre octubre. $600 antes del día 11 cubren octubre y noviembre => **10 de diciembre**; $900 => **10 de enero de 2027**, y $3,600 => **10 de octubre de 2027**.
El día 10 está incluido: desde el día 11 se exige $350 por mensualidad ($300 base + $50 recargo). Se rechazan importes menores o que no completen mensualidades.
Si se pagan meses atrasados pero la fecha final calculada ya venció, NO se abre acceso hasta cubrir suficientes períodos.

Los comprobantes reportados quedan **PENDIENTE_VALIDACION**, aunque se genere un recibo provisional. Solo un pago marcado VALIDADO tras comprobar el movimiento en el banco puede actualizar la fecha final en C3. La configuración de pruebas de validación automática se desactivó. El sistema conserva los bloqueos manuales de seguridad; no agrega por su cuenta usuarios ausentes físicamente del C3.

El cálculo automático solo se crea cuando no existe `vigencias_mantenimiento` para esa casa; las fechas base configuradas manualmente no se sobrescriben. El cálculo de primera activación excluye pagos anteriores al 1 de octubre de 2026, y diferencia recargos de principal. Antes de pasar a producción es esencial conciliar pagos manuales de `cuotas` con los de `pagos_reportados` y evitar reflejar dos veces el mismo pago.

**Puesta en marcha:** reiniciar backend tras deploy. Comprobar `ZKTECO_DIRECT_HOST/PORT`, conectividad TCP, `ZKTECO_AUTOSYNC_ENABLED=true` y, cuando las asociaciones ya estén verificadas en el C3, `ZKTECO_DRY_RUN=false`. Mientras DRY_RUN sea true, no se cambiará físicamente ningún tag. Si una lectura falla se reporta y no se marcará un inventario vacío como ausencia real. Las autorizaciones manuales siguen siendo responsabilidad de Seguridad/Administración.

### Corte general de casas sin pago (activación controlada)
Por defecto, la primera validación de pago crea el corte de su vivienda. Para aplicar
la fecha inicial **10/octubre/2026 también a casas que nunca hayan reportado un pago**,
existe `ZKTECO_ENFORCE_OCTOBER_CUTOFF=true`. Este proceso necesita además
`ZKTECO_DRY_RUN=false` y solo considera tags confirmados en el C3. Es una
operación de control de acceso masiva: primero revisar el inventario, los pagos,
la política condominal y una alternativa de acceso para residentes y emergencias.
Si hay saldos legítimos de octubre anteriores a la puesta en marcha, conciliarlos
antes de activar el modo general. Los bloques manuales nunca se levantan
por el procesamiento financiero.
