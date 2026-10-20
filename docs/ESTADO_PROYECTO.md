# Estado actualizado de Misión Jardines

**Última revisión:** 19/oct/2026, 23:27, America/Mexico_City.
**SHA de main consultado:** `9e226f5124688aaeeebe57850723b10fb3e12e40`.
**Fuentes de esta revisión:** comparación de main desde `3fcff016c3fbd000f9bb2c16da4ec86619cf9a12`,
metadatos y descripciones de los PR #208–#219, commits y estados/checks en GitHub,
AGENTS.md e índice vigentes, historial ya registrado y conversación recuperada. La evidencia
de conversación se limita a confirmaciones y resultados accesibles; no se infieren operaciones
desde archivos SQL propuestos. No se consultaron directamente MySQL, Hostinger, correo,
Google Sheets ni el C3 de producción durante esta revisión.

Leer junto con [AGENTS.md](../AGENTS.md),
[índice de documentos](INDICE_DOCUMENTOS.md) y
[reglas de pagos/C3](PAGOS_ACCESO_C3.md). Este archivo conserva estado y evidencia;
no redefine las reglas de negocio ni sustituye las fuentes originales.

## Resumen operativo

| Área | Estado | Evidencia y límites |
| --- | --- | --- |
| Pagos de mantenimiento | Implementado en main | Mensualidad $300; recargos $50 por corte vencido no cubierto; meses desde fecha física C3; saldo remanente; corte inclusivo día 10. Ver AGENTS.md |
| Confirmación de comprobantes | Revisión administrativa activa | `VALIDAR_PAGOS_SIN_ADMIN=false`; un recibo provisional no confirma depósito ni entrega de fecha al C3 |
| OCR | Tesseract.js en servidor y navegador | Monto/cuenta separados; campos bancarios de condóminos son de solo lectura y el servidor exige folio, monto, fecha y hora. PR del 13/oct corrigió PSM del navegador; pruebas locales no acreditan el frontend desplegado ni recepción del dinero |
| Escritura C3 por pago | DIRECT con diario e idempotencia | Sin bridge en ese flujo; no asigna puertas ni elimina bloqueos manuales. Estado financiero y entrega física son distintos |
| Edición manual de TAGs | Implementada en main; validación pendiente | PR #205 permite de nuevo habilitar, crear, reasignar o agregar TAGs aun con adeudo y restaura la edición de vigencia en el espejo SQL. `bloqueado=false` no prueba `userauthorize` en el C3; dos expectativas históricas de `editTag` siguen fallando en simulación |
| Inventario C3 | Lectura periódica y manual | Reflejo SQL; no volver a usar fechas heredadas para sobreescribir el controlador |
| Cuentas y viviendas | Relación múltiple implementada en main; migración final pendiente | PR #215 usa `condominos_viviendas` para padrón, búsqueda, cuotas, tablero y prerregistro de todos los domicilios; #216 retira `condominos.direccion_id` del modelo/código. El usuario aportó CSV con 188 relaciones originales, 188 copiadas y cero faltantes. Faltan despliegue ordenado y ejecutar/verificar los SQL 01/02 antes de retirar la columna física |
| Conmutador | Integración futura | No se confirmó funcionamiento con hardware en esta revisión; consultar configuración antes de habilitar telefonía |
| Confirmación por correo bancario | Propuesta | Sin conexión de buzón ni conciliador implementado. Falta revisar una notificación real y datos de operación |
| Automatización de pruebas PR #132 | Revertida | Reversión en main: `5828fca4d7e68e4a5d72141b9678aabba9482b36`; no usar sus comandos/workflow como si siguieran disponibles |
| Depuración de viviendas | Fusión de tres pares reportada por el usuario | Falta confirmación explícita de COMMIT y lectura posterior desde otra conexión; cinco registros externos siguen pendientes según la conversación. No hay verificación nueva de producción |
| Interfaz responsive y fechas | Implementada en main; validación visual pendiente | #200–#202 corrigen Noticias móvil. PR #208 unifica fechas visibles a DD-MON-YYYY sin alterar valores ISO; #211–#214 y #219 ajustan Estado/Pagado, selección de filas y detalle de TAGs. Faltan Safari/iPhone/Android, selectores nativos y producción |
| Historial administrativo de pagos | Implementado en main; producción no verificada | PR #160–#162 conservan historial 11–10. PR #209 añade historial por vivienda/concepto, total del último movimiento y separación explícita entre vigencia C3 verificada y MySQL; #214 oculta solo el aviso naranja, no la diferencia. No corrige fechas automáticamente |
| Pagos manuales desde Análisis | Implementado en main; migración/uso real pendientes | PR #171 y #173–#176 implementan pagos manuales de mantenimiento; #190 separa el botón por vivienda. PR #193 amplía el registro manual por concepto y mantiene extraordinarias/casa club separadas de la vigencia física de mantenimiento. No se ejecutó la migración ni se probó con MySQL/C3 reales |
| Auto-users | SMTP y login por teléfono implementados en main; despliegue pendiente | PR #192 fusionado reemplaza WhatsApp en este flujo por SMTP, añade acceso progresivo por teléfono y alertas de solicitudes, integrado con sesiones opcionales de 90 días y avisos actuales. Reporta 112 pruebas locales con DB/SMTP simulados; faltan configuración, envío controlado y despliegue conjunto frontend/backend |
| Seguridad, pluma y cámaras | Parcialmente implementado; hardware no verificado | PR #159 reutiliza el endpoint de pluma y prepara proxy HLS; #163 añade diagnóstico; #164 retira el visor Dahua de Seguridad, conservando backend/documentación. PR #189 habilita Inicio operativo a Seguridad con visitas de hoy y accesos sin salida, sin finanzas. Falta gateway RTSP→HLS, despliegue y pruebas con cuentas/hardware reales |
| Visibilidad del padrón | Filtro de lectura en main | PR #177–#178 muestran solo Guadalajara 707 y Valle de México 3614 en listados compartidos. No borran ni fusionan direcciones, pagos o TAGs; falta verificar consultas reales de producción |
| Finanzas históricas y dashboard | Implementado en main; producción no verificada | PR #143–#151 conectan cuotas, egresos, ingresos y saldo inicial; #180 acumula adeudo; #189 separa vistas por rol; #191 muestra anticipos sin proyectar deuda. PR #193 incorpora adeudos desglosados e indicadores por concepto. Requiere migración, padrón conciliado, cotejo MySQL y despliegue reales |
| Cuotas para Seguridad | Implementado en main; producción no verificada | PR #140 añade ruta autenticada y tabla paginada sin nombres/teléfonos. Calcula desde `direcciones`/`cuotas`, no desde TAGs ni Sheets; no se consultó la DB real |
| Históricos Google Sheets | Backend/staging opcional conservado; controles retirados de Análisis | PR #140 añadió lectura OAuth y preparación idempotente, deshabilitadas por defecto. PR #187 retiró solo la tarjeta y el script de esa vista; no borró archivo, endpoint, tabla ni datos. Requiere decisión explícita, migración y validación antes de activar |
| Análisis, historial y recibos | Implementado en main; MySQL/C3 no verificados | #203 conserva tres conceptos; #209 agrega historial y total del último movimiento. #217–#219 generan recibos PDF mensuales de mantenimiento, selección por fila, teléfono editable solo para ese envío y exportación `.xlsx` desde indicadores. WhatsApp descarga el PDF y abre el chat: el administrador debe adjuntarlo y confirmar; no registra envío ni modifica pagos |
| Navegación de Administración/Comunidad | Implementada en main; validación visual pendiente | PR #187 oculta Cuotas del menú y retira la tarjeta de conciliación; #188 oculta las pestañas de Análisis, conserva sus elementos/rutas y ordena Comunidad con Pagos primero. Son cambios de interfaz, no borrado de datos ni cambio de permisos |
| Inicio por rol | Implementado en main; producción no verificada | PR #189 conserva finanzas para administradores; Seguridad recibe alcance general y Condómino solo viviendas vinculadas. PR #193 añade avisos/indicadores de adeudo por concepto. Falta migración, suite completa, cuentas reales y MySQL de producción |
| Cobranza extraordinaria y casa club | Implementada en main; bloqueada hasta preparar producción | #193 añade cargos/reservas. PR #210 fija que Casa club se bloquea por mantenimiento y/o extraordinarias exigibles, no por una deuda previa exclusiva de Casa club; devuelve desglose 409 y valida pertenencia. Requiere migración, padrón exacto de 231 y prueba real |
| Noticias y tráfico | Implementado en main; proveedor/despliegue no verificados | PR #195–#202 dejan noticias locales de siete días, fuente FreeNewsApi con reintento, búsqueda vial, prioridad local y correcciones móviles; TomTom/Google son opciones para tráfico y la clave TomTom queda detrás de proxy autenticado. Las pruebas usan proveedores simulados; faltan conectividad desde Hostinger, credenciales reales y revisión visual física |
| Monitor automático de adeudos C3 | Implementado en main; apagado por defecto | #204–#205 conservan piloto/dry-run y operaciones manuales. PR #210 limita el monitor exclusivamente a deuda de mantenimiento: extraordinarias y Casa club no bloquean TAGs ni cambian vigencias. No auto-reactiva al saldar. Sin prueba física ni escritura de producción |
| Continuidad documental | Disponible en main | AGENTS.md e índice publicados; PR #193 añadió guía de tres conceptos y SQL diagnóstico. PR #204/#206 documentan mapa SQL y 18 casos ZKTeco; #207 publica en la raíz `PLAN_PRUEBAS_INTEGRAL_20261018.md` con 24 secciones y seis recorridos integrales. Es un guion de aceptación, no evidencia E2E |

Un merge no acredita despliegue en Hostinger ni prueba física de una pluma.
No se verificaron los valores efectivos de variables de producción.
Desde el SHA consultado en la revisión anterior, main avanzó 32 commits. Se fusionaron los
PR #208–#219 y no quedaron PR abiertos. El commit
`402de9951fa8fdd4f35638c93843f41154840a3f`, dedicado a la bitácora del 18/oct,
se excluye del trabajo de producto. Los merges acreditan presencia en main, no despliegue en
Hostinger, ejecución de migraciones, datos de MySQL ni funcionamiento físico de C3/Dahua.
El PR #132 continúa revertido y no se restauraron sus comandos/workflow.

## Pruebas físicas y de operación confirmadas por el usuario

Confirmaciones anteriores conservadas de la conversación; fecha/hora exacta de cada
prueba no verificada. No se ejecutaron de nuevo al crear este archivo.

| Caso | Confirmación | Alcance |
| --- | --- | --- |
| Pago de prueba con TAGs de una misma vivienda | El usuario informó que todos cambiaron después de validar como administrador | Confirma esa prueba concreta; no prueba todas las viviendas ni autoaprobación |
| Reutilización de folio durante pruebas | Tras revisar/limpiar el diario antiguo, el usuario informó que volvió a funcionar | No autoriza reutilizar referencias reales; cada depósito distinto requiere su referencia |
| Alta directa de TAG | El usuario informó apertura con un TAG de otra vivienda | Hubo otro caso que requirió ZKAccess; no considerar todas las altas físicas confirmadas |
| Lirios 7 | Confirmó COMMIT, conservación del ID 113 y eliminación del duplicado 726 | Corrección reportada por el usuario, no nueva consulta en vivo |
| Jardines 12/120, 16/160, 36/360, 38/380 | Confirmó que se resolvieron | Distintos de los posibles duplicados 21/201, 25/205, 29/209, 37/307 |
| Depuración adicional de tres pares de viviendas | El usuario respondió «ccreo que ya quedo» después de ejecutar el bloque y aportar una captura | Reporte del usuario accesible en la transcripción del 10/oct; captura no inspeccionada en esta revisión. COMMIT, persistencia, respaldo y modo seguro no confirmados de forma independiente; no acredita cambios físicos en C3 |
| Nueve TAGs sin casa | El usuario dijo resueltos | Sigue discrepancia con 42-3.csv. El 19/oct se entregó una consulta para los nueve TAGs, pero no se recibió su resultado; no cerrar todavía |
| Tabla `condominos_viviendas` | El usuario aportó CSV de la migración: 188 relaciones originales, 188 copiadas y cero faltantes | Confirma esos archivos/resultados, no una conexión en vivo ni la eliminación de `condominos.direccion_id` |
| Precuentas pendientes | El usuario confirmó el borrado de 159 precuentas PENDIENTES/no aceptadas | Confirmación de conversación; no se recuperó una exportación posterior ni COMMIT/lectura independiente |
| Procedimiento de conciliación del padrón | El usuario mostró `CALL mj_conciliar_padron_20261019()` con error 1644: ya había respaldos o conciliación de esa ejecución | Confirma el intento bloqueado; no demuestra que la conciliación final, sus conteos o su COMMIT sean correctos |

## Pruebas automatizadas con resultado conocido

| Fecha | Código / comando | Resultado | Interpretación |
| --- | --- | --- | --- |
| 10/oct/2026 | Rama del PR #132, `DB_PORT=3306 npm run test:flujos` | 80 aprobadas, 0 fallidas | **Histórico:** ese PR fue revertido. Incluía un ajuste de simulación de OCR; no implica que main actual tenga 80 pruebas verdes |
| 10/oct/2026 | main `5828fca`, `DB_PORT=3306 node --test backend/test/pagos-acceso-c3.test.js backend/test/recargos-mantenimiento.test.js backend/test/zkteco-vigencias.test.js backend/test/zkteco-autosync.test.js` | **35 aprobadas, 2 fallidas** | SQL/TCP simulados; no se escribió al C3 ni a MySQL de producción |
| 10/oct/2026, 00:15–00:16, America/Mexico_City | PR #132, head `e9b85ad`; desde backend, `DB_PORT=3306 npm run test:flujos`; [Actions 38030320492](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/38030320492) | **80 aprobadas, 0 fallidas**; job `flujos` success; `cuentas-servidor` skipped | Logs recuperados en esta revisión; resultado histórico de código revertido, no prueba de main actual ni del servidor |
| 10/oct/2026 | Documentación de continuidad: enlaces relativos y `git diff --check` | Sin errores | Solo valida archivos/enlaces; no funcionamiento de backend o equipo |
| 11/oct/2026, 23:36, America/Mexico_City | main `ebed7ff`; `node --test tests/ui-responsive.test.cjs tests/ui-unificada.test.cjs tests/ui-inicio-kpis-reportes.test.cjs tests/ui-kpi-compact.test.cjs tests/ui-seguridad-analisis-distribucion.test.cjs backend/test/seguridad-sheets-mobile.test.js` | **26 aprobadas, 3 fallidas** | Pruebas locales/estructurales. Los tres fallos esperan versiones antiguas de cache busting (`sin-conexion`, `kpis-compact`, `mobile-operativo ...-b`) reemplazadas por versiones posteriores; la suite de main queda roja hasta actualizar/conciliar esas expectativas |
| 14/oct/2026 | PR #180–#189; archivos de prueba y validaciones aisladas descritos en cada PR; comandos completos no publicados | #181: 11; #182: 6; #183: 6; #184: 8; #185: 5; #186: 6; #187: 5 comprobaciones satisfactorias; #180/#188/#189 sin total publicado | Resultados declarados en las ramas/PR; no se volvieron a ejecutar y GitHub no acredita CI del main |
| 15/oct/2026 | PR #190, pruebas/sintaxis de columna Pago; comando completo no publicado | **18 comprobaciones pasaron** | Resultado declarado en el PR; sin ejecución nueva de esta revisión, MySQL ni C3 |
| 15/oct/2026 | PR #191, filtro Mes/Año, regresión de deuda/TAG/pagos y sintaxis; comando completo no publicado | **30 comprobaciones pasaron** | Resultado declarado en el PR; falta MySQL real y revisión visual de navegador/Safari |
| 17/oct/2026 | PR #192 antes de su integración final; suites de SMTP simulado, autenticación, login UI, prerregistro, solicitudes y permisos; comando no publicado | **76 pruebas aprobadas** | Resultado histórico de la rama; queda sustituido para el estado actual por la ejecución integrada de 112 pruebas del 18/oct |
| 17/oct/2026 | PR #193, pruebas dirigidas de adeudos, casa club, egresos, pagos, recargos, sesión y prorrateo; comando y totales no publicados | Reportadas como aprobadas; otros tests antiguos no validados por expectativas obsoletas o restricción de subprocesos | No acredita suite completa, migración, MySQL ni C3 |
| 17/oct/2026 | PR #194, `git diff --check` y comprobación estática de pestañas/CSS | Sin errores; tres pestañas y regla de tres columnas presentes | Solo valida el cambio de presentación; falta navegador real |
| 18/oct/2026 | PR #192, `DB_PORT=3306 node --test backend/test/recordar-sesion.test.js backend/test/auto-users*.test.js backend/test/telefono-cuenta.test.js backend/test/login-telefono-ui.test.js backend/test/registro-invitacion.test.js backend/test/auth-permissions.test.js backend/test/permissions.test.js backend/test/cuentas-ui.test.js backend/test/cuentas-verificacion.test.js backend/test/registro-smtp-diagnostico.test.js backend/test/cuotas-extraordinarias-casa-club-202610.test.js backend/test/casa-club.test.js backend/test/analisis-tres-conceptos.test.js backend/test/noticias-ui.test.js backend/test/noticias-locales.test.js`; además `DB_PORT=3306 node --test backend/test/sidebar-avisos-integrados.test.js` | **111 + 1 = 112 aprobadas** | DB/SMTP simulados; no prueba envío real, producción ni C3 |
| 18/oct/2026 | PR #195, `node backend/test/noticias-locales.test.js`, `node --check` y `git diff --check` | **3 pruebas pasaron**; sintaxis/diff sin errores | GDELT de siete días quedó después sustituido por FreeNewsApi en #196 |
| 18/oct/2026 | PR #196, desde backend `DB_PORT=3306 node --test test/noticias-locales.test.js test/noticias-locales-ruta.test.js`; sintaxis/diff | Todas pasaron; peticiones de prueba a FreeNewsApi devolvieron artículos recientes | No acredita conectividad desde Hostinger |
| 18/oct/2026 | PR #197, `DB_PORT=3306 node backend/test/trafico-teselas-ruta.test.js` y `... noticias-locales-ruta.test.js`; `node --check`/diff | **3 + 1 pruebas aprobadas**; sintaxis/diff sin errores | TomTom y noticias simulados; claves/visual real pendientes |
| 18/oct/2026 | PR #198–#202, comandos `DB_PORT=3306 node --test test/noticias-*.test.js test/incidencias-idioma.test.js test/trafico-teselas-ruta.test.js test/dashboard-operativo-roles.test.js` según cada PR; `node --check`/diff | #198: **5 archivos**; #199: **6**; #200: **4**; #201: **5**; #202: **5**, todos correctos | Proveedores simulados; falta despliegue y validación física Safari/iPhone/Android |
| 18/oct/2026 | PR #203, 11 archivos de Análisis/pagos/padrón + 3 de mantenimiento/C3/Casa club; comando exacto no publicado; `node --check`/diff | **14 archivos correctos**; sintaxis/diff sin errores | Dobles de prueba; falta MySQL real, despliegue y conciliación 231 |
| 18/oct/2026 | PR #204–#205, ocho suites seleccionadas/relevantes; comando exacto no publicado | **8 suites aprobadas** en cada PR; `zkteco-vigencias.test.js` conserva 2 fallos históricos | C3/MySQL simulados; no hubo escritura física |
| 18/oct/2026 | PR #206, seis archivos de test y `zkteco-vigencias.test.js`; comando exacto no publicado | Seis archivos pasan; vigencias **7/9**, con los mismos 2 fallos históricos | Auditoría documental; no E2E físico |
| 18/oct/2026 | PR #207, `git diff --check`, conteo de secciones/flujos y verificación de enlaces Markdown | Sin errores; **24 secciones, 6 flujos**, enlaces válidos | Solo documentación; no prueba código, DB, Hostinger o C3 |
| 19/oct/2026 | PR #208, `node tests/date-display.test.cjs`; `node --check`; sintaxis embebida en 24 páginas; `git diff --check` | **7/7 aprobadas**; sintaxis/diff correctos | Solo presentación; suites UI heredadas conservan expectativas obsoletas |
| 19/oct/2026 | PR #209, `node --test backend/test/historial-pagos-vivienda.test.js backend/test/pagos-manuales-analisis.test.js backend/test/analisis-columna-pago.test.js backend/test/analisis-tags-zkteco.test.js`; sintaxis/diff | **4 archivos pasan** | No prueba Hostinger, MySQL ni C3 |
| 19/oct/2026 | PR #210, `DB_PORT=3306 node --test --test-reporter=tap backend/test/casa-club.test.js backend/test/zkteco-adeudos.test.js backend/test/elegibilidad-casa-club.test.js backend/test/analisis-tres-conceptos.test.js backend/test/pagos-manuales-analisis.test.js backend/test/historial-pagos-vivienda.test.js`; sintaxis/diff | **6 archivos aprobados** | DB/C3 simulados; política física pendiente |
| 19/oct/2026 | PR #211–#214, pruebas dirigidas de `analisis-columna-pago`, elegibilidad, historial, sintaxis y diff según cada PR | #211: **2 archivos**; #212–#214: prueba dirigida correcta en cada uno | Cambios de UI; no datos, SQL ni C3 |
| 19/oct/2026 | PR #215, suites de Auto-users, residentes, búsqueda, viviendas y permisos; comando exacto no publicado | **84 pruebas aprobadas**; sintaxis/diff correctos | DB/SMTP simulados; CSV del usuario es evidencia separada |
| 19/oct/2026 | PR #216, suites de altas/correcciones y SQL generado sin `direccion_id`; comando exacto no publicado | **85 pruebas aprobadas**; sintaxis/diff correctos; cero referencias en `backend/src` | Scripts 01/02 no ejecutados por el PR en MySQL real |
| 19/oct/2026 | PR #217, siete suites relacionadas, generación PDF en memoria, comparación visual y `git diff --check` | **7 suites aprobadas**; PDF comparado con ejemplo | No modifica pagos/datos; envío por WhatsApp es manual |
| 19/oct/2026 | PR #218, siete archivos dirigidos, `node --check`, diff, render PDF y Excel sintético | **7 archivos aprobados**; PDF con logo; Excel probado con 232 filas sintéticas | Suite estructural amplia aún falla por caché/markup antiguo; sin producción |
| 19/oct/2026 | PR #219, seis suites dirigidas de Análisis/recibos, `node --check` y diff | **6 suites aprobadas** | `analisis-tags-compacto` conserva 2 expectativas obsoletas; falta visual real |

Los dos fallos están en `backend/test/zkteco-vigencias.test.js`:

- `manual date edit persists without queueing the old maintenance cutoff`.
- `editing a house association never queues an old SQL cutoff`.

En ambos casos el C3 simulado conservó EndTime `20260910`, cuando se esperaba
`20261110`. Falta investigar código y preparación de la prueba; no se corrigió
al añadir documentación. Conservar estos resultados hasta una ejecución nueva
que explique y confirme su resolución.

GitHub devolvió cero estados de commit y cero workflow runs para los 12 commits de merge
de #208–#219. Por tanto, no hay CI acreditado para estos cambios. Los resultados son los
declarados en cada PR y no se repitieron en esta revisión. Además de los dos fallos históricos
de `zkteco-vigencias.test.js`, #219 documenta dos expectativas obsoletas en
`analisis-tags-compacto`; #208/#218 advierten suites estructurales antiguas aún incompatibles.
No se ejecutaron pruebas contra MySQL, Hostinger, correo SMTP real, NVR Dahua ni C3 reales.

## Cotejo de base: exportaciones del 10 de octubre

No es un estado en vivo. Fuente: padrón oficial y CSV detallados en el índice.

| Resultado | Estado |
| --- | --- |
| 233 direcciones del padrón presentes en CSV SQL | Confirmado por comparación de calle/número, normalizando Av. y acentos; incluye Jardines 142 marcada inexistente |
| 242 filas de viviendas en SQL exportado | 206 con TAG asociado y 36 sin asociación |
| 36 viviendas SQL sin TAG | 27 aparecen en padrón; 8 fuera del padrón y Jardines 142 marcada CASA NO EXISTE |
| Vivienda ficticia | Prueba TEST-001, ID 738, TAG 5112343, ya asociado en el CSV; fuera del padrón por su propósito |

Las 27 viviendas del padrón sin TAG y los 8 registros externos se enumeran en
[el índice](INDICE_DOCUMENTOS.md#estado-del-cotejo-fotografía-del-10-de-octubre).
Sin una lista anterior comparable, no afirmar cuáles de las antiguas 42 se
resolvieron solo por diferencia de conteos. Una vivienda real puede no tener
TAG entregado; confirmar antes de asignar. Ninguna fila fue borrada durante el cotejo inicial.
Posteriormente el usuario reportó completada la fusión de tres pares. Conservar los conteos
anteriores como fotografía histórica, sin restar filas para inferir el estado actual de SQL.
El índice conserva la hipótesis antigua de coincidencia de residente para uno de los pares;
la conversación posterior la retiró y dejó ese destino sin confirmar. Este proceso no modifica
el índice ni publica datos personales o contenido adicional del padrón.

## Pendientes y próxima evidencia necesaria

| Pendiente | Qué falta para cerrarlo |
| --- | --- |
| Dos pruebas históricas fallidas de edición de TAG | PR #205 restauró la conducta manual solicitada, pero `zkteco-vigencias.test.js` sigue 7/9 por expectativas antiguas de `editTag`. Diagnosticar, acordar el comportamiento esperado y repetir sin ocultar SQL/C3 divergentes |
| Tres regresiones estructurales posteriores a los PR #138–#141 | Repetir la suite actual y confirmar si las expectativas antiguas de assets siguen fallando o ya fueron sustituidas; no declarar main verde sin ejecución nueva |
| PR #208–#219 sin CI acreditado | Ejecutar una suite reproducible sobre main `9e226f5`; conservar los fallos/expectativas obsoletas visibles y comprobar despliegue por separado |
| Auto-users por SMTP en producción | Desplegar frontend/backend juntos, configurar SMTP y URL pública sin publicar secretos, probar aceptación/recuperación y un envío controlado. `ENVIADO` solo acredita aceptación del servidor SMTP, no entrega al destinatario |
| Migración de cobranza por concepto | Respaldar DB, revisar y ejecutar manualmente `backend/sql/2026-10-18-cuotas-extraordinarias-casa-club.sql` primero en prueba; después correr consultas diagnósticas. No desplegar backend/frontend nuevo antes del esquema |
| Padrón y relaciones condómino-vivienda | El CSV reporta 188 pares copiados sin faltantes, pero el intento posterior de `mj_conciliar_padron_20261019()` devolvió error 1644 por ejecución/respaldo existente. Revisar respaldos/bitácora y conteos posteriores desde otra conexión; no afirmar todavía 231/232 ni COMMIT final |
| Casa club y tres conceptos | Probar roles, autorización, adeudos, fechas límite, comprobantes y expiración. Confirmar la nueva política: solo mantenimiento afecta TAG/C3; mantenimiento y extraordinarias bloquean reserva; deuda exclusiva de Casa club no bloquea otra solicitud |
| Inicio por rol | Validar con cuentas reales de administrador, Seguridad y Condómino (una y varias viviendas): alcance de listas, ausencia de finanzas en no administradores y ausencia de datos de casas ajenas |
| Adeudo acumulado, anticipos y advertencias TAG | Cotejar contra MySQL una casa al corriente, parcial, morosa y con anticipo 2027; confirmar que Último mes pagado muestra el período real sin sumar deuda futura. Abrir modal en casas con 0/1/varios TAGs y confirmar C3 bajo demanda sin escrituras |
| Safari/iPhone y navegación | Probar lo ya pendiente y además Noticias en 3/2 columnas, ausencia del reverso espejado de Tráfico y última fila completa. Comprobar Rosas 29 sin registrar un pago solo para la prueba |
| Pagos manuales y sincronización C3 | Probar primero con una vivienda controlada; confirmar transacción, rechazo de duplicados, un solo evento durable y estado COMPLETADO con lectura física de todos los TAGs. No usar masivamente antes |
| Monitor automático de adeudos | Mantener apagado hasta respaldo/cotejo, piloto autorizado, padrón exacto, dry-run y lectura física. Probar que solo mantenimiento bloquea TAGs, que extraordinarias/Casa club no escriben C3, reactivación manual y ausencia de desbloqueo automático al saldar |
| Manual integral de aceptación | Ejecutar y registrar los 24 apartados A01–A24, seis FTI y casos Z01–Z18 del manual raíz; el merge documental no los da por superados |
| Noticias y tráfico | Desplegar frontend/backend, comprobar FreeNewsApi desde Hostinger y configurar/validar TomTom o Google sin exponer claves. Revisar búsqueda local, orden por fecha y estados de error con fuente real |
| Cámaras Dahua y pluma | Para video falta gateway RTSP→HLS privado y configuración Hostinger. Para pluma, coordinar prueba física; ORDEN ENVIADA no confirma posición |
| Guadalajara 707 / Valle de México 3614 | Verificar en producción que filtros, paginación, ZKTeco y conmutador oculten solo los domicilios previstos; los registros siguen en MySQL y requieren conciliación separada si contienen relaciones |
| Finanzas históricas y saldo inicial | Confirmar que producción usa el esquema esperado, que existen las tablas/asientos requeridos y cotejar API Inicio/Análisis con MySQL sin doble conteo; las cifras de los PR son valores esperados, no verificación de esta revisión |
| Google Sheets histórico | Ejecutar migración opcional solo al decidir activarlo, configurar credenciales/rangos en backend y validar lectura/staging con una hoja y MySQL de prueba; acordar conciliación antes de afectar contabilidad oficial |
| 27 viviendas del padrón sin TAG | Confirmar entrega/posesión y asociación; nueva consulta/exportación tras ajustes |
| Tres pares con fusión reportada | Confirmar COMMIT y persistencia desde otra conexión; verificar respaldo y modo seguro. No dar por cerrado a partir de la frase del usuario o del resumen de una captura |
| Cinco registros fuera del padrón aún pendientes + vivienda marcada inexistente | Identificar destinos y conservar referencias. La conversación reporta cuotas/historial en tres y un residente/permiso en otro; falta revisar evidencia original antes de actuar |
| Correspondencia descartada en el cotejo posterior | Residentes distintos según la conversación; no trasladar automáticamente al destino inicialmente propuesto |
| Nueve TAGs y discrepancia CSV | Ejecutar la consulta entregada el 19/oct, aportar CSV y confirmar vivienda correcta por TAG; tener `casa_id` no demuestra por sí solo que la asociación sea correcta |
| Asociación previa de 35 TAGs a 20 viviendas | Confirmación del COMMIT no documentada; verificar persistencia con consulta nueva |
| Rosas 33, ID 97 | Leer fecha real del C3 para TAGs 9909769 y 9909783; CSV de asociaciones no incluye fechas |
| Recargos históricos | Identificar cortes ya cubiertos para no cobrarlos nuevamente |
| Correo del banco para conciliación | Obtener muestra y proveedor de buzón; validar datos únicos y autenticidad antes de implementar |
| Migración final de `direccion_id` | Respaldar; ejecutar SQL 01; desplegar todo el backend nuevo y retirar instancias/importadores antiguos; probar; después, sin escrituras, ejecutar SQL 02. DDL no revierte con ROLLBACK y código antiguo no puede volver tras retirar la columna |
| Recibos y exportación de Análisis | Desplegar frontend/backend juntos; validar PDF mensual, meses/folios, abono parcial, logo, teléfono temporal, adjunto manual en WhatsApp y Excel con datos reales. Confirmar iPhone/Android/escritorio sin registrar pagos |
| Fechas DD-MON-YYYY | Revisar visualmente 24 páginas y selectores nativos en Safari iOS/Chrome Android; confirmar que valores ISO, zona México y folios permanecen intactos |
| Prueba integral en producción | Con vivienda/TAG dedicados y referencia nueva: reportar, revisar, leer fecha real posterior, comprobar idempotencia y apertura cuando corresponda |

## Actualización recurrente

Tarea de ChatGPT programada **todos los días a las 23:30, America/Mexico_City**,
para revisar evidencia y publicar un commit normal de este archivo en main.
La primera ejecución está programada para el 10/oct/2026 a las 23:30.
No es un cron de Hostinger ni necesita una computadora de caseta encendida.

- Leer main, AGENTS.md, el índice y este archivo antes de actualizar.
- Revisar commits/PR y evidencia posterior al último punto de revisión. Diferenciar
  propuesto, implementado, revertido, prueba simulada y confirmación física del usuario.
- No inferir novedades de la DB o pruebas físicas desde commits. Si las confirmaciones
  de conversación no son accesibles, mantener su estado anterior y señalar la falta de evidencia.
- Registrar fecha/hora y SHA consultado. Una sola entrada por fecha local, actualizada
  al reintentar; conservar el historial de pruebas y actualizar el resumen actual.
- Si no hay novedades, registrar sin cambios verificables. No anunciar una publicación
  si GitHub la rechazó. Preservar cambios concurrentes; nunca force push de main.
- Esta tarea solo escribe `docs/ESTADO_PROYECTO.md`: no cambia código, DB, TAGs ni
  reglas de negocio. No ejecuta pruebas físicas ni registra pagos. No publica secretos.

## Bitácora

### 2026-10-20

- El usuario confirmó que el scroll móvil volvió a funcionar. Se agrega deslizar hacia abajo para actualizar al estar al inicio de una sección dentro del portal: muestra indicación y recarga únicamente esa sección al soltar tras superar el umbral, conservando la sesión y el menú exterior. No se activa sobre controles, mapas, modales, menú abierto ni contenedores con scroll propio; cancela pellizcos, desplazamiento horizontal, movimientos cortos y gestos interrumpidos.
- Validación local del gesto: 15 pruebas aprobadas de navegación, gestos táctiles simulados y login; sintaxis JS y diff sin errores. Solo frontend, sin SQL. Requiere actualizar GitHub Pages y comprobar el gesto en Safari/iPhone/Android reales; la simulación no acredita esa prueba física.

- Scroll móvil: el bloqueo de fondo del menú lateral también alcanzaba a las páginas embebidas, que tenían la clase de diseño compartido sin estado de menú cerrado. Se excluye `mj-embedded` de esa regla y se marca su menú como cerrado al inicializar y al activar el iframe, incluso con scripts anteriores en caché. El menú exterior conserva el bloqueo de fondo cuando está abierto. Se renuevan versiones de assets en app/Inicio.
- Validación local de scroll: 11 pruebas aprobadas de navegación persistente y login, sintaxis JS y diff sin errores. Se comprueba el estado de cada iframe sin duplicar menú. Sin despliegue ni comprobación física Safari/iPhone/Android; la simulación DOM no acredita por sí sola gestos reales de desplazamiento.

- Por solicitud del usuario, se retira el login progresivo por teléfono: usuario/correo y contraseña están visibles desde el inicio. La API de autenticación ya no busca teléfonos, y se retiran las rutas públicas de consulta/reenvío por número y la entrada de aceptación desde ese flujo. Se conservan las invitaciones SMTP, aceptación por enlace, solicitudes manuales, sesiones recordadas y permisos por rol. No requiere SQL; desplegar frontend y backend juntos.
- Validación local del retiro de teléfono: 76 pruebas aprobadas de login UI/API, sesiones recordadas, permisos, solicitudes y aceptación Auto-users; sintaxis y diff sin errores. DB/SMTP simulados, sin cambios en producción. Los nombres de usuario numéricos existentes siguen funcionando como identificadores exactos.
- El usuario confirmó que funcionó el correo individual de invitación de prueba después del cambio de envío. Es confirmación de esa prueba; no acredita entrega masiva ni aceptación completa de todas las cuentas.

- Auto-users: el botón individual Enviar permite probar SMTP con una cuenta de prueba pendiente y correo propio. Los lotes masivos y el reenvío público por teléfono siguen omitiendo esas cuentas; se conserva su marca y los controles de correo, vivienda de pruebas, reportes y aceptación. Generar enlace sin enviar sigue disponible. Requiere desplegar backend; no requiere SQL ni modifica variables SMTP.
- Validación local del envío individual: 35 pruebas aprobadas en auto-users, rutas, interfaz administrativa de pruebas y correo, con DB/SMTP simulados; comprobaciones de sintaxis y diff sin errores. No se enviaron correos reales ni se verificaron credenciales/entrega de producción.

- Auto-users: Crear cuenta valida formato/disponibilidad de usuario y correo, contraseña y confirmación antes de abrir el segundo panel. Se incorpora POST público `/api/auto-users/invitacion/validar`, protegido por enlace vigente y límite de consultas; no activa cuentas, genera sesiones ni consume el enlace. La aceptación final mantiene las comprobaciones y la confirmación de todas las viviendas.
- El segundo panel muestra «Introduce SOLO tu numero de casa». Se bloquean clics repetidos mientras se valida y se exige otra comprobación si cambian las credenciales. El frontend actualiza la versión del script para renovar caché.
- Validación local: 41 pruebas aprobadas en auto-users, auto-users-ui y auto-users-routes; DB/SMTP simulados. Requiere desplegar frontend y backend juntos; no requiere SQL ni se consultó/modificó producción.

### 2026-10-19

- Revisión de las 23:27: main leído en `9e226f5124688aaeeebe57850723b10fb3e12e40`, 32 commits después de `3fcff016`. Se excluyó `402de9951fa8fdd4f35638c93843f41154840a3f`, dedicado al estado del 18/oct.
- Se fusionaron #208–#219 y no hay PR abiertos. #208 unifica fechas visibles; #209–#214 mejoran historial, importes, estados y la comparación C3/MySQL sin escribir al controlador.
- #210 limita los bloqueos TAG automáticos a mantenimiento y deja Casa club condicionada por mantenimiento/extraordinarias, no por deuda previa exclusiva de club. Seis archivos de prueba pasan con simulaciones; no hubo C3 físico.
- #215–#216 migran el código a relaciones múltiples `condominos_viviendas` y retiran `direccion_id` del modelo. El usuario aportó CSV con 188 relaciones originales/copiadas y cero faltantes. Los SQL 01/02 para retirar la columna física siguen pendientes de ejecución/despliegue verificado.
- La conversación también registra que el usuario confirmó borrar 159 precuentas pendientes. Un intento posterior de `CALL mj_conciliar_padron_20261019()` devolvió error 1644 porque ya existían respaldos o una conciliación de esa ejecución; esto no certifica conteos finales ni COMMIT.
- #217–#219 añaden recibos PDF mensuales de mantenimiento, apertura manual de WhatsApp y exportación Excel. Las pruebas dirigidas pasan; quedan expectativas estructurales obsoletas y validación real en móvil/escritorio.
- GitHub devolvió cero estados y cero workflow runs para los 12 merges. Esta revisión no consultó directamente Hostinger/MySQL ni ejecutó migraciones, pagos, correos reales, operaciones C3 o pruebas físicas; las operaciones confirmadas por el usuario quedan separadas arriba.

### 2026-10-18

- Revisión de las 23:31: main leído en `3fcff016c3fbd000f9bb2c16da4ec86619cf9a12`, 30 commits después de `5aab812`. Se excluyó `cb772b3ec3388525b7a40a50bc2134e7c7f5f56a`, dedicado a esta bitácora.
- Quedaron fusionados #192 y #195–#207; no hay PR abiertos. #192 deja Auto-users por SMTP y login progresivo por teléfono integrado con sesiones/avisos actuales: 112 pruebas locales con DB/SMTP simulados, sin correo real ni despliegue.
- #195–#202 dejan Noticias locales de siete días con FreeNewsApi, búsqueda vial, prioridad local, tráfico TomTom/Google y correcciones móviles/Safari. Los comandos publicados pasan; falta conectividad desde Hostinger, credenciales reales y revisión visual física.
- #203 incorpora las tres vistas de Análisis y Casa club cobrado sin doble conteo; el universo visible de 232 sigue sin conciliar con el requisito de 231. #204 añade monitor automático de adeudos apagado por defecto; #205 restaura operaciones manuales de TAG aun con deuda. No hubo escritura C3 y continúan dos fallos históricos de `editTag`.
- #206 documenta 18 casos ZKTeco y seis hallazgos; #207 publica el manual raíz con 24 secciones y seis flujos. Son guiones/auditorías, no evidencia de despliegue ni E2E físico.
- GitHub devolvió cero estados y cero workflow runs para los 14 merges. No se consultó Hostinger/MySQL, no se ejecutaron migraciones, pagos, correo real, operaciones C3 ni pruebas físicas; se conservan las confirmaciones anteriores sin añadir novedades.

### 2026-10-17

- Revisión de las 23:33: main leído en `5aab812f944628022d5283b92794153ed3f8d593`, cinco commits después del SHA anterior. Se excluyó `a91d632`, que solo actualizó la bitácora del 16/oct.
- #193 quedó fusionado: cobranza separada de mantenimiento, cuota extraordinaria y casa club; pagos manuales por concepto; avisos de adeudo; sesión recordada opcional; autorización y vencimiento de reservas. Su SQL no se ejecutó en producción y el backend/frontend requieren el esquema nuevo.
- La emisión de extraordinarias queda bloqueada hasta conciliar el padrón elegible: la evidencia del PR contrasta 232 viviendas visibles con el requisito de 231. No se documenta ninguna exclusión automática.
- #194 quedó fusionado y mantiene las tres pestañas de Pagos en una sola fila, incluido móvil. Solo cambia CSS; su revisión visual real sigue pendiente.
- #192 continúa abierto, no está en main: propone cambiar Auto-users de WhatsApp a SMTP, login progresivo por teléfono y alertas de solicitudes. Reporta 76 pruebas locales simuladas, sin envío de correo real ni despliegue.
- Checks: GitHub devolvió cero estados y cero workflow runs para #192–#194. No se consultó Hostinger/MySQL ni se ejecutaron migraciones, pagos, correos reales, escrituras C3 o pruebas físicas.

### 2026-10-16

- Revisión de las 23:27: main leído en `b3188c74117e14fd9b36f79edfeac87ceca5981f`.
- Sin cambios verificables de producto desde `fbd6ebb7091fd114f8b4263c561536a7c156e0e4`. El único avance fue `b3188c7`, commit documental de la bitácora del 15/oct, excluido de la lista de trabajo de producto.
- No hay PR abiertos. El commit documental devolvió cero estados y cero workflow runs; no hubo nuevas pruebas automatizadas ni evidencia de despliegue.
- No se consultó Hostinger/MySQL ni se realizaron pagos, escrituras C3 o pruebas físicas. Se conservan sin cambios el resumen operativo, el historial de pruebas y todos los pendientes anteriores.

### 2026-10-15

- Revisión de las 23:28: main leído en `fbd6ebb7091fd114f8b4263c561536a7c156e0e4`, 21 commits después del punto anterior. Se excluyó `82496d8`, que solo actualizó esta bitácora. Los PR #190–#191 están fusionados y no quedaron PR abiertos.
- Pagos en Análisis: #190 coloca «Registrar pago» en una columna propia por vivienda y lo retira del modal TAGs. Reutiliza el flujo existente y no modifica backend, cálculos, DB ni C3. Falta validar visualmente escritorio/iPhone y apertura de la vivienda correcta sin efectuar un cobro.
- Último mes pagado: #191 añade filtro inclusivo Mes/Año y muestra anticipos confirmados de 2027 o posteriores aunque el período financiero consultado sea anterior. El saldo conserva su corte y no proyecta meses futuros; no toma la vigencia TAG como pago. Falta cotejo con MySQL real y navegador/Safari.
- Pruebas declaradas: #190 reporta 18 comprobaciones y #191 reporta 30, sin comandos completos publicados. GitHub devolvió cero estados y cero workflow runs para ambos merges; no se ejecutó una suite nueva sobre main.
- No se consultó Hostinger/MySQL ni se hicieron pagos, escrituras C3 o pruebas físicas. Se conservan los pendientes anteriores y no hay nueva confirmación del usuario sobre DB o hardware.

### 2026-10-14

- Revisión de las 23:32: main leído en `7ab74ebbc08e168f64f3f5f0dfb405ca34b1f0ea`, 98 commits después del punto anterior. Se excluyó `f8dad14`, que solo actualizó esta bitácora. Los PR #180–#189 están fusionados y no quedaron PR abiertos.
- Análisis financiero: #180 calcula adeudo acumulado, recargos y último mes pagado desde septiembre de 2026. #181–#184 añaden resumen/modal TAG, diagnóstico C3 de solo lectura al abrir, advertencias deuda–TAG, filtro Advertencias y ajustes móviles. Presencia en main no prueba cifras MySQL ni estado físico C3.
- Interfaz: #183–#186 alinean fichas y egresos, centran la dona y encapsulan fechas nativas de Safari. #185 documenta emulación Chromium en 320, 375, 390, 430, 440 y 700 px; Safari/iPhone y producción siguen pendientes.
- Navegación: #187 oculta Cuotas del menú y retira la tarjeta de conciliación histórica de Análisis sin borrar página, endpoint, archivo ni datos. #188 oculta las pestañas de Análisis y ordena Comunidad con Pagos primero; falta verificación visual tras despliegue.
- Inicio por rol: #189 mantiene el tablero financiero para administradores, da a Seguridad listas generales de visitas/accesos y limita a Condómino a viviendas vinculadas desde el servidor. No se probó con cuentas ni MySQL de producción; la suite completa está pendiente.
- Checks: los diez merges devolvieron cero estados y cero workflow runs. Las validaciones descritas en los PR son locales/aisladas, sin comandos completos publicados; no se repitieron. No se consultó Hostinger/MySQL ni se hicieron pagos, escrituras C3 o pruebas físicas.

### 2026-10-13

- Revisión de las 23:26: main leído en `13a3a2334053cdde223cea8fd9a6c89f766fe7c1`, 149 commits después del punto anterior. Se excluyó `de57d88`, que solo actualizó la bitácora del 12/oct. Los PR #154–#179 están fusionados y no quedaron PR abiertos.
- Inicio/Análisis: #154–#158 dejan la gráfica móvil a ancho completo con ejes y puntos táctiles no deformados; #179 coloca Consulta de viviendas inmediatamente debajo de las gráficas. Validación visual en navegador/dispositivo sigue pendiente.
- Seguridad/Dahua: #159 conecta los botones al endpoint ZKTeco existente y prepara HLS seguro; #163 añade diagnóstico. #164–#165 retiran el visor de Seguridad y reordenan cuotas/pluma. No se probó la pluma ni el NVR físicamente y el video requiere gateway externo.
- Pagos: #160–#162 publican historial administrativo 11–10 y fechas anteriores guardadas. #171 y #173–#176 incorporan registro manual de meses, conciliación HIST/referencias protegida, una entrega durable C3 por lote y cierre seguro del modal. No se consultó MySQL/C3 real ni se confirmó el caso Lirios 13.
- Auto-users: #166–#170 y #172 quedaron en main con prerregistro, aceptación, pruebas administrativas, diagnóstico de borrado y confirmaciones masivas. Requiere despliegue, migración validada y configuración real de WhatsApp; no se crearon cuentas ni se enviaron mensajes en producción.
- Padrón visible: #177 restringe Guadalajara a 707 y #178 Valle de México a 3614 en listados compartidos. Son filtros de lectura: no borran ni trasladan direcciones, cuotas, pagos o TAGs.
- Checks: los 26 merges #154–#179 devolvieron cero estados y cero workflow runs. Se conservan resultados locales documentados por cada PR, pero no hay CI de main ni pruebas nuevas de Hostinger, MySQL, WhatsApp, Dahua o C3.

- Auto-users integrado en main mediante PR #166: prerregistro por condómino con vínculo único a
  vivienda/usuario, cuenta_aceptada=false y credenciales aleatorias no entregadas.
  Creación por lotes idempotente; datos ambiguos/inactivos requieren revisión.
  Invitaciones únicas, reemplazables, con hash y caducidad; confirmación del número
  de casa, contraseña, activación transaccional y sesión hacia Inicio. Reportes,
  corrección de datos/vivienda y reenvío individual o de pendientes no aceptados.
- Auto-users requiere migración incremental (preserva cuentas existentes aceptadas),
  frontend/backend y configuración de WhatsApp Business con plantilla de 3 parámetros.
  Sin configuración no simula envíos. No se crearon usuarios ni se enviaron mensajes
  reales; MySQL/Hostinger/C3 de producción no consultados. Inicio se habilita para
  Condómino; Seguridad sigue sin Inicio y Auto-users queda exclusivo de administración.
- Validación: 56 pruebas aprobadas de flujo, HTTP local, DOM, login, permisos,
  migración/proveedor simulados y compatibilidad de registro/revocación. Sintaxis y
  diff sin errores. Revisión visual y prueba de migración/WhatsApp reales pendientes.

- Fecha anterior al pago integrada mediante PR #162: se muestran las fechas
  físicas guardadas en fecha_antes por TAG y movimiento de ese comprobante; no se
  sustituye por la vigencia actual. Sin lectura se indica No registrada; abonos sin
  avance/extraordinarios indican No aplica. Lectura tomada antes de escribir C3,
  después de validar financieramente. No se crea una captura retroactiva.
- Validación de fecha anterior: 9 pruebas de historial aprobadas, sintaxis y diff
  sin errores. Suite pagos/C3: 37 aprobadas y los dos fallos anteriores de edición
  manual/asociación. Producción no consultada; requiere frontend y backend.

- Corrección del historial integrada mediante PR #161 después de #160: periodos
  inclusivos 11–10 (fin exclusivo día 11); selector por hora de México. Meses
  aplicados destacados junto al monto, con entregas parciales/pendientes separadas
  y vista móvil sin desplazamiento horizontal. No se altera el corte de cobro
  inclusivo del día 10 ni el cálculo financiero.

- Historial administrativo de pagos integrado mediante PR #160: selector por
  fecha bancaria en periodos 10–9, tabla de todos los estados/abonos, folios,
  fecha de subida existente (`creadoEn`), monto/reportante y diario de meses.
  TAGs muestran todas las fechas registradas y última lectura; no se consulta TCP.
  API paginada, roles SUPER_ADMIN/ADMINISTRADOR en servidor y página; sin migración.
- Validación del historial: 6 pruebas nuevas y 11 de permisos aprobadas. La suite
  requerida de pagos/C3: 37 aprobadas y los dos fallos previos de edición manual.
  Sintaxis/diff sin errores. Validación visual pendiente (Chromium no disponible
  en este entorno); producción/MySQL/C3 no consultados. Requiere ambos despliegues.

- Datos bancarios de condóminos: folio, monto, fecha y hora se muestran de solo
  lectura y se llenan por OCR. Una lectura incompleta no habilita el reporte;
  se pide releer, una imagen clara o ayuda administrativa. Campos de vivienda y
  concepto conservan su condición de solo lectura.
- El servidor exige detectar los cuatro campos para roles no administrativos y
  coteja valores enviados contra su propia lectura (incluidos segundos). Administración
  conserva captura manual si falta un dato, sin contradecir valores detectados.
- Validación de este ajuste: 33 pruebas aprobadas de OCR, interfaz, campos y reportes;
  sintaxis y diff sin errores. La suite requerida de pagos/C3 conserva los dos fallos
  previamente documentados de edición manual/asociación; no se modificó esa lógica.
  No se consultó ni modificó MySQL o C3 reales. Requiere despliegue frontend y backend.

- OCR del navegador: se reprodujo que SINGLE_BLOCK omite el importe grande en un
  comprobante con bloques de tamaños distintos. Se crea el worker explícitamente y
  se configura PSM.AUTO antes de reconocer; se termina también ante un error.
- Prueba local con el comprobante aportado: el flujo runOcr llenó 300.00 y verificó
  destino. La imagen y el texto bancario no se incorporan al repositorio.
- Validación: 15 pruebas aprobadas de parser, interfaz y OCR independiente del servidor;
  sintaxis JavaScript y diff sin errores. La prueba de imagen usó Tesseract.js local;
  no acredita despliegue ni ejecución en el navegador de producción.
- Asset pagos.js versionado para renovar caché. Solo requiere desplegar frontend;
  backend, reglas financieras, MySQL y C3 no se modificaron.

**Auto-users: prueba individual**

- Se añade una cuenta ficticia por clave de prueba, limitada a viviendas identificadas como Prueba/TEST. Creación transaccional e idempotente en la misma pestaña.
- Enlace individual sin WhatsApp, con expiración, rotación y el mismo flujo público de aceptación/reportes. Cuentas de prueba excluidas de envío, incluso después de editar el teléfono.
- Validación local: 39 pruebas de Auto-users, permisos, autenticación y registro aprobadas; incluye creación concurrente, rechazo de viviendas reales, número incorrecto, corrección de reportes, aceptación única y rollback. Sin consultas/escrituras a producción ni mensajes reales. Requiere desplegar frontend y backend para probar manualmente.

**Auto-users: administración de cuentas de prueba**

- Auto-users incorpora tabla paginada de cuentas de prueba pendientes/aceptadas, consulta de datos y fechas, edición de perfil y vivienda de pruebas, y borrado confirmado del conjunto ficticio. Conserva viviendas e historial externo; validación de marca/rol en servidor, transacción y bloqueo por referencias.
- Editar mantiene aceptación/contraseña/rol, actualiza condómino y vínculo, e invalida enlaces y sesiones anteriores. No incluye cuentas manuales sin marca de prueba.
- Validación local: 43 pruebas aprobadas de Auto-users, interfaz administrativa, autenticación, permisos y registro; incluye rechazo de cuentas reales, edición aceptada, cancelación/confirmación de borrado y rollback. Sin cambios de DB de producción ni mensajes reales. Requiere despliegue de frontend/backend.

**Auto-users: borrado sin respuesta visible**

- El usuario reportó que Borrar no eliminaba y no mostraba mensaje. El flujo anterior salía silenciosamente al cancelar/suprimir la confirmación nativa; no se verificó la causa concreta en su navegador/DB.
- Se sustituye confirmación nativa por dialog de la página, con ID, cancelación explícita, estado de solicitud y errores persistentes; límite de espera de 45 segundos sin reintento automático. Se distingue DELETE completado de fallo posterior refrescando la tabla y se corrige el cursor de botones deshabilitados por estado.
- Validación local: 43 pruebas aprobadas; UI prueba cancelación, rechazo 409, respuesta HTML 404, timeout simulado, recuperación de botones y borrado confirmado. Sin cambios en DB de producción ni relajación de validaciones de borrado. Requiere actualizar frontend; el servidor sigue comprobando la marca y referencias de prueba.

**Auto-users: error de servidor al borrar prueba**

- Captura del usuario muestra panel de borrado de cuenta #8 y respuesta genérica de operación fallida. Confirma que el nuevo panel funciona y la petición obtiene un rechazo del backend; no revela la excepción SQL concreta.
- Se corrige consulta de dependencias: antes seleccionaba modelos completos y asumía todas las tablas/columnas. Ahora comprueba esquema físico y proyecta solo referencias disponibles, omite módulos físicamente ausentes y mantiene bloqueo por historial/FK. Errores administrativos muestran tabla/código seguro, sin SQL ni datos privados.
- Validación local: 45 pruebas aprobadas, incluidas tablas opcionales ausentes, campos heredados, consulta mínima, rollback y diagnóstico HTTP sanitizado. Sin acceso a DB de producción; la causa específica allí requiere confirmar tras desplegar backend o revisar el código de error.

**Auto-users: confirmación antes de acciones masivas**

- Crear usuarios y Mandar invitación requieren panel Sí/No antes de empezar el flujo por lotes. No/Escape no ejecuta solicitudes masivas y Sí se consume una vez para evitar repetir por clics sucesivos. No cambia los botones de pruebas ni el envío individual.
- Validación local: 45 pruebas aprobadas; interfaz comprueba ausencia de solicitudes antes de Sí y al cancelar, selección de la operación correcta, confirmación única y creación de prueba sin panel masivo. Sin creación de cuentas ni mensajes reales en producción. Requiere actualizar frontend.

### 2026-10-12

- Main quedó en `3d25888592a4a2996d7fca70edb66a95b6efbf7a`, 45 commits por delante del SHA revisado el día anterior. Se excluyó `05aab7c`, que solo actualizó esta bitácora.
- PR #143–#147 fusionados: conectan cuotas históricas, egresos, ingresos manuales y saldo inicial al dashboard/Análisis, con protección contra doble conteo. Requieren comprobar tablas, asientos, API y cifras en el MySQL realmente usado por producción; el merge no confirma esos datos ni el despliegue.
- PR #148–#149 y #152–#153 fusionados: gradientes, filtros, tooltips, detalle mensual, tarjeta Agenda y rediseño de la gráfica financiera para móvil. La validación visual y la ejecución de las pruebas UI en un checkout completo siguen pendientes.
- PR #151 fusionado: el porcentaje de viviendas pagadas usa el padrón documentado para Atotonilco, Guadalajara y Valle de México, excluye Prueba y deduplica el indicador sin borrar ni trasladar cuotas, pagos o direcciones. Falta cotejo con nombres/números reales de producción.
- PR #142 fue cerrado sin merge. PR #150 permanece abierto; sus seis líneas de ajuste no están en main.
- GitHub no acreditó estados ni workflow runs para #143–#147, #149 y #151–#153. #148 devolvió cero runs y un error transitorio al consultar el estado combinado. No se ejecutaron pruebas nuevas contra Hostinger, MySQL real o C3 en esta revisión.

- OCR del monto: el lector de navegador/servidor solo toma valores monetarios
  asociados a Monto/Importe/Total; no usa terminaciones de cuenta ni atraviesa
  secciones Destino/Origen/Folio/Fecha. Si la lectura es ambigua, deja el importe
  vacío para completarlo. La validación independiente del servidor se conserva.
  Se cambia la versión del asset en pagos.html para actualizar el lector en caché.
  Pruebas: parser en ambos entornos, llenado del formulario y OCR sintético del servidor.
  No se consultaron ni modificaron comprobantes, DB o C3 de producción.

- Pagos: se admiten abonos parciales positivos que cubran recargos pendientes. El caso
  $300 depositados después del corte aplica $50 al recargo y conserva $250 netos;
  tras validar, un complemento de $50 en Mantenimiento completa un mes sin repetir
  el recargo del corte. Se mantiene la revisión administrativa y el bloqueo de otro
  reporte mientras el anterior esté pendiente. Otro corte vencido puede agregar recargo.
- Formulario: acepta el abono, muestra saldo estimado/faltante y explica cómo subir
  el complemento con su propio folio. Sin meses completos no se prepara una escritura
  C3. No requiere cambios de esquema para este flujo. Despliegue y prueba real pendientes.
- Validación local de abonos: 41 pruebas aprobadas en pagos-pruebas, pagos-acceso-c3,
  recargos-mantenimiento y recargos-ui. La suite ampliada conserva los dos fallos ya
  documentados de edición manual/asociación en zkteco-vigencias. SQL/TCP simulados;
  no se consultaron ni modificaron C3, MySQL o Hostinger de producción.

- Navegación del rol SEGURIDAD: únicamente el grupo Seguridad, con Conmutador,
  Seguridad, Visitas, Mapa y Reportes. Mapa y Reportes se trasladan a ese grupo para
  todos los roles. El login de guardia entra directamente en seguridad.html.
- Inicio y Mis viviendas quedan denegados en la política del navegador y en las API
  dashboard/viviendas. Mi cuenta permanece accesible. Se retira el selector de vivienda
  del guardia y se ignora su contexto de vivienda heredado en autenticación.
- Residentes/ZKTeco conservan permisos operativos requeridos por el centro de Seguridad;
  no aparecen en el menú del guardia. Conexión conserva su API interna, sin página pública.
- Validación local: 23 pruebas aprobadas de permisos, autenticación, navegación/login,
  interfaz unificada y rutas de viviendas; git diff --check sin errores. Son simulaciones,
  no pruebas con cuentas reales ni confirmación de despliegue de frontend/backend.


### 2026-10-11

- Main avanzó desde `8ec5019` hasta `ebed7ff`; se fusionaron los PR #133–#141. Se excluyó
  `e987281`, que solo actualizó esta bitácora, de la lista de trabajo de producto.
- #133–#139: nueva agrupación/orden del menú y rediseño responsive compacto; KPIs
  horizontales, Directorio recuperado y página `conexion.html` retirada. El endpoint interno
  de estado usado por Seguridad no fue eliminado. Falta validación visual y de despliegue.
- #140: incorporó consulta autenticada de cuotas por vivienda para Seguridad, mejoras móviles
  y una integración Google Sheets de solo lectura con staging aislado. Sheets queda deshabilitado
  por defecto y la migración es manual; no se confirmó configuración ni ejecución en producción.
- #141: reordenó Seguridad para colocar Cuotas antes de Comunicación directa y alineó fichas
  móviles de Análisis. Solo cambió frontend/pruebas; no acredita operaciones de pagos o C3.
- GitHub no devolvió check-runs ni estados de commit para los heads de #133–#141; cero PR abiertos.
- Ejecución local de seis archivos de pruebas relevantes: 26 aprobadas y 3 fallidas. Los fallos
  corresponden a expectativas de cache busting antiguas que no reconocen las versiones finales
  de assets tras PR posteriores; deben corregirse o explicarse antes de declarar la suite verde.
- No se consultó ni modificó producción, Hostinger, Google Sheets, DB o C3; no se realizaron
  pagos, escrituras de TAG ni pruebas físicas. Se conservan pendientes y confirmaciones anteriores.

### 2026-10-10

- OCR: se conservaron las reglas de revisión independiente y confirmación administrativa.
  La lectura de notificaciones bancarias se discutió como propuesta, sin implementación.
- PR #132 de pruebas automatizadas: creado, fusionado y luego **revertido a solicitud
  del usuario**. Reversión confirmada en main (`5828fca`).
- Cotejo de CSV y padrón oficial: 27 viviendas del padrón sin TAG; 8 registros fuera
  del padrón y Jardines 142 marcada inexistente. Se generaron dos informes PDF;
  el cotejo actualizado sustituye el conteo bruto para clasificar viviendas reales.
- Se registraron las confirmaciones del usuario sobre Lirios/Jardines y la discrepancia
  de los nueve TAGs. No se hicieron correcciones de DB durante el cotejo.
- Se publicaron AGENTS.md e índice en main (`6995b84`), señalando documentación histórica
  incompatible para evitar reinstalar cálculos desde fecha_base o autoaprobar comprobantes.
- Validación local: 35 pruebas aprobadas, 2 fallidas de edición manual; pendientes de diagnóstico.
- Se creó este archivo y se programó su revisión/publicación a las 23:30.
  La creación de la tarea no prueba que su primera ejecución haya ocurrido.
- Revisión de las 23:27, America/Mexico_City: main leído `8ec5019f24aea496ca8d829f96678d64e4021b7a`.
  Desde `6995b84`, solo hay el commit documental de creación del estado; sin cambios
  nuevos verificables de producto. Cero PR abiertos; historial de #132 revertido conservado.
- Checks: main sin estados ni runs PR devueltos. Se recuperaron logs históricos de Actions
  del PR #132: `DB_PORT=3306 npm run test:flujos`, 80 aprobadas y cero fallidas;
  `cuentas-servidor` omitido. No sustituyen los 35 éxitos y dos fallos conocidos de main.
- Evidencia de conversación: el usuario reportó completada una fusión de tres pares.
  Se mantiene pendiente el COMMIT explícito y la verificación de persistencia; las imágenes
  no fueron inspeccionadas en esta revisión. Cinco registros externos aún pendientes según
  el intercambio; se retiró una correspondencia de residente previamente afirmada.
- No se consultó ni modificó producción, ni se ejecutaron pagos, escrituras de TAG o
  pruebas físicas. Se conserva el historial y una sola entrada para esta fecha.
