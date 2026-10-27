# Estado actualizado de Misión Jardines

**Última revisión:** 25/oct/2026, 23:30, America/Mexico_City.
**SHA de main consultado:** `853200d7460d5d8141ef7b8e09b034ca1b6cf864`.
**Fuentes de esta revisión:** comparación de main desde `bd983ec8705b9b9020d59845ba0e521dad651b09`,
metadatos y descripción del PR #294, commits, estado y workflow run de GitHub,
AGENTS.md, índice y estado vigentes. Se excluyó del trabajo de producto el commit
documental `dc3721d37f33fbdb43c20aa225c223a29d3cdf9e`.
No hubo confirmaciones nuevas del usuario accesibles sobre despliegue, MySQL o pruebas
físicas. No se consultaron Hostinger, C3, MySQL ni contenido del buzón, y no se publican
credenciales, comprobantes ni datos personales.

Leer junto con [AGENTS.md](../AGENTS.md),
[índice de documentos](INDICE_DOCUMENTOS.md) y
[reglas de pagos/C3](PAGOS_ACCESO_C3.md). Este archivo conserva estado y evidencia;
no redefine las reglas de negocio ni sustituye las fuentes originales.

## Preparado el 26/oct/2026: OCR con formatos flexibles

Parser compartido navegador/servidor ampliado para expresiones de envío, símbolo
monetario sin etiqueta y fechas con los doce meses, diagonales o guiones. Excluye
comisión, retención, saldo/cuentas y candidatos ambiguos. Se conserva destino,
OCR del servidor y conciliación bancaria. Probado localmente con el comprobante
privado aportado: monto, fecha, hora, folio, referencia y destino reconocidos;
no se incorpora imagen ni datos personales al repositorio. No acredita despliegue
ni recepción del depósito. Ver [OCR del destinatario](../backend/docs/PAGOS_OCR_DESTINO.md).

## Preparado el 26/oct/2026: alta individual en Auto-users

Se incorpora una sección administrativa para crear un residente individual con
nombre, correo y vivienda existentes en el catálogo (teléfono opcional). Reutiliza
el prerregistro pendiente, rol CONDOMINO, invitación SMTP individual y aceptación
vigentes. La creación es transaccional, evita correos duplicados y admite reintentos
idempotentes. Conserva las cuentas y relaciones anteriores; la baja del inquilino
saliente se gestiona por separado, como advierte el formulario. No modifica pagos,
TAGs ni el esquema. Requiere desplegar backend/frontend.
Validación local: 76/76 casos de Auto-users, invitaciones y permisos, con base/SMTP
simulados y pruebas HTTP locales. Se actualizó el mock de DOM de aceptación para
soportar setAttribute del botón de contraseñas de #296. Sin envíos ni consultas de
producción. Preparado sobre `6b821f3`; ver [Auto-users](AUTO_USERS.md).

## Implementado en main: Pagos, cuotas, Seguridad y C3

Los PR #288 y #289 ya están fusionados. Pagos y Análisis comparten la fuente contable
por vivienda; pagar no exige TAG, la acreditación financiera se confirma en una
transacción y C3 recibe después un objetivo absoluto cuando corresponde. El cálculo
de #289 parte del último corte cubierto, aplica mensualidades consecutivas y separa
la fecha bancaria del periodo pagado, sin reconstruir huecos históricos. La migración
aditiva de #288 sigue pendiente de ejecución y verificación en el MySQL de producción;
el merge no acredita despliegue, conciliación bancaria real ni escritura física.

El PR #290 también está en main y añadió saldo a favor, exenciones de recargo,
cotización compartida y cobertura desde enero de 2026 para viviendas sin pagos. Esto
entra en conflicto documental con AGENTS.md, que conserva septiembre de 2026 como base
cuando no hay cobertura registrada. La discrepancia enero/septiembre debe resolverse
antes de usar el cálculo en producción; no se infiere cuál dato corresponde a cada
vivienda. Los PR #291–#293 ajustan únicamente formato y controles de interfaz.

El PR #294 ya está fusionado: Seguridad reutiliza el mismo cálculo y clasificador de
estado que Pagos/Análisis, incluida tarifa individual, exenciones, anticipos y abonos
parciales. La regresión de Atotonilco 752 se cubrió con datos simulados para evitar que
una cuota pendiente antigua marque «Deudor» cuando un pago confirmado posterior cubre
el corte. El cambio es de lectura y no modifica cuotas, pagos ni ZKTeco. No acredita
que el caso real ya esté desplegado o corregido en la base de producción.

## Resumen operativo

| Área | Estado | Evidencia y límites |
| --- | --- | --- |
| Pagos de mantenimiento | Unificación implementada en main; despliegue y regla base pendientes | #288–#289 hacen de `cuotas`/casa la fuente compartida, admiten viviendas sin TAG, aplican pagos consecutivos desde el último corte y sincronizan C3 después del commit. #290 añade saldo a favor y exención de recargos, pero usa enero de 2026 para casas sin pagos mientras AGENTS.md conserva septiembre: reconciliar antes de producción |
| Confirmación de comprobantes | Conciliación por correo en main; política degradada por instrucción explícita | #275–#281 amplían identificadores, trazabilidad y diagnóstico. #284 sustituye funcionalmente al PR #283 abierto: autoriza solo por remitente exacto configurado y asunto, sin DKIM/DMARC/authserv-id; AGENTS.md reconoce que el origen puede falsificarse. Siguen siendo obligatorios monto, identificador del mismo tipo, fecha, cuenta, vivienda, unicidad y no reutilización. Un merge no acredita que Titan/Hostinger esté desplegado ni que el dinero haya llegado |
| Pagos y recibos del condómino | Mejoras amplias en main; navegador/producción pendientes | #267–#269 ajustan adeudos y controles; #271–#274 corrigen iPhone, fechas bancarias y restauran selector nativo; #276 agrega línea de tiempo bancaria/Fallido verificable; #282 restaura la cuenta oficial cuando faltaba un elemento DOM. #268 conserva refresco. La UI no valida por sí misma depósitos |
| OCR | Clave, referencia y folio separados en main | #275 compara identificadores por tipo y normaliza solo ceros iniciales de referencias; #277 amplía lectura MIME; #278 persiste identificadores verificados por OCR del servidor. #279–#281 separan diagnóstico de cuenta, importe, fecha, vivienda e identificador. No aprobar por coincidencia numérica aislada |
| Escritura C3 por pago | Flujo general implementado en main; hardware no verificado | #288 entrega un objetivo absoluto SQL posterior al commit, conserva idempotencia y permite acreditar sin TAG; fallos C3 no revierten el abono. No se ejecutó la migración ni se comprobó Hostinger, MySQL o controlador físico |
| Edición manual de TAGs | Implementada en main; validación pendiente | PR #205 permite de nuevo habilitar, crear, reasignar o agregar TAGs aun con adeudo y restaura la edición de vigencia en el espejo SQL. `bloqueado=false` no prueba `userauthorize` en el C3; dos expectativas históricas de `editTag` siguen fallando en simulación |
| Inventario C3 | Lectura periódica y manual | Reflejo SQL; no volver a usar fechas heredadas para sobreescribir el controlador |
| Cuentas y viviendas | Relación múltiple implementada en main; migración final pendiente | PR #215 usa `condominos_viviendas` para padrón, búsqueda, cuotas, tablero y prerregistro de todos los domicilios; #216 retira `condominos.direccion_id` del modelo/código. El usuario aportó CSV con 188 relaciones originales, 188 copiadas y cero faltantes. Faltan despliegue ordenado y ejecutar/verificar los SQL 01/02 antes de retirar la columna física |
| Conmutador | Integración futura | No se confirmó funcionamiento con hardware en esta revisión; consultar configuración antes de habilitar telefonía |
| Automatización de pruebas PR #132 | Revertida | Reversión en main: `5828fca4d7e68e4a5d72141b9678aabba9482b36`; no usar sus comandos/workflow como si siguieran disponibles |
| Seguridad HTTP | Corrección DoS en main; despliegue pendiente | #270 actualiza body-parser a 2.4.0, fija override mínimo y rechaza cuerpos JSON/form comprimidos antes de descomprimir. La prueba HTTP real reporta 7/7; `npm audit --omit=dev` conserva cinco dependencias ajenas a esa alerta |
| Depuración de viviendas | Fusión de tres pares reportada por el usuario | Falta confirmación explícita de COMMIT y lectura posterior desde otra conexión; cinco registros externos siguen pendientes según la conversación. No hay verificación nueva de producción |
| Interfaz, navegación y fechas | Implementado en main; aceptación parcial | #208 conserva DD-MON-YYYY; #223–#230 implementan portal persistente y corrigen estilos/scroll. El usuario confirmó el scroll. #231 añadió el primer gesto de refresco, que el usuario reportó sin efecto; #239 amplía la instalación a páginas directas, paneles y cabecera, pero aún no tiene confirmación física. #232–#237 corrigen cabeceras/modales y unifican la X; falta validación visual |
| Historial administrativo de pagos | Implementado en main; producción no verificada | PR #160–#162 conservan historial 11–10. PR #209 añade historial por vivienda/concepto, total del último movimiento y separación explícita entre vigencia C3 verificada y MySQL; #214 oculta solo el aviso naranja, no la diferencia. No corrige fechas automáticamente |
| Pagos manuales desde Análisis | Implementado en main; migración/uso real pendientes | PR #171 y #173–#176 implementan pagos manuales de mantenimiento; #190 separa el botón por vivienda. PR #193 amplía el registro manual por concepto y mantiene extraordinarias/casa club separadas de la vigencia física de mantenimiento. No se ejecutó la migración ni se probó con MySQL/C3 reales |
| Auto-users | Invitaciones SMTP operativas en prueba individual; login por teléfono retirado | #221 valida credenciales antes de confirmar viviendas; #224 permite correo individual a cuentas de prueba. El usuario confirmó variables SMTP configuradas y recepción de una invitación individual. PR #229 deja login solo por usuario o correo y contraseña; conserva aceptación por enlace y sesiones recordadas. Dirección pública definitiva y flujo completo siguen pendientes |
| Seguridad, pluma y cámaras | Parcialmente implementado; hardware no verificado | PR #159 reutiliza el endpoint de pluma y prepara proxy HLS; #163 añade diagnóstico; #164 retira el visor Dahua de Seguridad, conservando backend/documentación. PR #189 habilita Inicio operativo a Seguridad con visitas de hoy y accesos sin salida, sin finanzas. Falta gateway RTSP→HLS, despliegue y pruebas con cuentas/hardware reales |
| Visibilidad del padrón | Filtro de lectura en main | PR #177–#178 muestran solo Guadalajara 707 y Valle de México 3614 en listados compartidos. No borran ni fusionan direcciones, pagos o TAGs; falta verificar consultas reales de producción |
| Finanzas históricas y dashboard | Implementado en main; producción no verificada | PR #143–#151 conectan cuotas, egresos, ingresos y saldo inicial; #180 acumula adeudo; #189 separa vistas por rol; #191 muestra anticipos sin proyectar deuda. PR #193 incorpora adeudos desglosados e indicadores por concepto. Requiere migración, padrón conciliado, cotejo MySQL y despliegue reales |
| Cuotas para Seguridad | Cálculo compartido implementado en main; producción no verificada | #140 creó la vista sin PII. #294 sustituye su criterio independiente por el mismo cálculo/clasificador de Pagos y Análisis, considerando tarifa, exenciones, anticipos y abonos parciales. La regresión Atotonilco 752 está cubierta con fixtures; no se consultó la DB real ni se confirmó despliegue |
| Históricos Google Sheets | Backend/staging opcional conservado; controles retirados de Análisis | PR #140 añadió lectura OAuth y preparación idempotente, deshabilitadas por defecto. PR #187 retiró solo la tarjeta y el script de esa vista; no borró archivo, endpoint, tabla ni datos. Requiere decisión explícita, migración y validación antes de activar |
| Análisis, historial y recibos | Fuente compartida implementada; producción no verificada | #288–#290 comparten cálculo con Pagos, último corte, saldo a favor, recargos y exenciones. #291 quita decimales solo en tarjetas/historial; #292–#293 verifican visualmente el estado guardado de tarifa/exención. TEST-001 permanece como apoyo sintético y puede alterar totales mientras siga visible |
| Navegación de Administración/Comunidad | Implementada en main; validación visual pendiente | PR #187 oculta Cuotas del menú y retira la tarjeta de conciliación; #188 oculta las pestañas de Análisis, conserva sus elementos/rutas y ordena Comunidad con Pagos primero. Son cambios de interfaz, no borrado de datos ni cambio de permisos |
| Inicio por rol | Implementado en main; producción no verificada | PR #223 restaura Inicio dentro del portal persistente: administración ve finanzas, Seguridad visitas/accesos sin cobros y Condómino solo viviendas autorizadas por `usuarios_casas`. Fallos parciales muestran «No disponible» sin inventar ceros. Faltan cuentas reales y revisión de logs/despliegue |
| Cobranza extraordinaria y casa club | Implementada en main; bloqueada hasta preparar producción | #193 añade cargos/reservas. PR #210 fija que Casa club se bloquea por mantenimiento y/o extraordinarias exigibles, no por una deuda previa exclusiva de Casa club; devuelve desglose 409 y valida pertenencia. Requiere migración, padrón exacto de 231 y prueba real |
| Noticias y tráfico | Implementado en main; despliegue/visual pendientes | #220/#225/#228/#238 conservan fotos, fallbacks e ilustración etiquetada. #263 corrige TomTom a `language=es-ES` y solicita los campos que consume la UI; faltan despliegue y prueba contra la API real con la llave configurada |
| Monitor automático de adeudos C3 | Implementado en main; apagado por defecto | #204–#205 conservan piloto/dry-run y operaciones manuales. PR #210 limita el monitor exclusivamente a deuda de mantenimiento: extraordinarias y Casa club no bloquean TAGs ni cambian vigencias. No auto-reactiva al saldar. Sin prueba física ni escritura de producción |
| Continuidad documental | Disponible en main, con una discrepancia nueva | AGENTS.md e índice ya referencian `PAGOS_CUOTAS_UNIFICADOS.md` y la política bancaria vigente. Debe conciliarse AGENTS.md (septiembre sin cobertura) con #290/código (enero de 2026 sin pagos). El manual integral sigue siendo un guion de aceptación, no evidencia E2E |

Un merge no acredita despliegue en Hostinger ni prueba física de una pluma.
No se verificaron los valores efectivos de variables de producción ni la versión de PHP
en Hostinger; el backend documentado continúa siendo Node.js y no hay evidencia nueva
para afirmar que el runtime PHP haya sido actualizado.
Desde el SHA consultado en la revisión anterior, main avanzó nueve commits. Se fusionó
el PR #294; el commit `dc3721d37f33fbdb43c20aa225c223a29d3cdf9e`, dedicado al
estado del 24/oct, se excluye del trabajo de producto. No hay PR abiertos. El merge
acredita código en main, no despliegue, corrección de Atotonilco 752 en el MySQL real
ni funcionamiento físico de C3. El PR #132 continúa revertido.

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
| Invitación SMTP individual | El usuario confirmó «listo funcionó» tras habilitar el envío individual y recibió el correo de invitación | Confirma una entrega controlada con la configuración actual; no acredita lotes masivos, dirección pública definitiva, aceptación completa ni todos los proveedores/buzones |
| Scroll y refresco del portal en móvil | El usuario confirmó que el desplazamiento funciona después de #230; después reportó que el primer gesto de refresco de #231 no cambió nada | #239 contiene una corrección posterior para páginas directas, paneles y cabecera, pero no existe confirmación accesible de que ya esté desplegada o funcione en un teléfono |
| Excel del padrón en Microsoft Excel | La evidencia del PR #252 registra que la versión #250 abrió con cinco gráficas y que #251 volvió a provocar reparación | Confirma la regresión concreta reportada, no que #252/#253 actuales ya abran correctamente; falta nueva descarga y apertura en la misma versión de Excel |
| Diagnóstico del buzón IMAP | La documentación incorporada por #265 registra conexión/lectura real de 41 mensajes con el diagnóstico anterior | En ese momento hubo cero avisos autenticados y cero cuentas de cuatro dígitos reconocidas; no acredita conciliación, depósito, aprobación, MySQL ni TAGs. El contenido privado no fue consultado en esta revisión |
| Prueba bancaria controlada y saldo de Análisis | Los PR #280–#285 conservan evidencia de un reporte controlado que llegó a VALIDADO mientras la cuota aún mostraba saldo | Confirma la discrepancia concreta documentada y motivó #285; no prueba que el flujo general ya actualice `cuotas` ni que C3 haya cambiado. Esta revisión no consultó MySQL ni el buzón |
| Requisito de fuente única | El usuario pidió que Pagos deje de calcular desde ZKTeco y use la misma fuente contable que Análisis, actualizando después Análisis y sincronizando C3 cuando exista TAG | Es una decisión/solicitud accesible, no una prueba física ni una implementación. #285–#287 cubren solo TEST-001 |

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
| 20/oct/2026 | PR #220, pruebas añadidas para `cd backend && node --test test/noticias-locales.test.js test/noticias-locales-ruta.test.js test/noticias-ui.test.js`; análisis estático | **No se ejecutó Node ni prueba visual** en esa entrega; sintaxis/reglas revisadas | Presencia en main sin resultado automatizado ejecutado |
| 20/oct/2026 | PR #221, desde backend `DB_PORT=3306 node --test test/auto-users.test.js test/auto-users-ui.test.js test/auto-users-routes.test.js`; sintaxis/diff | **41 aprobadas** | DB/SMTP simulados; sin producción |
| 20/oct/2026 | PR #222, pruebas nuevas de cuota/editor/noticias y validaciones locales; comando/total exactos no publicados | Casos de tarifa y sintaxis reportados correctos | Migración no ejecutada; AGENTS.md aún fija $300 |
| 20/oct/2026 | PR #223, `auth-permissions`, `dashboard-operativo-roles`, `security-navigation` y `app-shell-navigation`; sintaxis/diff | **7 + 9 + 3 + 3 = 22 aprobadas** | Sin MySQL real ni navegador físico |
| 20/oct/2026 | PR #224, desde backend `DB_PORT=3306 node --test test/auto-users.test.js test/auto-users-routes.test.js test/auto-users-admin-trials.test.js test/auto-users-email.test.js`; sintaxis/diff | **35 aprobadas** | DB/SMTP simulados; la recepción real confirmada por el usuario es evidencia separada |
| 20/oct/2026 | PR #225, `DB_PORT=3306 node --test backend/test/noticias-imagenes-zmg.test.js backend/test/noticias-locales-ruta.test.js backend/test/noticias-ui.test.js backend/test/noticias-locales.test.js`; `node --check` | **4 archivos aprobados**; nota real devolvió imagen 300×169, HTTP 200 | Proveedor público probado; Hostinger/CSP/CDN pendientes |
| 20/oct/2026 | PR #226–#227, suites `app-shell-navigation`, `ui-kpi-compact`, `ui-inicio-kpis-reportes`; sintaxis/diff | #226: **4/4 + 4/4 + 3/3**; #227: **5/5 + 3/3 + 4/4** | #226 conserva un fallo heredado en `ui-responsive` por etiqueta antigua |
| 20/oct/2026 | PR #228, `DB_PORT=3306 node --test backend/test/noticias-ui.test.js backend/test/noticias-locales.test.js backend/test/noticias-locales-ruta.test.js`; sintaxis/diff | **3/3 archivos correctos** | Falta visual/despliegue real |
| 20/oct/2026 | PR #229, `DB_PORT=3306 node --test backend/test/login-telefono-ui.test.js backend/test/auto-users-login.test.js backend/test/recordar-sesion.test.js backend/test/auto-users-routes.test.js backend/test/auto-users-ui.test.js backend/test/auto-users.test.js backend/test/auth-permissions.test.js backend/test/cuentas-verificacion.test.js`; sintaxis/diff | **76 aprobadas** | DB/SMTP simulados; sin producción |
| 20/oct/2026 | PR #230, `node --test tests/app-shell-navigation.test.cjs backend/test/login-telefono-ui.test.js`; sintaxis/diff | **11 aprobadas** | Simulación DOM; usuario confirmó scroll real por separado |
| 21/oct/2026 | PR #231 ya fusionado, `node --test tests/app-shell-navigation.test.cjs backend/test/login-telefono-ui.test.js`; sintaxis/diff | **17 aprobadas** según la versión final del PR | DOM/gestos simulados; el usuario reportó después que el gesto seguía sin funcionar físicamente |
| 21/oct/2026 | PR #232–#237, comprobaciones estáticas/sintaxis y DOM según cada PR | #235: **11/11**; #236: **11/11**; #237: **12/12**; #234 sintético; #232–#233 sin total publicado | Cambios visuales de modales/cabecera; falta navegador real |
| 21/oct/2026 | PR #238, `node --test backend/test/noticias-imagenes-medios.test.js backend/test/noticias-ui.test.js backend/test/noticias-locales-ruta.test.js` | Pruebas añadidas, **no ejecutadas** en esa entrega; sintaxis/estructura revisadas | Requiere backend/frontend desplegados y validación de medios reales |
| 21/oct/2026 | PR #239, `node --test tests/app-shell-navigation.test.cjs`; `node --check`; `git diff --check` | **20/20 aprobadas**; sintaxis/diff sin errores | Simulación; sin teléfono físico |
| 21/oct/2026 | PR #240, `DB_PORT=3306 node --test backend/test/analisis-pagos-fechas.test.js backend/test/historial-pagos-vivienda.test.js backend/test/analisis-tres-conceptos.test.js` | **26 aprobadas** | Código luego sustituido por #241; DB simulada |
| 21/oct/2026 | PR #241, `DB_PORT=3306 node --test backend/test/analisis-ultimo-registro-orden.test.js backend/test/analisis-tres-conceptos.test.js backend/test/historial-pagos-vivienda.test.js` | **25 aprobadas** | DB/DOM simulados; #244 oculta después la columna, conserva el orden |
| 21/oct/2026 | PR #242–#244, pruebas dirigidas y verificaciones estáticas descritas en cada PR | #242 añadió casos de horas/orden y TAGs, pero dejó suite completa pendiente; #243 simuló tarifa especial sin MySQL; #244: **9 verificaciones** | Sin CI, producción, C3 ni prueba visual |
| 21/oct/2026 | PR #245–#246, simulaciones de servicios/worker y regresiones añadidas | Casos anuales/historial y cinco escenarios C3 reportados correctos; **no se ejecutó suite Node completa** | Sin MySQL/C3 reales; #246 puede reducir fechas físicas y requiere conciliación de regla y prueba controlada |
| 22/oct/2026 | PR #247–#253, generador Excel/ChartML y `backend/test/analisis-excel-dashboard.test.js` | Sintaxis y simulaciones en memoria reportadas correctas; #250/#252: **6 hojas y 5 gráficas** sin etiquetas problemáticas; suite Node completa no acreditada | #249/#251 causaron reparación en Excel según evidencia del PR; #252 es la corrección vigente, pendiente de prueba final de escritorio |
| 22/oct/2026 | PR #254–#256, tests de descarga y recibos por movimiento | #254/#255: comprobaciones de patrones, ejecución Node pendiente; #256: casos lógicos aislados correctos, tests agregados pero no ejecutados como suite | Sin navegador, MySQL ni producción |
| 22/oct/2026 | PR #257–#259, conciliación Outlook→Gmail→IMAP genérico | #257: **5** verificaciones aisladas; #258: **6**; #259: **7** | #257/#258 quedaron sustituidos por #259; mensajes sintéticos, sin buzón ni DB/C3 reales |
| 22/oct/2026 | PR #260–#262, refresco/UI y validación exclusivamente bancaria | #260: **3** pruebas aisladas; #261: **10** comprobaciones estáticas + **2** regresiones; #262: **4/4** | Sin navegador real; #261 cambia el flujo operativo y requiere backend/IMAP funcional |
| 22/oct/2026 | PR #263, pruebas de TomTom y diagnóstico seguro | **3/3 aprobadas** | Aisladas; API TomTom y variables Hostinger no verificadas |
| 22/oct/2026 | PR #264, `PAGOS_IMAP_AUTH_SERVER=mx.hostinger.com node --test backend/test/diagnostico-buzon-pagos.test.js backend/test/validacion-pagos-correo.test.js`; sintaxis/diff | **11 aprobadas** | El servidor de autenticación es fixture; sin buzón, DB ni C3 reales |
| 22/oct/2026 | PR #265, `PAGOS_IMAP_AUTH_SERVER=mx.hostinger.com node --test backend/test/validacion-pagos-reenvio-admin.test.js backend/test/diagnostico-buzon-pagos.test.js backend/test/validacion-pagos-correo.test.js`; sintaxis/diff | **21 aprobadas** | Reenvío/worker simulados; no confirma despliegue ni aprobación real |
| 22/oct/2026 | PR #266, mismo grupo más `banco-correo-monto-tablas.test.js` | **28 aprobadas**; cuatro regresiones fallaban en main anterior | Ya está en main, pero usa datos sintéticos y no prueba buzón/MySQL/C3 reales |
| 23/oct/2026 | PR #267–#269, validaciones estáticas de modal/controles y caso sintético | Selectores, listeners y aislamiento de TEST-001 reportados correctos; sin suite integrada publicada | UI/SQL de prueba; sin navegador ni DB/C3 reales |
| 23/oct/2026 | PR #270, desde backend `node --test test/http-body-parser.test.js`; instalación limpia y `npm ls` | **7/7 aprobadas**; body-parser 2.4.0; cuerpos comprimidos rechazados y proceso sano | Backend local con rutas/DB sustituidas; falta redeploy |
| 23/oct/2026 | PR #271–#274, regresiones iOS/fecha SPEI/selector | Sintaxis y funciones aisladas reportadas correctas; tests Node agregados pero ejecución completa no acreditada | #271 fue corregido por #274; falta Safari/Hostinger |
| 23/oct/2026 | PR #275–#282, identificadores, trazabilidad y diagnóstico Titan | #276: **9 escenarios** funcionales; #279: **7 simulados**; #281: **6 simulados**; demás parsers/DOM reportados correctos sin suite completa | Evidencia sintética y diagnóstica; no acredita buzón, MySQL ni recepción del dinero |
| 23/oct/2026 | PR #283 abierto, pruebas dirigidas de autenticación/fecha | **26/26 dirigidas**; tres suites históricas mantienen **7 fallos** (19/26) tanto en base como en la rama | No está en main y su política fue sustituida por #284 |
| 23/oct/2026 | PR #284, pruebas de remitente exacto sin DKIM/DMARC | **8/8 aprobadas**; sintaxis/diff correctos | Política deliberadamente falsificable; sin buzón/MySQL/C3 reales |
| 23/oct/2026 | PR #285–#287, funciones y tests de TEST-001 | Deuda/acreditación/incremento simulados correctos; tests Node agregados, ejecución con dependencias/DB/IMAP/C3 pendiente | Excepción sintética, no solución general; #287 cambia temporalmente totales de Análisis |
| 24/oct/2026 | PR #288; pruebas dirigidas de cálculo/reporte/confirmación y selección ampliada | **20/20 nuevas**; selección **112/119**, con los mismos siete fallos heredados que la base (**92/99**) | SQL/TCP simulados; sin MySQL, IMAP o C3 reales |
| 24/oct/2026 | PR #289; pruebas dirigidas de corte consecutivo y selección ampliada | **45/45 dirigidas**; selección **123/130**, con siete fallos heredados igual que la base (**112/119**) | Persistencia/TCP simulados; no acredita suite global, despliegue ni hardware |
| 24/oct/2026 | PR #290, workflow `Verificar finanzas`; `node --test backend/tests/adeudos-enero-saldo-favor-exencion.test.js ...` y sintaxis JS; [Actions 40109657022](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/40109657022) | Job y pasos obligatorios **success**; PR declara **30/30** obligatorias. Suite ampliada **77/84**, con siete fallos bancarios heredados; comparación de base **66/74**, con esos siete y una expectativa HTML obsoleta | CI sintético con credenciales falsas y diagnóstico heredado no bloqueante; sin DB/buzón/C3 reales |
| 24/oct/2026 | PR #291–#293, mismo workflow financiero/sintaxis; [runs 40110902436](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/40110902436), [40111488434](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/40111488434) y [40112484067](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/40112484067) | Los tres jobs concluyeron **success**. Además, #291 verificó cinco formatos, #292 cinco escenarios UI y #293 once comprobaciones de código | #291–#293 son presentación/estado visual; no prueban navegador físico, API desplegada ni persistencia real |
| 25/oct/2026 | PR #294; `node --test backend/test/seguridad-cuotas-consistencia.test.js` y filtro `cuotas de seguridad|rutas de seguridad` sobre `seguridad-sheets-mobile.test.js`; workflow [40168871351](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/40168871351) | Job `Verificar finanzas` y ambas regresiones obligatorias **success**; también pasaron sintaxis y la batería financiera obligatoria. La UI heredada y suite bancaria continúan como diagnósticos con `continue-on-error` | Fixtures/simulaciones: cubre Atotonilco 752, tarifas, exenciones, anticipos, parcialidad y ausencia de PII; no prueba MySQL, despliegue ni C3 reales |

Los dos fallos están en `backend/test/zkteco-vigencias.test.js`:

- `manual date edit persists without queueing the old maintenance cutoff`.
- `editing a house association never queues an old SQL cutoff`.

En ambos casos el C3 simulado conservó EndTime `20260910`, cuando se esperaba
`20261110`. Falta investigar código y preparación de la prueba; no se corrigió
al añadir documentación. Conservar estos resultados hasta una ejecución nueva
que explique y confirme su resolución.

GitHub sigue sin acreditar estados ni workflow runs para los merges anteriores
#267–#282 y #284–#289. Los heads de #290–#294 tienen cinco ejecuciones exitosas de
`Verificar finanzas`; los commits de merge no tienen runs propios. En #294, las
regresiones Seguridad/Análisis son obligatorias, pero la UI heredada, la suite bancaria
y su comparación con main siguen como pasos diagnósticos con `continue-on-error`.
Por ello, un job verde no convierte fallos históricos en aprobados. Se conservan los
dos fallos de `zkteco-vigencias` y las regresiones obsoletas hasta una ejecución que
las explique. No se ejecutaron pruebas contra MySQL, C3, buzón, Hostinger o Dahua reales.

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
| CI y regresiones históricas | #290–#294 tienen workflows exitosos en sus heads; #294 añade regresiones obligatorias de paridad Seguridad/Análisis. Las suites bancaria/UI heredadas siguen como diagnóstico no bloqueante y permanecen fallos históricos de ZKTeco. Ejecutar suite reproducible sobre main actual y registrar cualquier diferencia |
| Auto-users por SMTP | La prueba individual ya recibió correo. Falta definir dirección pública, probar el enlace en incógnito hasta aceptación completa, lotes controlados, rebotes/spam y confirmar que frontend/backend desplegados usan login solo por usuario/correo y contraseña |
| Migración de cobranza por concepto | Respaldar DB, revisar y ejecutar manualmente `backend/sql/2026-10-18-cuotas-extraordinarias-casa-club.sql` primero en prueba; después correr consultas diagnósticas. No desplegar backend/frontend nuevo antes del esquema |
| Padrón y relaciones condómino-vivienda | El CSV reporta 188 pares copiados sin faltantes, pero el intento posterior de `mj_conciliar_padron_20261019()` devolvió error 1644 por ejecución/respaldo existente. Revisar respaldos/bitácora y conteos posteriores desde otra conexión; no afirmar todavía 231/232 ni COMMIT final |
| Casa club y tres conceptos | Probar roles, autorización, adeudos, fechas límite, comprobantes y expiración. Confirmar la nueva política: solo mantenimiento afecta TAG/C3; mantenimiento y extraordinarias bloquean reserva; deuda exclusiva de Casa club no bloquea otra solicitud |
| Inicio por rol | Validar con cuentas reales de administrador, Seguridad y Condómino (una y varias viviendas): alcance de listas, ausencia de finanzas en no administradores y ausencia de datos de casas ajenas |
| Adeudo acumulado, anticipos y advertencias TAG | Cotejar contra MySQL una casa al corriente, parcial, morosa y con anticipo 2027; confirmar que Último mes pagado muestra el período real sin sumar deuda futura. Abrir modal en casas con 0/1/varios TAGs y confirmar C3 bajo demanda sin escrituras |
| Paridad Seguridad–Análisis | Desplegar #294 y cotejar en MySQL controlado Atotonilco 752 y otras viviendas con tarifa especial, exención, anticipo, abono parcial y pendientes antiguos. Confirmar mismo estado/adeudo en ambas vistas y ausencia de PII; no cambiar registros para forzar el resultado |
| Portal móvil y navegación | El scroll fue confirmado. El usuario reportó que el primer refresco de #231 no funcionó; desplegar #239 y validar el gesto en portal, cabecera y enlace directo en Safari/iPhone/Android. Validar también modales, X, menú, caché, Atrás/Adelante y descargas |
| Mis recibos y seguimiento automático | Validar #267–#282 en iPhone/escritorio: adjunto nativo, fechas SPEI, cuenta oficial, línea de tiempo, estado Fallido y refresco. Confirmar que ausencia de aviso o error IMAP permanece En revisión y que solo contradicción bancaria vinculada produce Fallido |
| TomTom | Desplegar #263 y probar incidencias reales en español con la llave del proyecto; distinguir un HTTP 400 anterior de una respuesta válida con los campos consumidos por la UI |
| Body-parser y dependencias | Redesplegar backend desde el lock de #270, confirmar rechazo 415 de gzip/deflate/Brotli y ejecutar smoke de login/pagos. Revisar por separado los cinco avisos restantes de npm audit sin aplicar `audit fix --force` a ciegas |
| TEST-001 temporal | Usar únicamente clon/base de pruebas y scripts con COMMIT comentado; no borrar evidencia bancaria real ni tocar `zk_tarjetas` por SQL. #287 altera temporalmente el padrón/porcentajes de Análisis y debe revertirse después de la validación |
| Despliegue de unificación Pagos–Análisis–C3 | #288–#290 ya están en main. Respaldar, aplicar/verificar la migración aditiva, conciliar reportes/entregas antiguas y probar una vivienda con y sin TAG. Confirmar que el pago persiste aunque C3 falle, que no se duplica al reintentar y que Análisis/Pagos muestran el mismo saldo |
| Monitor automático de adeudos | Mantener apagado hasta respaldo/cotejo, piloto autorizado, padrón exacto, dry-run y lectura física. Probar que solo mantenimiento bloquea TAGs, que extraordinarias/Casa club no escriben C3, reactivación manual y ausencia de desbloqueo automático al saldar |
| Manual integral de aceptación | Ejecutar y registrar los 24 apartados A01–A24, seis FTI y casos Z01–Z18 del manual raíz; el merge documental no los da por superados |
| Noticias y tráfico | Desplegar frontend/backend y comprobar fotos de fondo, fallback sin imagen, Tráfico ZMG, proxy/CSP/CDN, buscador, orden por fecha y estados de error con fuente real en móvil/escritorio |
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
| Conciliación bancaria por correo | Desplegar y validar Titan/Hostinger con un reporte controlado, sin repetir depósitos. La política actual #284 confía en From exacto y asunto sin DKIM/DMARC, riesgo de suplantación aceptado por instrucción documentada; mantener todos los demás cotejos y auditar antes de operar masivamente. AGENTS.md aún dice “confirmación administrativa actual” aunque #261 eliminó la aprobación manual; aclarar esa frase. #283 permanece abierto pero funcionalmente cancelado/sustituido |
| Migración final de `direccion_id` | Respaldar; ejecutar SQL 01; desplegar todo el backend nuevo y retirar instancias/importadores antiguos; probar; después, sin escrituras, ejecutar SQL 02. DDL no revierte con ROLLBACK y código antiguo no puede volver tras retirar la columna |
| Tarifa y exención por vivienda | AGENTS.md ya reconoce `direcciones.cuota_por_cobrar` con default $300 y #290 añade exenciones persistentes. Falta migrar/verificar esquema, probar cambios de tarifa/exención y confirmar que pagos históricos, referencias y C3 no se alteran |
| Recibos, Excel y exportación de Análisis | Desplegar frontend/backend según corresponda; descargar el XLSX vigente (#252/#253) y abrirlo en la misma versión de Excel sin reparación, verificando seis hojas/cinco gráficas y pagadas/total. Validar iconos #254/#255 y recibo por movimiento #256 en escritorio/móvil sin registrar pagos |
| Orden por fecha, UI y pago anual en Análisis | Comprobar que #240 ya no aparece, que #244 conserva el filtro de orden, que #245 cobra solo meses faltantes y que #247 filtra Pago anual sin confundir diciembre ordinario. No registrar pagos reales hasta conciliar #243/#246 y validar con datos controlados |
| Fechas DD-MON-YYYY | Revisar visualmente 24 páginas y selectores nativos en Safari iOS/Chrome Android; confirmar que valores ISO, zona México y folios permanecen intactos |
| Base de deuda sin pagos: enero vs septiembre | Resolver la discrepancia antes de desplegar: #290/código limita cortes heredados a enero de 2026, mientras AGENTS.md indica septiembre de 2026 cuando no hay cobertura. Definir la regla, actualizar fuentes rectoras/código y probar casos sin historial sin inventar periodos |
| Versión PHP en Hostinger | No hay evidencia recuperada de una consulta al entorno ni de una actualización. Confirmar en hPanel/CLI la versión efectiva y su relación con el sitio; el backend del repositorio es Node.js, por lo que no asumir que una actualización de PHP corrige este servicio |
| Prueba integral en producción | Primero retirar la excepción temporal TEST-001 cuando termine la prueba. Después, con vivienda/TAG dedicados y referencia nueva: comprobar `cuotas` antes/después, Análisis, historial, evento C3, idempotencia y lectura física; no repetir transferencia ante una falla |

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

### 2026-10-25

- Main consultado a las 23:30, America/Mexico_City, en `853200d7460d5d8141ef7b8e09b034ca1b6cf864`: nueve commits por delante del SHA revisado el 24/oct. Se excluyó `dc3721d`, que solo actualizó esta bitácora.
- PR #294 fusionado: Seguridad ahora comparte con Pagos/Análisis el cálculo y clasificador de mantenimiento. Considera tarifa individual, exenciones, pagos adelantados y abonos parciales sin modificar cuotas, pagos ni ZKTeco.
- La regresión Atotonilco 752 quedó cubierta con fixtures: un pago confirmado que cubre el corte evita clasificar como deudor por una fila pendiente antigua. Esto no confirma la base ni el despliegue reales.
- GitHub Actions run 40168871351 concluyó exitosamente para el head de #294; las regresiones Seguridad/Análisis fueron obligatorias. Las suites UI/bancaria heredadas siguen como diagnóstico no bloqueante.
- No hay PR abiertos ni confirmaciones físicas/operativas nuevas accesibles. Se conservan la discrepancia enero/septiembre y todos los pendientes de Hostinger, MySQL y C3.


### 2026-10-24

- Main consultado a las 23:26, America/Mexico_City, en `bd983ec8705b9b9020d59845ba0e521dad651b09`: 60 commits por delante del SHA revisado el 23/oct. Se excluyó `1ea0ac6`, que solo actualizó esta bitácora.
- PR #288–#289 fusionados: unifican Pagos/Análisis por vivienda, aceptan pagos sin TAG, acreditan antes de sincronizar C3 y calculan meses consecutivos desde el último corte. La migración, Hostinger, MySQL, buzón y C3 reales no fueron verificados.
- PR #290 fusionado: añade saldo a favor, exenciones y base enero de 2026 para casas sin pagos. Queda explícito el conflicto con AGENTS.md, que conserva septiembre; no se da por resuelto.
- PR #291–#293 fusionados: formato sin decimales en tarjetas/historial y ajustes de la interfaz/confirmación de exención. No cambian pagos ni C3.
- GitHub Actions acreditó cuatro runs exitosos para los heads de #290–#293. Los siete fallos bancarios heredados siguen siendo diagnóstico no bloqueante; #288–#289 no tuvieron workflow runs. No se ejecutaron pruebas nuevas de producción ni físicas.
- PR #283 fue cerrado sin merge. No hay PR abiertos. Tampoco se recuperó evidencia para afirmar una versión PHP actualizada en Hostinger; se conserva como pendiente.


### 2026-10-23

- Revisión de las 23:28: main leído en `c5e044e1e0008ea21d7f99a51a6dd8e391c3d4f9`, 139 commits después de `cd24e60`. Se excluyó `d83d5ae7829eef681d590afa794bb1ef34d4a392`, dedicado al estado del 22/oct.
- Se fusionaron #267–#282 y #284–#287. #283 sigue abierto, pero #284 sustituyó su propuesta de autenticación; GitHub devolvió cero estados y cero workflow runs para 20 merges y el head abierto.
- #267–#269 mejoran Pagos y crean un modo de $10 aislado. #270 corrige body-parser 2.4.0 y bloquea cuerpos comprimidos: 7/7 pruebas HTTP locales. #271–#274 corrigen iPhone, fecha SPEI y restauran selector nativo.
- #275–#282 amplían OCR por tipo, trazabilidad, diagnóstico de Titan, lectura de importes y cuenta oficial. Las comprobaciones son simuladas; los diagnósticos de producción conservados no acreditan que esta revisión leyera el buzón o MySQL.
- #284 aplica la instrucción documentada de confiar en remitente exacto/asunto sin DKIM/DMARC; AGENTS.md reconoce el riesgo de suplantación. El PR #283 permanece pendiente y ya no representa la política vigente.
- #285 confirmó en código/documentación que validar un reporte no actualiza de forma general `cuotas`. #285–#286 agregan solo una excepción TEST-001 y #287 la hace visible temporalmente en Análisis. El usuario pidió unificar Pagos con la fuente de Análisis y sincronizar C3 después; no existe aún implementación general en main.
- No se consultó ni modificó Hostinger, MySQL, C3 o buzón; no se ejecutaron scripts SQL, pagos ni pruebas físicas. Un merge no acredita despliegue ni funcionamiento.

### 2026-10-22

- Revisión de las 23:27: main leído en `cd24e60d0b325a735cad72a089dd05f34f74e9da`, 153 commits después de `d12ad50`. Se excluyó `0acc3bee1b87ca4508631abe13b0d36b74f1ecd6`, dedicado al estado del 21/oct.
- Se fusionaron #247–#266 y no hay PR abiertos. GitHub devolvió cero estados y cero workflow runs para los 20 merges.
- #247–#253 dejan un Excel de seis hojas/cinco gráficas; #249 y #251 introdujeron regresiones de reparación y #250/#252 las retiraron. #253 muestra pagadas/total por calle y #254–#255 añaden iconos. La evidencia conserva una apertura correcta de #250 y un fallo de #251, pero falta validar la versión vigente #252/#253.
- #256 añade recibo PDF por movimiento. #260/#262 agregan y alinean refresco en Mis recibos. Son cambios en main sin prueba visual de producción.
- #257 (Outlook) y #258 (Gmail) fueron reemplazados por #259 (IMAP genérico). #261 elimina aprobación/rechazo manual: solo correo autenticado puede validar. #264 corrige el entorno del diagnóstico y #265 permite reenvíos del administrador configurado; la fuente confiada pasa a ser ese administrador, no la firma bancaria exterior.
- El diagnóstico real previamente documentado leyó 41 mensajes, pero no acreditó avisos autenticados ni aprobación. #266 ya corrige en main la lectura del importe en fila separada y reporta 28 pruebas sintéticas; aún falta desplegarlo y repetir el diagnóstico real.
- #263 corrige TomTom a español `es-ES`. No se consultó ni modificó Hostinger, MySQL, C3 o buzón; no se aprobaron pagos, ejecutaron migraciones ni hicieron pruebas físicas. Un merge no acredita despliegue ni funcionamiento.

### 2026-10-21

- Revisión de las 23:31: main leído en `d12ad500ac39689b1072fb48a85f1b33f66fcff0`, 131 commits después de `91a4bb3`. Se excluyó `fe7dc35475874d7a6f71a46e25a09a976143f7e2`, dedicado al estado del 20/oct.
- Se fusionaron #231–#246 y no hay PR abiertos. GitHub devolvió cero estados y cero workflow runs para los 16 merges.
- #232–#237 corrigen la superposición de cabecera/modales, conservan el menú de escritorio, unifican la X morada y fijan la posición de Modificar cuotas. #238 garantiza foto real o ilustración etiquetada y quita la flecha de Ayuda. Son cambios en main, no pruebas visuales de producción.
- El usuario reportó que el refresco inicial de #231 no funcionó. #239 amplía el gesto a páginas directas, paneles y cabecera y reporta 20/20 pruebas simuladas; aún falta despliegue y confirmación física en Android/iOS.
- La solicitud de pagos por fecha de #240 fue corregida por el usuario: #241 la reemplazó por orden en la tabla existente, #242 añadió fecha/hora y controles; #244 ocultó la columna y el contador, conservando el filtro de orden. No hubo prueba visual ni MySQL real.
- #243 implementa conciliación explícita de una tarifa especial y #245 agrega Pago anual de meses faltantes. #246 permite fijar el corte absoluto C3 y reducir una vigencia posterior para pagos manuales validados. Estas reglas requieren conciliación con AGENTS.md ($300 y avance desde fecha física) antes de uso real.
- No se consultó ni modificó Hostinger, MySQL o C3; no se ejecutaron migraciones, pagos ni pruebas físicas. Un merge no acredita despliegue ni funcionamiento.
### 2026-10-20

- Revisión de las 23:26: main leído en `91a4bb3f40211096b09be55bea24003df5c39831`, 23 commits después de `9e226f5`. Se excluyó `7f9a3e648fa48d00118870bf1a838a6f39d6b233`, dedicado al estado del 19/oct.
- Se fusionaron #220–#230. #231, que añade deslizar hacia abajo para refrescar una sección en móvil, sigue abierto y no forma parte de main. GitHub devolvió cero estados y cero workflow runs para los 11 merges y el head abierto.
- Auto-users: #221 valida credenciales antes de confirmar vivienda, #224 habilita correo individual de prueba y #229 elimina el login por teléfono. El usuario confirmó la configuración SMTP y recepción de una invitación individual; no se publica el remitente. La dirección pública y la aceptación completa siguen pendientes.
- #222 incorpora cuota configurable por vivienda y SQL manual, pero AGENTS.md todavía declara $300 como regla vigente. La discrepancia se conserva como bloqueo: no se considera autorizada la migración ni una tarifa distinta por el solo merge.
- #223 crea navegación persistente y restaura Inicio por rol; #226–#227 corrigen estilos/caché; #230 corrige scroll móvil. El usuario confirmó que el scroll ya funciona. El pull-to-refresh de #231 aún requiere merge y prueba física.
- #220/#225/#228 incorporan fotografías propias por noticia, recuperación de miniaturas de Tráfico ZMG y fondo con degradado. Las pruebas dirigidas de #225/#228 pasan; #220 añadió pruebas pero no ejecutó Node en esa entrega. Falta validación Hostinger/CSP/CDN y visual.
- No se consultó MySQL/C3 ni se ejecutaron migraciones, pagos o pruebas físicas de hardware durante esta revisión. Se conservan los pendientes e historial anterior.

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
  La lectura de notificaciones bancarias se discutió como propuesta, sin implemen
