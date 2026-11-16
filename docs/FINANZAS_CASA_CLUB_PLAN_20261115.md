# Misión Jardines · Casa Club y plan de asignación de fondos (15-nov-2026)

## Correcciones del calendario
- La liga pública considera el **15/nov** el día actual, todavía válido hasta terminar ese día en `America/Mexico_City`. Solo fechas **anteriores** al día actual se deshabilitan por antigüedad; las ocupadas y la protección por falta de Google siguen aplicándose.
- Una solicitud **RECHAZADA/CANCELADA** no vuelve gris una fecha futura solo por conservarse en el historial del administrador. La fecha se muestra libre si ni MySQL ni reservas externas activas la ocupan. Las fechas pasadas reservadas siguen rojas para administración.
- No se eliminaron solicitudes, pagos, sanciones ni registros anteriores.

## Proyectos: estimado frente a real
- `metaEstimada` = importe de `presupuestoBase`; es una referencia de coste esperado y **no** entra en los egresos reales.
- `egresosReales` = suma de conceptos registrados, independientemente de las marcas `incluidoPresupuesto` y `pagado`.
- El saldo comparativo **no es saldo bancario**: aportaciones acumuladas menos egresos reales registrados.
- Ejemplo del proyecto de barandal: meta $138,600; ingresos $62,700; conceptos $24,432 y $29,300; egresos $53,732; diferencia a favor $8,968. El estimado restante ($84,868) **no es una deuda exigible ni un pago pendiente por sí mismo**.
- Para mostrar deuda efectiva, revisar los conceptos `pagado=false`. El detalle presupuestario histórico permanece visible por compatibilidad.

## Nuevo módulo «Administrar»
- Botón a la izquierda de «Generar recibo manualmente» en **Análisis de cuotas**. Solo los administradores que ya acceden a `/api/finanzas` pueden leer y guardar.
- Dos paneles: fuentes por Mantenimiento, Proyectos y Casa Club; gastos por los mismos ámbitos, con conceptos individuales, fecha, importe, estado pagado/pendiente y cuánto falta asignar.
- Orden por importes ascendentes/descendentes, búsqueda, selección accesible, arrastrar una fuente a un gasto, asignación parcial y remoción del borrador.
- Periodo del plan y periodo de origen del dinero independientes; se puede financiar un gasto con ingresos de un mes anterior. Los proyectos muestran su ingreso **acumulado** como fuente; la misma bolsa no puede asignarse dos veces en varios meses.
- Calcula por fuente los pesos todavía no asignados y el total no asignado. **Esto no equivale al saldo en bancos**: pagos, gastos históricos e ingresos de Google pueden requerir conciliación adicional.
- Notas de gestión hasta 1200 caracteres, `version` optimista, bloqueo de concurrencia y guardas de backend para no exceder los ingresos registrados ni el importe de un gasto. `GET/PUT /api/finanzas/plan-mensual`.
- **No** genera cargos, pagos, ingresos ni movimientos contables nuevos, transferencias reales, correos o actualización de TAGs.
- **Recomendación inteligente (heurística explicable)**: botón sobre el resumen del modal. Lee fondos disponibles en el mes de origen y los gastos registrados del mes del plan, descontando asignaciones existentes. Propone importes, muestra por cada gasto **fuente seleccionada, monto, motivo, fondos restantes, parte aún sin financiar**, además de los gastos que no pudo cubrir. Los motivos no son inventados por IA: reflejan reglas deterministas:
  1. Prioridad a gastos registrados **pendientes de pago**; dentro de ellos, necesidades esenciales de mantenimiento (vigilancia, CFE, SIAPA, Internet) y después fecha más antigua/monto mayor.
  2. Usar primero dinero del **mismo ámbito**. Los recursos de cada proyecto solo cubren automáticamente egresos de ese mismo proyecto, nunca otro proyecto. Las garantías reembolsables no se incluyen como ingreso operativo.
  3. Si un gasto pendiente no puede cubrirse con su ámbito, considerar un apoyo **temporal desde mantenimiento**, conservando el **20% del fondo de mantenimiento que sigue visible sin asignar**. La explicación advierte que no garantiza que el fondo sea realmente prestable ni que exista dinero bancario suficiente.
  4. **No presta automáticamente** recursos de Casa Club ni recursos de un proyecto a otros ámbitos. Los $25,550 históricos Google no se incluyen sin conciliación.
  5. Si no alcanza o falta información, mostrar cantidades pendientes y la razón de no asignarlas, sin fingir una solución.
- Pulsar **«Recomendación inteligente» no guarda ni modifica el borrador**; el administrador primero revisa la explicación, después puede pulsar «Aplicar al borrador (sin guardar)» y finalmente «Guardar plan del mes». Si descarta, mantiene intactas las asignaciones anteriores. Al cambiar de mes o editar el borrador se descarta la propuesta anterior para evitar aplicar cálculos obsoletos.
- Es **asistencia administrativa basada en reglas**, no pronóstico financiero ni optimización de liquidez auditada: no conoce vencimientos precisos, saldos bancarios conciliados, obligaciones de garantía o convenios de reembolso. Los préstamos internos deben verificarse y autorizarse humanamente.

### Despliegue seguro
1. Respaldar la BD en Hostinger. Desde el ajuste del 16/nov/2026, el backend **crea automáticamente** y de forma idempotente `finanzas_planes_mutex` y `finanzas_planes_mensuales` al iniciar y reintenta en consulta/guardado. Si la cuenta de MySQL no tiene permiso de creación, ejecutar manualmente `backend/sql/2026-11-15-finanzas-planes-mensuales.sql` con un usuario autorizado y reiniciar el backend.
2. Publicar juntos el backend y el frontend de este PR.
3. Verificar los roles: un condómino no debe consultar ni guardar `/api/finanzas/plan-mensual`.
4. Probar con valores pequeños en staging; recargar y editar un mismo plan con dos sesiones para comprobar HTTP 409 cuando la versión cambió. No usar pagos de producción como ensayo.

## Google Sheets · Casa Club 2026
- Hoja original: `MISION_JARDINES_CONTROL_CASA_CLUB_2026`, pestaña `MISION JARDINES 2026`, rango `A1:L1000`.
- Columna F: **PAGO RECUPERACIÓN**; columna L: **ESTATUS PAGO**. Solo se suman filas con L=`PAGADO` y un monto positivo en F; se excluye L=`CANCELADO`. Lectura verificada el 15/nov/2026: **$25,550 MXN**, **29 filas pagadas y 1 cancelada**.
- **Lectura automática del backend** (16-nov-2026): no depende de Drive OAuth ni del botón «Vincular Drive para respaldos», ni de `GOOGLE_SHEETS_ENABLED` o `CASA_CLUB_GOOGLE_SYNC_ENABLED`. Utiliza siempre el ID específico del archivo Casa Club y la pestaña `MISION JARDINES 2026`, en modo SOLO LECTURA. Primero intenta `CASA_CLUB_GOOGLE_CREDENTIALS_BASE64` (si está configurada); luego `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON_BASE64` como alternativa. No emplea `GOOGLE_SHEETS_SPREADSHEET_ID` porque podría apuntar a una hoja distinta. El ID se puede reemplazar con `CASA_CLUB_HISTORICO_SPREADSHEET_ID` si cambia el documento. **La cuenta de servicio debe tener acceso de Lector al documento correcto**.
- El indicador en **Análisis de cuotas → Casa club** distingue claramente recaudación histórica Google de cobros MySQL. **No se suman los $25,550 a la caja hasta conciliar por fecha, recibo y pago bancario**, para no duplicar ingresos. El mes D del evento **no es la fecha del depósito**; su desglose no autoriza calcular el flujo mensual de caja.
- Si Google no responde, el backend conserva finanzas MySQL y muestra histórico no disponible; revisar ID, permisos de lectura y nombre de pestaña.

## Folios duplicados en RESERVACIONES
Se detectaron **7 filas `CC-`** con coincidencia de vivienda y fecha con folios previos `MJ-`:
| Fila `CC-` | Fila histórica `MJ-` |
|---:|---:|
| 15 | 10 |
| 16 | 11 |
| 17 | 9 |
| 18 | 7 |
| 19 | 12 |
| 20 | 13 |
| 21 | 14 |

**Cuatro de esos siete pares tienen nombres de solicitante distintos.** Una coincidencia de vivienda/fecha es señal de posible doble registro, **no** autorización para eliminar solicitudes. La hoja en vivo **no se modificó** en este PR. Primero respaldar la pestaña y conciliar el nombre/origen/estatus de cada par. Luego archivar la fila redundante validada (no sobrescribir el folio histórico ni inventar pagos).

El sincronizador de este PR:
- deja de generar folios externos `CC-id` para nuevas exportaciones; usa `MJ-YYYYMMDD-NNNNN` de forma estable a partir de la fecha y el ID de la reserva;
- detecta espejos de nuestros propios `MJ` para no reimportarlos;
- no vuelve a exportar una vivienda/fecha que ya exista en la hoja bajo otro folio;
- **no borra ni cambia automáticamente** filas existentes: se preserva auditoría y diferencias de nombres.

La sincronización con Google no debe activarse sin revisar primero permisos de cuenta de servicio, duplicados y coherencia de la importación. Si el formulario antiguo sigue admitiendo solicitudes sin consultar MySQL, hay riesgo residual de colisión y requiere una actualización de Apps Script.

## Validación
- Compilación de ocho archivos JS de front/backend revisada en el runtime de desarrollo; prueba de cálculo de $53,732 y +$8,968 verificada.
- No hubo conexión a MySQL Hostinger, banco, correo ni ejecución de migraciones o cambios de Google Sheets en vivo. Es indispensable probar en staging y luego con administrador en navegador real.


## Ajuste responsive y disponibilidad del plan (16-nov-2026)
- Se retiraron los dos grandes campos mensuales de la cabecera. **Mes del plan** vive dentro de la barra compacta de acciones sobre las dos tablas; se puede cambiar con flechas o abrir el selector mensual nativo. **Mes de origen** vive dentro de los filtros del panel de ingresos.
- El encabezado y botón Guardar permanecen visibles mientras se navegan las filas en iPhone. El modal ocupa el alto de la pantalla del iframe, con tarjetas apiladas y búsqueda de egresos a ancho completo. Se unificaron controles, jerarquías y tonos pastel con el portal.
- Si MySQL no puede consultar las tablas de planes, los ingresos y egresos se siguen cargando desde el análisis con un aviso específico y botón Reintentar. Mientras el plan no esté verificado, se deshabilitan asignaciones, sugerencias y guardado para no sobrescribir operaciones existentes.
- Las tablas de planes se preparan automáticamente sin migraciones destructivas, mediante `backend/src/services/finanzas-planes-schema.service.js`, y se reintenta si falló el arranque. No cambia cobros, Casa Club, ZKTeco ni registros financieros existentes.
- Para activar el cambio se debe desplegar **el backend actualizado y el frontend juntos**; refrescar solo la web estática no creará las tablas en Hostinger. No se ejecutó directamente ningún SQL en la BD de producción durante el desarrollo.

### Activación automática sin botón de Google Drive
1. Verificar que la API Google Sheets esté habilitada en el proyecto de Google Cloud correspondiente a la cuenta de servicio. El usuario que abre el portal no necesita autorizar OAuth de Drive.
2. Si la sincronización de reservas ya usa `CASA_CLUB_GOOGLE_CREDENTIALS_BASE64`, el backend reutiliza esa credencial, sin pedir otra cuenta. En caso contrario, puede reutilizar `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON_BASE64`. Si **ninguna** está configurada, se deberá agregar al backend de Hostinger una cuenta de servicio: este PR **no crea ni publica claves privadas**.
3. Compartir **`MISION_JARDINES_CONTROL_CASA_CLUB_2026`** con el correo `client_email` del JSON de la cuenta de servicio, como **Lector**. No convertir la hoja en pública.
4. Desplegar frontend y backend juntos, reiniciar Node en Hostinger, entrar a **Análisis de cuotas → Casa club**. Se mostrará `Conectado automáticamente · solo lectura` con total histórico, fecha de última consulta y número de registros. El total se actualiza como máximo cada 2 minutos por caché y al refrescar los datos de análisis.
5. Si no hay permisos, falta el archivo o cambiaron las columnas, el usuario administrador verá un mensaje específico (sin revelar credenciales). Los demás indicadores MySQL seguirán disponibles.

**Importante:** `Vincular Drive para respaldos` se conserva porque sirve para exportar recibos a Drive y es **independiente** de la lectura de Casa Club. La conexión del histórico **no requiere pulsarlo nunca**. La pestaña `RESERVACIONES` y el formulario libre no se modifican por esta lectura. Los $25,550 verificados el 15-nov-2026 siguen siendo un histórico pendiente de conciliación y no se suman automáticamente a ingresos de MySQL, para evitar duplicados.

## Actualización 16-nov-2026 · Autorizaciones y estado de conexiones
- **Tarjeta retirada:** `Reservas pagadas en MySQL` (por solicitud del cliente). Ahora las tarjetas muestran `Ingresos autorizados · vigentes`, `Cobros verificados (MySQL)`, `Egresos Casa Club` y el histórico Google 2026 (si está disponible), además de casas en padrón.
- **Aprobación administrativa = PAGADO en el panel de consulta**, también para reservas anteriores aprobadas y reservas futuras aprobadas. Esto es una **clasificación operativa** para el administrador, nunca una afirmación de conciliación bancaria. La tabla incluye la nota `Autorización administrativa · pendiente de conciliar` cuando no hay un comprobante validado.
- En la columna de importes de Casa Club se muestra `$X (autorizado)`: es la suma de recuperación, limpieza y depósito de garantía según las tarifas persistidas; el depósito es reembolsable y no es ingreso operativo. Se cambió el título `Último mes pagado` a `Mes de reserva autorizada` al seleccionar Casa Club.
- **No se cambian** `reservas_casa_club.pagado`, `fecha_pago`, `PagoReportado`, `PagoManualConcepto` ni el proceso de Titan. `montoPagado` se conserva como importe real en la respuesta; `montoAutorizado` y `autorizacionSinAcreditar` son campos específicos de presentación. Ningún pago bancario se inventa ni se emite un recibo por una mera autorización.
- El indicador `Recuperación autorizada · vigente` suma las reservas aprobadas activas una sola vez por ID y **solo la cuota de recuperación**, sin considerar limpieza ni depósitos de garantía reembolsables. El detalle mensual se clasifica por `fechaLimitePago` o fecha del evento, mientras que el indicador vigente suma todas las reservas activas para atender aprobaciones de meses futuros. `Cobros verificados (MySQL)` continúa calculándose por `fechaPago`, sin duplicar autorizaciones. Las **tarjetas de balance** y las fuentes asignables del modal Administrar siguen usando cobros efectivamente confirmados, no estimaciones.
- Se presenta sobre los indicadores una **barra visible de dos conexiones independientes**: `Google Sheets · Casa Club` (estado de lectura automática, 2026) y `Google Drive · respaldos` (consulta automática a `/api/finanzas/drive/status`, cuenta vinculada y carpeta). El botón `Vincular Drive para respaldos` se conserva porque es necesario únicamente para exportar recibos y NO para leer Casa Club.
- Aprobar/rechazar en Casa Club emite una señal sin datos personales por `localStorage` para que otras pestañas del mismo origen actualicen el análisis de inmediato. Al volver a abrir Análisis se hace la consulta inicial habitual. En otros navegadores o dispositivos se mantiene la actualización periódica de Finanzas.
- **Pruebas:** servicio puro de autorización, estados de visualización, exclusión de rechazados, prevención de doble conteo, garantías separadas y estados de conexión. No se ejecutaron migraciones, cobros ni modificaciones en Hostinger/Google Drive de producción.


## Corrección de distribución financiera Casa Club · 16-nov-2026 (PR #437)
- **Cuota de recuperación ($1,000 por reserva actual)**: único **ingreso operativo** en las tarjetas y en el fondo asignable del plan. Se respeta la tarifa persistida de cada reserva (las anteriores pueden tener importes diferentes).
- **Depósito de garantía ($700 por reserva actual)**: se conserva como **obligación reembolsable** y se expone como tal, sin sumarlo a ingresos ni a egresos. La devolución depende del estado en que se entregue Casa Club; la app no genera ni ejecuta una devolución automática.
- **Limpieza ($300 por reserva actual)**: se considera **costo previsto**, no ingreso operativo. Las tarjetas de egresos muestran los egresos reales del ámbito y, si falta registrar el servicio de limpieza, una **provisión visual** por la diferencia. Si el administrador ya registró un egreso que contiene «limpieza» o «aseo», sustituye esa parte y **no se duplica**. No se crean filas de egreso, comprobantes ni movimientos bancarios. Los egresos no relacionados con limpieza que ya existan siguen visibles para no ocultar gastos reales.
- **Ejemplo del caso presentado:** dos reservas pagadas con tarifas 1000/700/300 y sin gastos de limpieza cargados en MySQL = recuperación $2,000, limpieza provisionada $600, garantías reembolsables $1,400, diferencia del período $1,400. La provisión representa un costo comprometido, no demuestra que ya se haya pagado al proveedor.
- **Reservas solo autorizadas:** se muestran como `PAGADO` por autorización en la tabla y contribuyen a `Recuperación autorizada · vigente`, pero **no** al fondo de cobros efectivos, a la gráfica de ingreso cobrado ni a la provisión asociada a un pago efectivo. El compromiso de limpieza para todas las autorizadas se muestra aparte en los indicadores secundarios.
- **No reescribir historiales Google:** los $25,550 de la columna F de la hoja son recuperación histórica, sin duplicarlos en el flujo bancario MySQL. El historial bancario bruto por recibo puede incluir recuperación, limpieza y garantía, y no se altera ni se reemplaza por un importe inventado.
- Si los egresos reales de limpieza se registran con un concepto que **no menciona «limpieza» ni «aseo»**, deben reclasificarse/conciliarse antes de comparar con la provisión, pues el sistema no puede asociarlos de manera fiable a una reserva específica solo por el importe.
