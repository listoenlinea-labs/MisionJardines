# Manual integral de funcionamiento y pruebas — Misión Jardines

Revisión inicial del código del **18 de octubre de 2026**; **auditoría adicional de pagos, Casa club y ZKTeco: 19 de octubre de 2026**; **ampliación funcional por sección: 19 de octubre de 2026**. Documento principal ubicado en la **raíz del repositorio**, junto a `AGENTS.md`, `backend/` y `docs/`. Alcance: páginas de `docs/`, API de `backend/src/app.js`, modelos, servicios y pruebas en `backend/test/`. Este es un **manual de funcionamiento y guion de aceptación**, no un certificado de que Hostinger, MySQL, correo, TomTom o el C3-200 funcionen hoy: para afirmarlo hay que ejecutar y registrar los casos en un entorno real autorizado. Los resultados automatizados mencionados abajo usan simulaciones, no el controlador de producción.

**Cómo consultar el manual:**

- **§1** Preparar entorno, roles, dispositivos, datos de prueba y evidencia.
- **§2, A01–A07** Identidad, sesión, viviendas, padrón y verificación de cuentas.
- **§2, A08–A13** Los tres pagos, Casa club, Cuotas y Análisis financiero.
- **§2, A14–A16 y A24** ZKTeco, caseta, visitas, pluma y cámaras.
- **§2, A17–A23** Calendario, anuncios, reportes, directorio, telefonía, configuración y búsqueda.
- **§3–§4** Relación deuda–TAG, integración real y siete hallazgos técnicos sin corregir.
- **§5** Seis recorridos end-to-end entre secciones; **§6** criterios para aceptar una prueba.

**Criterio de estados:** «Implementado según el código» indica que existen rutas, modelos y operaciones correspondientes; «probado con mocks» solo valida la simulación; «pendiente en producción» significa que **no se leyó ni escribió el MySQL/C3/servicio real** para acreditarlo. La documentación no sustituye la ejecución física. **La ausencia de ejecución no debe redactarse como “sí funciona en producción”.**

## 1. Preparación y reglas de ejecución

1. Probar primero en **staging** con copia anonimizada y un C3 de pruebas o simulador. No crear cargos, cambiar fechas ni deshabilitar TAGs del fraccionamiento para ensayar casos.
2. Crear usuarios de prueba `SUPER_ADMIN`, `ADMINISTRADOR`, `MESA_DIRECTIVA`, `SEGURIDAD` y `CONDOMINO`; una vivienda sin deuda, otra con mantenimiento vencido, otra con cuota extraordinaria exigible y otra con reserva de Casa club aprobada/no pagada. Un administrador también debe estar vinculado a una vivienda: no eximirlo por su rol del cobro.
3. Confirmar con las consultas del [mapa SQL](docs/MAPA_SQL_POR_MODULO_20261018.md) las tablas, índices, vínculos y **padrón real**. La cifra contractual para repartir extraordinarias es **231**; un listado más grande no equivale al padrón oficial.
4. Ejecutar cada caso en escritorio y móvil (360, 375, 390 y 430 px), iOS Safari y Android Chrome: pestañas horizontales, scroll vertical hasta el último registro, sin contenido volteado, texto legible y modales cerrables.
5. Para operaciones que modifican estado, capturar antes/después: ID de vivienda, ID de operación, respuesta HTTP, estado SQL, referencia del movimiento de C3 y evidencia visual. No guardar contraseñas, JWT, comprobantes ni teléfonos reales en el repositorio.
6. Usar `npm test` y las suites selectivas de `backend/test/` y `tests/`. Una prueba automatizada con dependencias simuladas **no demuestra** entrega física, banco conciliado ni conectividad externa.

Ficha por caso para el acta de pruebas:

| Caso | Rol / vivienda anónima | Pasos y dato de entrada | HTTP / UI esperados | SQL antes/después | C3 (solo piloto) | Evidencia / resultado |
| --- | --- | --- | --- | --- | --- | --- |
| ID de esta lista | Rol permitido o denegado | Hora MX, fecha y monto | Resultado exacto | Referencia sin PII | Solo lectura o escritura autorizada | Pasa / falla / no ejecutado |

## 2. Cobertura por sección: qué hace, qué no hace y flujo completo

### A01. Registro, login y recordar sesión (`login.html`, `registro.html`, `aceptar-cuenta.html`)

**Hace:** autentica cuentas activas y verifica la pertenencia/rol en la API; el flujo de auto-users permite aceptar una invitación válida. **No hace:** permitir ingreso a prerregistros pendientes ni prometer una sesión eterna: las credenciales y versiones de sesión deben revalidarse en el servidor.

**Lógica y conexiones:** `docs/assets/js/login.js` envía correo/contraseña y `recordarme` a `POST /api/auth/login`. El backend comprueba la contraseña cifrada, cuenta `ACTIVO` y `cuentaAceptada`, firma JWT con usuario, rol, casa y versión de sesión. **Recordar = JWT de hasta 90 días en `localStorage`; sin recordar = JWT ordinario de 8 horas por defecto en `sessionStorage`**. Al volver a abrir, `/api/auth/perfil` revalida el token; no se guarda la contraseña. El inicio conecta con permisos (`permissions.js`), vivienda activa (`usuarios_casas`) y página de destino por rol.

**Prueba adicional de conexión:** abrir dos navegadores, seleccionar «recordarme» solo en uno, cerrar ambos y comparar almacenamiento; revocar cuenta o cambiar `sesion_version`, abrir ambos y exigir rechazo del token invalidado. Comprobar que un administrador con casa asignada sigue teniendo adeudos, y que el backend deniega privilegios aunque se manipule el rol mostrado en el navegador.

1. Registrar una cuenta de prueba; solicitar/verificar código y revisar estados previos a su autorización. No debe habilitarse antes de ser aprobada.
2. Iniciar sesión con contraseña correcta, incorrecta y cuenta suspendida; esperar redirección correcta o 401/403 sin revelar si existe el usuario.
3. Marcar «Mantener sesión iniciada», cerrar pestaña y navegador, reabrir y comprobar autenticación válida; repetir sin marcarla y tras caducidad/revocación. La opción no debe saltarse expiración o cierre forzoso.
4. Abrir rutas de administrador como condómino, tanto desde la interfaz como enviando peticiones API: esperar 403; una URL pegada no es autorización.
5. Verificar en móvil, pestaña privada y cambio de contraseña: no reutilizar una sesión invalidada.

### A02. Inicio y tablero (`index.html`)

**Hace:** muestra KPIs, actividad, avisos de adeudos por vivienda y panel de noticias/tráfico. **No hace:** conciliar depósitos ni actualizar el acceso físico desde una tarjeta informativa.

**Lógica y conexiones:** `GET /api/dashboard` responde con datos **financieros** a `SUPER_ADMIN`/`ADMINISTRADOR` y vista **operativa** de visitas/accesos a otros roles; Seguridad tiene alcance operativo general y Condómino solo las viviendas activamente vinculadas. Los avisos financieros propios se apoyan en `/api/pagos/adeudos`. El módulo de entorno usa `/api/entorno/noticias` (FreeNewsApi, ventana de 7 días, filtros locales, relevancia y caché de 15 minutos), `/api/entorno/incidencias` y teselas de tráfico TomTom. Noticias, tráfico y KPIs tienen proveedores/errores independientes; un 502 externo no debería generar cifras inventadas.

**Prueba adicional de conexión:** como administrador con vivienda deudora comparar indicador y desglose de los 3 conceptos con Pagos; como Condómino/Seguridad solicitar directamente `/api/dashboard` y verificar ausencia de métricas financieras que no les correspondan. Forzar respuesta vacía o 429 del proveedor de noticias y verificar carga del resto de Inicio, sin mostrar notas fuera de Zapopan/Guadalajara.

1. Abrir como condómino sin deuda, condómino con cada deuda y administrador con vivienda vinculada: cotejar burbujas, total y enlace a Pagos por concepto.
2. Verificar que las tarjetas de noticias inician a la izquierda y tráfico a la derecha, y que el componente se puede voltear y volver sin texto invertido.
3. Buscar noticias por término, ordenar por fecha, revisar relevancia de Zapopan/Guadalajara y cercanías; descartar resultados de otras ciudades y publicaciones mayores de siete días cuando la fuente publique fecha válida.
4. En tráfico, verificar consulta TomTom con `language=es`, teselas y mensaje legible ante 400/429/timeout; no atribuir colores a segmentos sin datos.
5. Revisar scroll completo y tarjetas responsivas sin cortar últimas noticias; comprobar vacío y error externo sin bloquear todo Inicio.

### A03. Mi cuenta (`cuenta.html`)

**Hace:** muestra/edita perfil, contraseña, cambio de correo verificado y solicitudes de rol. **No hace:** reasignar automáticamente vivienda o modificar el padrón de residentes.

**Lógica y conexiones:** `/api/auth/perfil` devuelve la cuenta asociada al JWT; `PATCH /perfil`, `/perfil/contrasena` y `/perfil/correo/solicitar|verificar` controlan campos, contraseña y verificación de un correo nuevo. `/api/auth/solicitudes-rol` guarda solicitudes para revisión administrativa; una petición no es un permiso nuevo. La casa de Mi cuenta es referencia de identidad, pero los vínculos de Mis viviendas se administran mediante `usuarios_casas`.

**Prueba adicional de conexión:** iniciar sesión en dos dispositivos y cambiar contraseña/correo; comparar token, perfil, acceso autorizado y notificación de error, sin filtrar hashes ni códigos. Solicitar `ADMINISTRADOR` como Condómino y probar la API restringida antes de la aprobación: debe mantener 403.

1. Consultar datos de la cuenta, editar datos permitidos, recargar y constatar persistencia.
2. Cambiar contraseña y verificar que el secreto anterior no funciona; cambio de correo debe requerir código y no poder usarse antes de validarlo.
3. Solicitar rol, revisar como administrador; comprobar que no existe escalamiento por un payload manipulado.

### A04. Mis viviendas (`viviendas.html`, `invitacion.html`)

**Hace:** vincula cuentas a viviendas mediante `usuarios_casas`, gestiona miembros/responsables e invitaciones. **No hace:** alterar por ello deudas, pagos, TAGs ni registros `condominos`.

**Lógica y conexiones:** `/api/viviendas/mias` lista únicamente vínculos activos; `/:casaId/miembros` controla responsables/invitaciones con permisos. Una invitación se envía al correo, guarda **hash del token** y caduca en **72 horas**; quien la acepta debe iniciar sesión con el mismo correo. Cambiar casa seleccionada altera el alcance de Pagos y Casa club, **no el `casa_id` histórico** de movimientos ni la vivienda física de un TAG.

**Prueba adicional de conexión:** usar una cuenta con dos casas, saldo diferente en cada una y fechas Casa club distintas; alternar la casa activa y confirmar que deuda/reservas no se mezclan. Invitar al mismo correo tras revocar la invitación anterior: aceptar solo la vigente; desvincular responsable y rechazar acceso a miembros y emisión de invitaciones con su sesión.

1. Vincular una cuenta a dos viviendas; cambiar la vivienda activa y constatar que Pagos consulta el `casa_id` seleccionado.
2. Invitar, aceptar, caducar, revocar y reintentar una invitación; prevenir tokens repetidos y vínculos duplicados.
3. Eliminar vínculo de un miembro; comprobar que pierde acceso a datos de la vivienda, sin borrar su historial financiero ni al residente del padrón.

### A05. Verificación de cuentas (`verificacion-cuentas.html`)

**Hace:** aprobar, rechazar, revocar y asignar rol/vivienda a cuentas. **No hace:** confirmar pagos ni autorizar permisos físicos del C3.

**Lógica y conexiones:** la administración consulta `/api/auth/cuentas`, revisa solicitudes/verificaciones y actualiza el estado del usuario y su relación con `direcciones`; la revocación hace inválida la sesión a través de `sesion_version`. La aprobación habilita autenticación **y permisos asociados al rol**, pero no crea una cuota pagada, abono bancario ni `userauthorize` del C3.

**Prueba adicional de conexión:** aprobar una cuenta con rol Condómino y casa real; confirmar que entra y ve solo su casa. Revocar después de iniciar sesión y repetir `/api/pagos/adeudos` con token anterior: esperar denegación. Probar cambio de rol y viviendas desde API con un token de Condómino: 403.

1. Crear solicitudes PENDIENTES; aprobar y revisar `usuarios.estatus`, `usuarios_casas` y `historial_vinculos`.
2. Rechazar/revocar, intentar acceso con token anterior y verificar invalidación de sesión (`sesion_version`).
3. Repetir operaciones desde usuario no administrador: 403. Confirmar que altas no crean casas duplicadas.

### A06. Auto-users y aceptación (`auto-users.html`, `aceptar-cuenta.html`)

**Hace:** genera prerregistros, prepara invitaciones, permite consulta/reporte/aceptación con token válido; pruebas individuales. **No hace:** garantizar envío WhatsApp si no está configurada la integración, ni habilitar por defecto un prerregistro sin aceptación.

**Lógica y conexiones:** `/api/auto-users` toma registros elegibles del padrón, genera prerregistros pendientes e invitaciones reemplazables, almacena hashes y permite aceptación individual por `/invitacion/aceptar`. La aceptación valida identidad/vivienda, genera contraseña elegida y activa **CONDOMINO**, sin transformar al usuario en administrador. Los envíos de WhatsApp son un paso externo que exige proveedor/plantilla; un fallo de entrega no constituye aceptación. Ver [referencia de auto-users](docs/AUTO_USERS.md).

**Prueba adicional de conexión:** lote de staging dos veces con la misma vivienda, una invitación caducada y otra reemplazada: no crear dos cuentas aceptadas para el mismo condómino; el enlace viejo debe fallar. Revisar caso sin proveedor WhatsApp, sin conexión y con aceptación satisfactoria por vía válida; verificar que Inicio, perfil y vínculo `usuarios_casas` reflejan la cuenta nueva.

1. Seleccionar lote pequeño de staging; crear dos veces (idempotencia), revisar `auto_users_invitaciones` y estados sin publicar hashes.
2. Probar envío individual con canal configurado, token vencido, sustituido, usado dos veces y reporte de datos incorrectos.
3. Aceptar una vez: usuario ACTIVO, rol CONDOMINO, vivienda correcta; intentar aceptación con token gastado: rechazo.
4. Editar/borrar **solo** cuenta de prueba identificada con confirmación; comprobar ausencia de afectación a cuentas reales.

### A07. Residentes / padrón (`bases_datos.html` y gestión de residentes)

**Hace:** consultar viviendas, gestionar datos de `condominos`, contacto y renta. **No hace:** crear automáticamente contraseña/cuenta, cambiar fecha C3 ni extinguir adeudos al cambiar de inquilino.

**Lógica y conexiones:** la identidad de la vivienda es `direcciones.id`. El padrón/residentes usa `condominos` y rutas `/api/casas/:id/residentes`; la selección de viviendas aplica reglas de visibilidad del padrón y normalización de nombres de calle. `condominos` **no es lo mismo** que `usuarios` ni `usuarios_casas`. Cuotas, Casa club y ZKTeco se relacionan por `casa_id`, aunque cambie el nombre del residente mostrado.

**Prueba adicional de conexión:** editar apellido/teléfono de un residente ficticio; antes/después verificar el mismo `direcciones.id`, `casa_id` en pagos y TAGs, e historial de acceso. Buscar las excepciones visibles Guadalajara 707 y Valle de México 3614 sin tomar registros ocultos como eliminados de MySQL.

1. Buscar vivienda por calle y número con acentos/«Av.»; comparar contra padrón oficial y lista de exclusiones.
2. Crear residente ficticio; editar teléfono/correo/contacto; sustituir inquilino según edición soportada y revisar que no se multiplica el ID.
3. Comprobar cuotas, TAGs y pagos invariantes tras la edición; confirmar permisos de edición solo a administración.

### A08. Pagos — Mantenimiento (`pagos.html`, primera pestaña)

**Hace:** cotiza desde la fecha **física** de los TAGs C3, reporta comprobantes con OCR, abonos, validación administrativa, recibos y diario de avance C3. **No hace:** aprobar automáticamente un comprobante ni tomar la fecha de una tabla heredada como vigencia física.

**Lógica y conexiones:** `GET /api/pagos/cotizacion` lee la fecha final de **todos** los TAGs de la vivienda en C3 y usa `recargos-mantenimiento.service.js`; `POST /api/pagos` revalida monto y OCR de servidor y crea `pagos_reportados` pendiente. `PATCH /api/pagos/:id/revision` aprueba/rechaza; aprobar actualiza cuotas/cortes de recargo, registra `pagos_acceso_c3` + `pagos_acceso_tags_c3` y notifica al escritor C3. El escritor cambia `user.EndTime` desde la **fecha física** verificada, no `userauthorize`; cada $300 netos de principal compra un mes, cortes no cubiertos añaden $50 y el remanente se conserva. **Nunca confundir recibo generado con banco conciliado ni EndTime extendido con acceso desbloqueado**.

**Prueba adicional de conexión:** cotejar la misma casa en Pagos, Cuotas, Análisis, Inicio y ZKTeco **antes** de reportar, **después** del reporte pendiente, **después** de aprobar y **después** del evento C3 `COMPLETADO`. Repetir con abono, sobrepago, dos TAGs, fallo TCP, referencia duplicada y TAG previamente bloqueado. Confirmar qué muestra cada pantalla mientras la entrega física está en `ERROR` o `CONFLICTO`.

1. Elegir casa, leer TODOS sus TAGs y la misma fecha final. Si no hay TAG, la lectura falla, las fechas difieren o existe pago en C3 pendiente, detener cotización con error explicativo.
2. Verificar $300/mes, vencimiento día 10 inclusive, recargo $50 por corte vencido no pagado; contrastar casos numéricos de `AGENTS.md`.
3. Reportar imagen legible; confirmar OCR **de servidor**: destino, fecha, hora, folio y monto. Dato ilegible o discrepante detiene reporte. No subir información bancaria real al entorno de pruebas.
4. Revisar como administrador: antes `PENDIENTE_VALIDACION`, después `VALIDADO`/`RECHAZADO`, recibo si procede; recargar y comprobar que no se confirmó dos veces.
5. Abono de $300 con recargo de $50: $250 de principal, 0 meses; complemento nuevo de $50 validado debe completar el mes sin recobrar el corte.
6. Duplicar referencia bancaria: error/idempotencia; simular falla TCP **solo en ambiente de pruebas** y comprobar diario ERROR/CONFLICTO, reintento sin duplicar extensión.
7. Administrador dueño también debe su cuota; prueba negativa: extraordinaria o Casa club no incrementan vigencia.

### A09. Pagos — Cuota extraordinaria (`pagos.html`, segunda pestaña)

**Hace:** presenta cargos mensuales por proyecto/vivienda, acepta comprobante o registro manual, valida cobros, refleja adeudo independiente. **No hace:** aumentar meses de mantenimiento o desbloquear por sí sola el C3.

**Lógica y conexiones:** un egreso `CUOTA_EXTRAORDINARIA` registrado en `/api/finanzas/egresos` genera proyecto en `cuotas_extraordinarias` y cuotas por casa/mes en `cargos_extraordinarios` solo si el padrón da **231 casas**. `estadoCargos()` cruza comprobantes validados/pendientes (`pagos_reportados`) y registros manuales (`pagos_manuales_concepto`). `consultarAdeudos()` solo considera exigibles los cargos cuyo mes ya comenzó. Esos saldos se muestran en Pagos, Análisis y alertas y son leídos por el **monitor C3 de bloqueo**; la validación de extraordinarias **no genera evento de ampliación de vigencia** ni habilita automáticamente un TAG bloqueado.

**Prueba adicional de conexión:** para proyecto $2310 en un mes, comprobar un cargo de $10 en cada una de 231 casas; variar un centavo residual en otro proyecto. Aprobar pago de una casa y comprobar que solo ese cargo desaparece de su adeudo; revisar `pagos_acceso_c3` sin nuevas filas por ese concepto, y probar el piloto del monitor con otra casa no pagada.

1. Crear en staging egreso categoría `CUOTA_EXTRAORDINARIA`; seleccionar 1–36 meses y primer mes válido; confirmar reparto exacto de centavos entre **231 viviendas**, sin duplicar cargos por mes.
2. Como dos viviendas distintas, verificar cargos distintos cuando corresponda residuo, suma total igual al egreso y cuota mensual por período.
3. Reportar comprobante; observar `PENDIENTE_VALIDACION`, aprobar y actualizar solo cargo indicado. Rechazar y reintentar otro folio.
4. Registrar pago manual con categoría correcta en Análisis; comprobar `pagos_manuales_concepto` y que el cargo pasa a PAGADO sin nuevo evento C3.
5. Probar egreso sin padrón reconciliado, fechas inválidas y repetición de `egreso_id`: no emitir cuotas incompletas o duplicadas.

### A10. Pagos — Casa club (`pagos.html`, tercera pestaña)

**Hace:** muestra renta, depósito y limpieza opcional de una reserva aprobada; recibe comprobante y conciliación. **No hace:** cobrar una reserva PENDIENTE como si estuviera aprobada ni conceder meses de mantenimiento.

**Lógica y conexiones:** la tercera pestaña de Pagos filtra `reservas_casa_club` de la vivienda `APROBADA` y `pagado=false`, vinculando comprobantes mediante `reserva_casa_club_id`. El comprobante debe presentarse antes del límite y pasar de `PENDIENTE_VALIDACION` a `VALIDADO` para marcar la reserva pagada; también existe registro manual administrativo por concepto. `consultarAdeudos()` expone el desglose del pago y el monitor C3 puede considerarlo **solo después** del plazo, si aún figura aprobada y sin comprobante en revisión. **Casa club no compra meses de acceso ni rehabilita TAGs**.

**Prueba adicional de conexión:** crear reserva para la casa A, pagar en Pagos con su vínculo exacto, y confirmar que ni casa B ni otra reserva de A se marcan pagadas. Registrar depósito y limpieza opcional, rechazar un comprobante, reintentar dentro del plazo, comprobar bloqueo de duplicados y analizar el conflicto de pago manual tardío F05.

1. Crear solicitud pendiente desde Casa club; comprobar que no aparece un cargo exigible antes de aprobación.
2. Aprobar con renta, depósito, limpieza y `fecha_limite_pago`; revisar desglose exacto y que solo la casa solicitante ve su deuda.
3. Subir comprobante ANTES de fecha límite; permanece en revisión hasta aprobación. Confirmación debe marcar reserva pagada; verificar no repetición del cobro.
4. Sin comprobante oportuno, al expirar liberar día y marcar reserva CANCELADA; con comprobante oportuno aún sin validar, NO cancelar por demora del administrador.
5. Comprobar en móvil tres pestañas visibles en una línea horizontal con desplazamiento horizontal si no caben, sin superponer títulos.

### A11. Casa club — Calendario y administración (`casa-club.html`)

**Hace:** permite solicitar fecha disponible, mostrar PENDIENTE, aprobar/rechazar, asignar fecha límite y costo, cancelar por falta de pago. **No hace:** marcar APARTADO una solicitud PENDIENTE ni permitir reservar con cualquier adeudo detectado por `consultarAdeudos`.

**Lógica y conexiones:** `/api/casa-club/fechas` publica únicamente fecha/estado; `/reservas` valida fecha, usuario/casa y saldo agregado de **los tres conceptos** mediante `consultarAdeudos()`; `fecha_bloqueada` impide doble solicitud mientras está `PENDIENTE` o `APROBADA`. Administración decide en `/administracion/:id` importes y plazo, y el pago se gestiona en Pagos. `expirarReservas()` corre **al consultar/actuar en la API Casa club**, no por cron independiente; cancela aprobadas impagas vencidas salvo comprobante oportuno en revisión, lo que repercute en adeudos y bloqueo C3 (F02).

**Prueba adicional de conexión:** solicitar con casa al corriente, bloquear fecha a tercero, aprobar con $600 renta/$300 depósito/$0 limpieza, verificar aparición en Pagos y deuda. Rechazar/cancelar, volver a consultar calendario y permitir una nueva solicitud; repetir vencimiento con y sin comprobante oportuno y comprobar que ninguna acción toca `EndTime`.

1. Sin adeudos, solicitar fecha y revisar ficha (nombre, casa, teléfono, fecha); debe quedar PENDIENTE para solicitante y terceros.
2. Intentar segunda solicitud del mismo día por otra casa: conflicto por fecha única; otra fecha sí puede solicitarse.
3. Con deuda en cada uno de los 3 conceptos: POST `/api/casa-club/reservas` devuelve 409; probar también como administrador vinculado a vivienda deudora.
4. Aprobar: exigir fecha límite anterior a evento y >= hoy, desglosar montos y dejar fecha ocupada; rechazar/cancelar: liberar.
5. Expiración: simular reloj en staging; comprobar regla de comprobante oportuno indicada en A10.

### A12. Cuotas (`cuotas.html`)

**Hace:** consulta/gestiona mensualidades por vivienda y estado de pago, según permisos. **No hace:** convertir un cambio de estado UI en escritura física inmediata ni saltar conciliación de C3.

**Lógica y conexiones:** `/api/cuotas` permite lectura a roles autorizados y edición/confirmación exclusivamente por permisos de servidor; guarda `cuotas` por vivienda/año/mes con importe, abonos, recargo y estado. La confirmación de un cobro de mantenimiento llama `vigencia-mantenimiento.service.js` con `origen:'CUOTA'`; si el mismo movimiento se reportó también en Pagos, la referencia compartida y la marca de máximo principal impiden **duplicar meses C3**. La eliminación o reversión contable **no restaura automáticamente** una fecha anterior en ZKTeco.

**Prueba adicional de conexión:** registrar movimiento desde Cuotas y el mismo folio desde Pagos para la misma casa; comprobar un único principal reconocido y un movimiento físico por nueva cantidad. Repetir pago parcial y confirmar que el estado `PAGO_PARCIAL` no se vuelve `PAGADO` antes de cubrir monto. Confirmar que un usuario Condómino puede consultar solo lo permitido, pero no editar.

1. Filtrar vivienda, mes, año y pagados/pendientes; cotejar con `cuotas` y desglose por $300/recargo.
2. Registrar o confirmar cuota desde rol autorizado, revisar folio y diario C3; rechazo/devolución no deben retroceder automáticamente EndTime.
3. Probar 403 en ediciones desde Condómino y Seguridad; recargar en móvil sin pérdida de filtros.

### A13. Análisis de cuotas / finanzas (`analisis-cuotas.html`)

**Hace:** consolida ingresos/egresos, tres pestañas por concepto, quién pagó/quién debe, gráfica de Casa club y pagos administrativos. **No hace:** asumir que todos los egresos son cargos a casas ni inferir por SQL una vigencia física.

**Lógica y conexiones:** `GET /api/finanzas/analisis?anio=&mes=` consulta cuotas, historial, egresos, ingresos manuales, extraordinarias, reservas y espejo de TAGs; `resumen-conceptos-analisis.service.js` calcula `viviendasConceptos` por **Mantenimiento / Extraordinario / Casa club**. `POST /finanzas/pagos-vivienda` registra mantenimiento manual y su diario C3; `POST /finanzas/pagos-concepto` registra extraordinaria o Casa club manual **sin modificar vigencias**. `POST /finanzas/egresos` crea el proyecto extraordinario transaccionalmente. El selector de «Último mes pagado» usa períodos históricos confirmados (incluso anticipos 2027), no EndTime; el balance evita duplicar ingresos históricos/importados.

**Prueba adicional de conexión:** comparar por una misma vivienda las tres filas con su detalle en Pagos; registrar pago en cada concepto y comprobar que no se afecta ninguna de las otras dos tablas. Probar mes futuro anticipado, un cargo extraordinario futuro, reserva de Casa club pendiente, saldo histórico importado y egreso común sin cuotas; inspeccionar los totales de la gráfica con un recibo pendiente que **no** debe contarse como ingreso validado.

1. Abrir Mantenimiento, Extraordinarias y Casa club; cada tabla debe conservar filtros, orden, acciones y columnas Estado/Pagado/Último mes pagado/Saldo pendiente con SU concepto.
2. Con cargos cero, Extraordinarias y Casa club deben mostrar saldo cero; añadir un cargo único de staging y comprobar solo la fila afectada (o las 231 en proyecto repartido).
3. Registrar pago manual con selector Mantenimiento / Extraordinaria / Casa club; verificar tabla de destino, folio único y ninguna imputación cruzada.
4. Crear egreso «Cuota extraordinaria» y plan de mensualidades; confirmar no duplicación ni proyecto al guardar dos veces.
5. Comparar barra Casa club contra pagos **validados** o manuales, nunca contra depósitos sin revisar; inspeccionar tablas/gráficas/scroll en móvil.

### A14. ZKTeco / TAGs / portones (`zkteco.html`)

**Hace:** refleja inventario físico C3, vincula TAGs a `direcciones`, permite operaciones físicas verificadas y bloqueos, aplica incrementos de mantenimiento desde diario. **No hace:** convertir una fila SQL en lectura física confiable, ni autorizar un TAG solo por editarle fecha.

**Lógica y conexiones:** `/api/zkteco` llama a `zkteco-direct.service.js`: `GET /tarjetas` consulta el espejo `zk_tarjetas`, `/diagnostico/viviendas/:id` coteja físicamente `user` y `userauthorize`, `/sincronizar` ejecuta lectura de inventario, `PATCH /tarjetas/:id/bloqueo` y `/viviendas/:id/bloqueo` modifican permisos físicos, y rutas dedicadas `/vigencia` y `/vigencia-tags` cambian `EndTime`. Las escrituras manuales usan la configuración de modo `ZKTECO_WRITE_MODE`; el **escritor de pagos** sí fuerza TCP `DIRECT`. Tres procesos tienen propósitos diferentes: autosync de inventario (solo lectura C3; 60 s por defecto), reintento de fechas por mantenimiento (5 min) y monitor opcional de deuda (15 min, **apagado por defecto**). El monitor lee los **tres conceptos**, pero únicamente **bloquea**, no activa tras pagar. Permisos de operación física y fecha válida son condiciones separadas.

**Prueba adicional de conexión:** cruzar matriz de 3 conceptos × 3 estados (sin deuda / exigible / pagado o en revisión) × 2 estados de TAG (autorizado/bloqueado); validar en C3 simulado y, solo con aprobación, en piloto físico. Probar todas las rutas con Condómino, Seguridad, Mesa Directiva y Administración; no confundir el permiso de `POST /pluma` para Seguridad con permiso para editar TAGs.

1. Diagnosticar presencia de TAG y autorizaciones en `user`/`userauthorize` vía API; simular lectura parcial sin marcar todos los TAGs como ausentes.
2. Comprobar que auto-sync cada 60s por defecto **solo lee**; recuperación de pagos cada 5 min no aplica fechas heredadas.
3. Probar bloqueo manual de un TAG y de una vivienda con varios TAGs en C3 de pruebas; verificar `userauthorize` y `zk_tarjetas.bloqueado` tras lectura. No borrar PIN/fechas/perfil de puertas.
4. Por cada deuda exigible (Mantenimiento vencido desde día 11; Extraordinaria período iniciado; Casa club aprobada y plazo vencido sin comprobante en revisión), probar **monitor de adeudos**: simulación sin escritura, piloto con ID explícito y escritura autorizada, lectura posterior sin autorización. Repetir: TAG ya bloqueado no vuelve a procesarse.
5. Aun con deuda, comprobar que el administrador puede **habilitar manualmente**, emitir y reasignar TAGs sin veto financiero. Confirmar la autorización física resultante. Si el monitor de adeudos está habilitado, podrá **volver a bloquear** el TAG en el siguiente barrido; esta acción manual no crea una exención permanente.
6. Fallos parciales C3: registrar TAG fallido, continuar máximo `ZKTECO_ADEUDOS_MAX_TAGS` por vuelta, conservar autorización/fecha si hubo error; inspeccionar respuesta y bitácora sin secretos.
7. Una reserva cancelada por expiración deja de ser deuda de Casa club; el monitor no reautoriza por sí solo. Administración puede reactivar el TAG manualmente.
8. Al editar directamente la vigencia del TAG, comprobar que se restaura el comportamiento previo de la ficha SQL (`bloqueado=false`, `fecha_fin_original=NULL`) y verificar **por separado** la autorización física, pues actualizar EndTime no garantiza que exista `userauthorize`.
9. Distinguir **edición general de TAG** (`PATCH /api/zkteco/tarjetas/:id`, que no cambia EndTime si se mantiene el mismo número de tarjeta) de **edición dedicada de vigencia** (`PATCH /api/zkteco/tarjetas/:id/vigencia` o `PATCH /api/zkteco/viviendas/:id/vigencia-tags`, que sí escribe la fecha física). Probar explícitamente ambas rutas, con permiso de puerta presente y ausente.

### A15. Seguridad y registro (`seguridad.html`)

**Hace:** registra entradas/salidas de visitas, paquetería y transporte; puede consultar estados de cuota permitidos. **No hace:** alterar historial bancario ni controlar TAGs por deducción de un panel visual.

**Lógica y conexiones:** `GET/POST /api/accesos`, `PATCH /api/accesos/:id/salida` escriben `accesos_seguridad`; `/api/visitas` vincula visitas programadas y movimientos de entrada/salida; `/api/seguridad-cuotas/cuotas-viviendas` ofrece lectura de deuda acotada por rol. Los botones de pluma usan `/api/zkteco/pluma` **como comando enviado**, pero un HTTP 200 no prueba que el mecanismo físico alcanzó posición. Para cámaras, `/api/camaras` prepara proxy HLS si existe puente/configuración; no equivale a video funcional sin gateway.

**Prueba adicional de conexión:** registrar acceso de visita que ya tenía QR, después salida, cotejar `fecha_entrada`/`fecha_salida` y tarjetas operativas de Inicio de Seguridad. Probar que Seguridad ve estados acotados sin comprobante bancario privado y que al intentar un registro de pago, una edición de TAG o una lectura administrativa no autorizada recibe rechazo.

1. Con rol Seguridad registrar acceso con vivienda/placas y salida; comprobar dos marcas temporales y usuario responsable.
2. Buscar visita válida/expirada, verificar autorización y datos mínimos; probar duplicación de salida y bloqueo de rutas de administración.
3. Consultar información de cuotas mostrada a Seguridad sin permitir ver comprobantes bancarios ajenos ni editar saldos.

### A16. Visitas y QR (`visitas.html`)

**Hace:** programa visitas con código único y marca entrada/salida; cancela según rol. **No hace:** abrir el C3 al crear una visita ni reemplazar la validación de guardia.

**Lógica y conexiones:** `/api/visitas` persiste `visitas_programadas` asociadas a una casa y al usuario autorizado. Los estados pasan de **PROGRAMADA → EN_CURSO → FINALIZADA** por entrada/salida desde personal de Seguridad/Administración; cancelar marca CANCELADA conforme a permisos. QR/código identifica una visita para caseta, **no es `CardNo` de ZKTeco** ni genera `userauthorize`. El tablero operativo agrega visitas del día y accesos aún abiertos.

**Prueba adicional de conexión:** crear visita para hoy y mañana, comparar `/api/dashboard` operativo con `/api/visitas`, intentar capturar otra casa cambiando `casaId` en la petición y registrar entrada dos veces. Revisar fecha/hora de México y que un visitante no se convierta en residente ni reciba TAG automáticamente.

1. Crear visita para propia vivienda, comprobar código, rango, fecha y estado PROGRAMADA; no permitir usar otra casa no vinculada.
2. Registrar entrada/salida desde Seguridad; comprobar EN_CURSO/FINALIZADA y fechas persistidas; rechazar segundo uso inválido.
3. Cancelar antes del evento, verificar no reutilización de QR; capturar comportamiento de vencimiento.

### A17. Calendario comunitario (`calendario.html`)

**Hace:** crea eventos comunitarios públicos, lista registros de `calendario` filtrados por visibilidad y rol, y permite desactivarlos. **No hace:** crear desde la API actual nuevos eventos `SOLO_CASA`/`SEGURIDAD`, editar eventos existentes ni administrar reservas de Casa club; tampoco sincroniza automáticamente la tabla histórica `eventos`.

**Lógica y conexiones:** `GET /api/eventos` filtra los registros `calendario` por visibilidad; `POST /api/eventos` crea eventos con `visibilidad='TODOS'` obligatoriamente en la implementación actual y `DELETE /api/eventos/:id` los desactiva (`activo=false`). No existe una ruta PATCH para editar ni una opción de POST que persista visibilidad personalizada. Las reservas **no** se guardan aquí, sino en `reservas_casa_club` por `/api/casa-club`. El dashboard contiene también consultas históricas a `eventos`: **no asumir sincronización bidireccional** entre tablas.

**Prueba adicional de conexión:** crear por API un evento y comprobar que siempre quede `TODOS`. Para probar lectura de `SOLO_CASA` y `SEGURIDAD`, preparar **fixtures en MySQL de staging** con esas visibilidades (no se pueden crear así por la API actual) y abrirlos con dos viviendas/roles distintos. Hacer una reserva de Casa club en la misma fecha: comprobar que el evento no bloquea por sí solo la reserva y que reservar no crea automáticamente un evento comunitario.

1. Crear evento público con fecha válida, tipo y ubicación; comprobar `calendario.visibilidad='TODOS'`, horario y que el listado no lo duplica.
2. Probar con fixtures de lectura `SOLO_CASA`/`SEGURIDAD`/`ADMINISTRACION` y confirmar filtrado por rol; `DELETE` debe desactivar el evento para todos. **La edición por PATCH no está implementada**: registrarla como pendiente, no como prueba aprobada.

### A18. Anuncios (`anuncios.html`)

**Hace:** administra anuncios **locales del navegador**. **No hace:** sincronizarlos a MySQL ni a otros equipos (implementación actual usa `localStorage`).

**Lógica y conexiones:** `docs/anuncios.html` mantiene anuncios e imágenes en `localStorage`, normaliza fechas/caducidad y elimina anuncios expirados al cargar. Se verifica el JWT para permitir entrar a la página, pero **el contenido no pasa por un endpoint central de anuncios**, por lo que otros usuarios no reciben la publicación. Una caché borrada/perfil nuevo equivale a otra base local.

**Prueba adicional de conexión:** crear un anuncio con imagen pequeña y vencimiento próximo, abrir otra pestaña del mismo perfil, luego otro navegador/usuario y comprobar diferencia; borrar almacenamiento y abrir de nuevo. Probar imagen excesiva y almacenamiento lleno sin mostrar «Guardado» si falló `localStorage.setItem`.

1. Crear, editar, borrar anuncio de prueba; recargar en el mismo navegador y comprobar persistencia local.
2. Abrir otra sesión/dispositivo: no prometer la misma lista; revisar mensaje de limitación y manejo de localStorage vacío/bloqueado.

### A19. Reportes y detalle (`reportes.html`, `reporte.html`)

**Hace:** captura/consulta tickets locales en `localStorage`. **No hace:** persistirlos en base central ni notificar automáticamente a administración.

**Lógica y conexiones:** `docs/reportes.html` (y su detalle) serializa tickets en una clave local del navegador, ofrece estados/consulta y puede generar datos de demostración si está vacía; autentica la sesión contra `/api/auth/perfil`, pero **no hay creación de ticket MySQL mediante `/api/reportes`** en `app.js`. La posibilidad de visualizar el reporte en la propia pantalla **no significa** que Seguridad o Administración lo hayan recibido.

**Prueba adicional de conexión:** registrar ticket con datos ficticios en navegador A, recargar y ver detalle; abrir navegador B y buscarlo: documentar **no sincronizado**. Borrar caché del navegador A y observar pérdida de tickets locales; probar datos muy grandes y alertar si el almacenamiento falla.

1. Crear reporte, editar estado/abrir detalle y recargar en ese equipo; probar filtros y adjuntos si la UI los permite.
2. Abrir en segundo dispositivo: registrar limitación de no sincronización, sin afirmar que hubo recepción central.

### A20. Directorio y mapa (`directorio.html`, `mapa.html`)

**Hace:** muestra puntos/contactos definidos en las páginas y cartografía. **No hace:** mantener un catálogo editable central de direcciones/establecimientos en MySQL.

**Lógica y conexiones:** `docs/directorio.html` y `docs/mapa.html` presentan recursos visuales/ubicaciones descritos en el frontend, con enlaces externos o mapas según configuración; **no son la fuente oficial de `direcciones` ni de la deuda**. El módulo de tráfico en Inicio usa `/api/entorno`, mientras el mapa/directorio y búsqueda general tienen usos distintos. La ubicación GPS del teléfono puede ser opcional y no autoriza acceso a otra vivienda.

**Prueba adicional de conexión:** comprobar entradas/enlaces del directorio, ubicación permitida/denegada, conexión intermitente y pantalla estrecha. Comparar búsquedas de domicilios en el padrón contra el directorio para no inferir que una ficha está sincronizada con `condominos` si proviene de HTML estático.

1. Verificar enlaces, búsqueda/listado, coordenadas, datos visibles a roles y permisos de ubicación.
2. Probar dispositivo sin geolocalización, conexión lenta, zoom móvil y proveedor de mapa sin API key.

### A21. Conmutador / telefonía (`conmutador.html`)

**Hace:** expone modo y configuración de la integración telefónica; la búsqueda de teléfonos usa una tabla heredada de importación. **No hace:** garantizar llamadas o mensajes WhatsApp si el motor externo está deshabilitado; alta en `condominos` no actualiza automáticamente `condominos_importacion`.

**Lógica y conexiones:** `/api/telefonia/modo` indica si el proveedor telefónico está habilitado; `/configuracion` puede responder 503 si faltan parámetros. La búsqueda del conmutador usa `/api/busqueda/conmutador*` y su fuente de contacto importada, con permisos para Seguridad/Administración/Mesa Directiva. El portal no tiene por sí mismo un FXO ni acredita llamada a Telmex: se requiere motor SIP/conexión externa y prueba de audio bidireccional.

**Prueba adicional de conexión:** consultar modo deshabilitado, configurado y mal configurado; buscar teléfono existente en `condominos_importacion` y otro solo en el padrón nuevo. Registrar cada ausencia sin inventar contactos; si se habilita, medir marcado, contestación y cierre con un número de prueba, nunca real sin consentimiento.

1. Consultar `/api/telefonia/modo` y `/configuracion` en staging; con integración apagada mostrar estado claro.
2. Buscar residente ficticio existente en la fuente correcta; verificar caso donde existe en `condominos` pero no en importación.
3. Con proveedor de prueba, comprobar enlace, fallo de llamada, privacidad, permisos y respuesta sin marcar éxito antes del proveedor.

### A22. Conexión / integraciones

**Hace:** gestiona parámetros de integración en `configuraciones_conexion`, además de variables de entorno privadas para servicios. **No hace:** guardar claves de TomTom/Google en el frontend como secretos seguros ni levantar una integración sin servicio.

**Lógica y conexiones:** `/api/conexion` controla lectura/estado y edición restringida de configuración persistida; las claves de TomTom, correo, HLS y ZKTeco dependen de variables del servidor. Los endpoints de cada proveedor (`/api/entorno`, `/api/telefonia`, `/api/camaras`, `/api/zkteco`) son los que realmente ejercen la integración. Una variable presente **no certifica** permisos de API, respuesta de proveedor, red saliente ni comunicación con hardware.

**Prueba adicional de conexión:** validar lectura sin revelar secretos completos, escritura solo por administración y reconexión tras actualizar configuración; simular token inválido, cuota excedida y timeout externo, verificando mensaje seguro y que no se almacena clave privada en `docs/assets/js` o almacenamiento local.

1. Verificar vista/configuración disponible según rol; nunca exponer valores de secretos por GET público.
2. Probar errores sin red, credencial revocada, 429 y timeout; registrar estado sin filtrar tokens en logs.

### A23. Búsqueda general, calles y navegación

**Hace:** busca viviendas, residentes y actividad según rol y catálogos de calle. **No hace:** dar acceso a resultados restringidos mediante parámetros modificados.

**Lógica y conexiones:** `/api/busqueda` consulta fuentes de viviendas/residentes con filtros y permisos, mientras `docs/assets/js/global-search.js` muestra resultados y navega al módulo autorizado; `/api/busqueda/conmutador*` tiene reglas adicionales para personal de caseta. La nomenclatura de calles pasa por normalización y el filtro de viviendas visibles, pero ocultar un domicilio del listado **no borra su historia** en `direcciones`/pagos/C3.

**Prueba adicional de conexión:** buscar Gardenias 5 con variantes de acento y espacios, número parcial, y después Guadalajara 707 frente a otros números ocultos. Cambiar el rol y repetir consulta tanto en UI como con `fetch` directo; verificar que no se filtran nombres/teléfonos de otra casa a Condóminos.

1. Buscar casa con variantes de acento, espacios, Av.; verificar orden numérico y exclusión de viviendas de prueba cuando corresponda.
2. Con rol Condómino comprobar solo resultados permitidos; con Admin los permitidos de administración; probar cadenas maliciosas y paginación.
3. Revisar menú lateral, notificaciones, navegación de retorno y accesibilidad en móvil.

### A24. Control de plumas y cámaras (integraciones de Seguridad)

**Hace:** ofrece un comando autenticado para abrir/cerrar salidas del C3 y rutas de configuración/diagnóstico/transmisión HLS de cámaras. **No hace:** abrir automáticamente la pluma al crear una visita, demostrar con un HTTP 200 que el motor cambió de posición, ni reproducir RTSP Dahua sin puente RTSP→HLS. El visor de cámaras fue retirado de la vista principal de Seguridad; la API preparada puede seguir existiendo sin visor visible.

**Lógica y conexiones:** `POST /api/zkteco/pluma` acepta `accion:ABRIR|CERRAR` para roles de operación, llama `operateGate()` por TCP y controla salidas `ZKTECO_GATE_OPEN_OUTPUTS`/`ZKTECO_GATE_CLOSE_OUTPUTS` (por defecto 1 y 2) y pulso; el cierre envía duración cero. `/api/camaras` consulta canales/configuración, `/diagnostico` prueba respuesta del puente y `/stream/:channel/:asset` requiere enlace firmado temporal. Las cámaras **no** se graban en `accesos_seguridad` por el simple hecho de visualizar; los accesos de Seguridad son otro módulo.

1. En simulador, enviar ABRIR y CERRAR con operador autorizado y comprobar salida, duración, respuesta y bitácora; desde Condómino esperar 403. Probar acción inválida: 400.
2. En **piloto físico autorizado**, confirmar con personal en caseta el relé y la posición real de la pluma antes de declarar éxito. No disparar aperturas en producción como prueba sin coordinación.
3. Con cámaras deshabilitadas, `/api/camaras` debe indicar `configured:false`; no mostrar miniatura/video inventados. Simular túnel cerrado, credencial errónea y gateway que responde HTML.
4. Con gateway de staging, comprobar playlist HLS y segmentos con ticket válido, vencido y manipulado; el cliente no debe recibir URL privada RTSP ni credenciales Dahua.
5. Crear visita/QR y revisar que la pluma no se abra sola ni se genere acceso sin registro del guardia; comparar tablero operativo de Seguridad con visitas/accesos reales de prueba.

## 3. Matriz transversal de TAGs y deuda

| Situación financiera (casa) | Reserva Casa club | TAG si bloqueo por adeudos está activo | Prueba negativa imprescindible |
| --- | --- | --- | --- |
| Sin deuda exigible | Puede solicitar | No se bloquea por deuda; bloqueos físicos previos requieren revisión | Comprobar permisos físicos antes de declarar habilitado |
| Mantenimiento del mes actual hasta el día 10 | El módulo Casa club puede exigir saldo cero incluso antes del vencimiento | No se bloquea antes del vencimiento | Revisar esta diferencia de reglas de negocio |
| Mantenimiento impago a partir del 11 | No puede solicitar | Bloquear cada TAG activo de la vivienda | $50 solo desde el 11; no cobrar dos veces |
| Proyecto extraordinario iniciado, cargo no pagado | No puede solicitar | Bloquear | Proyecto futuro no bloquea; comprobante pendiente no equivale a validado |
| Reserva propia aprobada, plazo aún abierto | Depende de la deuda total de la casa | No bloquear antes del límite | Verificar renta/depósito/limpieza |
| Casa club plazo vencido sin pago ni comprobante oportuno | Fecha se libera cuando se procesa expiración | Bloquear solo mientras siga aprobada y exigible | Al CANCELARSE deja de ser deuda; no auto-habilitar |
| Casa club comprobante entregado en plazo, esperando revisión | La reserva no se cancela por demora administrativa | No bloquear por ese comprobante en revisión | Un comprobante fraudulento puede ser rechazado y reabrir deuda |

**Operación manual:** el monitor desactiva autorizaciones y no reautoriza por sí solo. **El administrador sí puede rehabilitar un TAG aunque existan adeudos**. La edición directa de vigencia vuelve a marcar `bloqueado=false` en el espejo SQL, pero esa marca **no acredita** que las puertas estén autorizadas físicamente. Un TAG rehabilitado manualmente sin pagar puede ser bloqueado de nuevo por el monitor en su siguiente barrido; no hay exención permanente.

**Activación gradual, sin writes masivos:**

```dotenv
# 1. Observación (no toca físicamente el C3):
ZKTECO_ADEUDOS_ENABLED=true
ZKTECO_ADEUDOS_CASA_IDS=ID_DE_CASA_PILOTO
ZKTECO_ADEUDOS_DRY_RUN=true
# 2. SOLO en piloto físico autorizado, tras cotejar consultas SQL y C3:
ZKTECO_DRY_RUN=false
ZKTECO_ADEUDOS_DRY_RUN=false
ZKTECO_ADEUDOS_MAX_TAGS=1
# 3. Solo tras confirmar padrón oficial de 231 y aprobar despliegue general:
# ZKTECO_ADEUDOS_GLOBAL_CONFIRMADO=CONFIRMO_231
# ZKTECO_ADEUDOS_MS=900000
```

El primer ciclo empieza **15 minutos después del arranque** por defecto; el modo global valida `padronOficial()` antes de escribir y el proceso nunca excede **10 TAGs** por ciclo, aun si se configura más. Mantener `ZKTECO_ADEUDOS_GLOBAL_CONFIRMADO` vacío hasta aprobación explícita. Reiniciar backend tras cambiar variables. Un error de base/C3 deja el ciclo en error sin tratar una lectura fallida como «sin deuda».

## 4. Auditoría de integración: pagos, Casa club y ZKTeco (19/10/2026)

**Alcance de la afirmación «sí está conectado»:** la integración **existe y sus funciones principales se pueden seguir en el código**; hay pruebas unitarias con C3/MySQL simulados para varias reglas. **No está certificado que las tres fuentes de pago bloqueen y rehabiliten físicamente TAGs de extremo a extremo**: el monitor está desactivado de forma predeterminada, no hay rehabilitación automática por liquidar deudas y se encontraron las brechas F01–F05. No se hicieron escrituras a C3, cambios SQL ni modificaciones de código en esta auditoría.

### 4.1 Qué se conecta con qué, y qué efecto físico se espera

| Origen o acción | Estado financiero en MySQL | Bloqueo físico por adeudo | Cambio de vigencia física (`EndTime`) | Desbloqueo físico automático |
| --- | --- | --- | --- | --- |
| Mantenimiento reportado, **sin validar** | Comprobante `PENDIENTE_VALIDACION`; no sustituye confirmación bancaria | La deuda exigible sigue presente | **No** | **No** |
| Mantenimiento **validado** por administración | Actualiza cuotas/recargos y registra movimiento en `pagos_acceso_c3` y sus TAGs | La deuda cubierta deja de contar en el próximo cálculo, si quedó correctamente conciliada | **Sí**, por meses completos de $300 de principal; movimiento serializado, idempotente y sujeto a lectura/verificación C3 | **No**: solo escribe fechas, conserva las autorizaciones actuales |
| Mantenimiento **manual** desde Análisis de cuotas | `cuotas`, movimiento de pago y un evento C3 por lote | Igual que un mantenimiento confirmado | **Sí**, escribe el día 10 del mes objetivo para todos los TAGs asociados, sujeto a conciliación | **No** |
| Extraordinaria reportada, **sin validar** | Cargo en `EN_REVISION`; no se considera PAGADO | Sigue siendo exigible desde el mes del cargo | **No** | **No** |
| Extraordinaria **validada** o **manual** | `pagos_reportados` validado o `pagos_manuales_concepto`; `estadoCargos()` indica `PAGADO` | Deja de motivar nuevos bloqueos cuando esa casa no tenga otra deuda exigible | **No** (correcto: no compra mantenimiento) | **No** (F01) |
| Casa club **PENDIENTE** de aprobación | No genera cargo | **No** por esa solicitud | **No** | **No** |
| Casa club **APROBADA**, no pagada, antes del límite | Reserva en `reservas_casa_club`, desglose renta + depósito + limpieza | **No todavía**; después del vencimiento solo mientras continúe aprobada (F02) | **No** | **No** |
| Casa club: comprobante oportuno **en revisión** | Reserva aprobada, `EN_REVISION`; no se registra como pagada hasta validar | No bloquear por ese comprobante mientras espera revisión | **No** | **No** |
| Casa club: comprobante **validado**, pago **manual** o registro `PAGO` del administrador | Reserva `pagado=true`; pago ligado a reserva | Sale del adeudo; no causa nuevos bloqueos por esa reserva | **No** | **No** (F01) |
| Casa club aprobada, sin comprobante, **plazo vencido** | La reserva se cancela cuando se ejecuta `expirarReservas()` y la fecha se libera | Solo sería exigible para el monitor **antes** de esa cancelación (F02) | **No** | **No** |
| Bloqueo manual de TAG/vivienda | No altera cuotas ni saldos | **Sí**, retira la autorización física de puerta por `Pin` en `userauthorize`, verifica y marca `zk_tarjetas.bloqueado=true` | **No** | No aplica |
| Activación manual de TAG/vivienda | **No** consulta ni exige saldo cero | **Sí**, restaura autorización de puerta y verifica; un monitor activo puede bloquear otra vez | Conserva o restaura la fecha aplicable; **si EndTime ya venció, habilitar permisos no prorroga vigencia** | Es una intervención **manual** |
| Edición dedicada de fecha final | No paga deudas ni las condona | **No** modifica permisos de puerta | **Sí**, actualiza `EndTime` tras verificar C3 | **No**; la ruta por TAG puede dejar desalineada la marca SQL (F03) |

**Ruta de datos comprobada leyendo el código:**

1. `pagos.controller.js`, `pagos-manuales-analisis.controller.js`, `casa-club.controller.js` y `cargos-extraordinarios.service.js` escriben o resuelven pagos de cada concepto. Las extraordinarias se originan en egresos `CUOTA_EXTRAORDINARIA`, repartidos en centavos entre **231 casas** según padrón confirmado.
2. `adeudos-comunidad.service.js → consultarAdeudos(casaId)` consulta `cuotas`, cargos extraordinarios y reservas Casa club aprobadas/no pagadas; genera `tipos.MANTENIMIENTO`, `tipos.EXTRAORDINARIO`, `tipos.CASA_CLUB`. Este servicio alimenta **tanto** alertas/deudas como la regla que impide solicitar o aprobar Casa club con saldo pendiente.
3. `zkteco-adeudos.service.js → adeudosExigibles()` usa esos mismos tres arreglos, pero sus **fechas de exigibilidad son distintas de la regla estricta de Casa club**: mantenimiento desde el **11**; extraordinarias desde el **mes del cargo**; Casa club desde el **día posterior al plazo de pago** sin comprobante en revisión. `run()` selecciona TAGs activos no bloqueados de casas permitidas, luego `setCardBlocked(id,true)` retira la autorización física. **No hay llamada inversa** `setCardBlocked(id,false)` al quedar la casa al corriente.
4. Solo la validación de **mantenimiento** invoca `vigencia-mantenimiento.service.js → actualizar()` o `registrarLoteManual()`, crea `pagos_acceso_c3` y `pagos_acceso_tags_c3` y pide a `zkteco-vigencias.service.js` aplicar las fechas al controlador. Las validaciones y pagos manuales de **extraordinarias/Casa club** no crean ese diario ni deben extender EndTime.
5. `zkteco-direct.service.js` trata separadamente las dos condiciones físicas de acceso: **fecha `EndTime` aún válida** en `user` **y autorización de puerta** en `userauthorize`. Una fecha futura con autorización eliminada **sigue sin habilitar el paso**. `zkteco-autosync.service.js` lee el C3 y actualiza el espejo SQL, sin desbloquear físicamente.

### 4.2 Pruebas ZKTeco integradas que hay que completar

Ejecutar Z01–Z18 solo con **casas/TAGs ficticios de staging** y un simulador; para piloto físico se necesita autorización explícita del responsable del C3. Registrar fecha/hora de México, roles, número de TAG anonimizado, `user.EndTime`, `userauthorize.AuthorizeDoorId`/existencia, `zk_tarjetas.bloqueado`, saldos de los tres conceptos, respuesta HTTP y evento C3 cuando exista. Una prueba de interfaz o con mocks **no sustituye** comprobar el lector/portón físico.

| Caso | Secuencia de prueba | Resultado correcto / qué comprobar |
| --- | --- | --- |
| **Z01 Inventario** | Leer `/api/zkteco/tarjetas`, diagnóstico de vivienda, ejecutar autosync. | Solo lectura física; reflejo en `zk_tarjetas`; no modificar permisos ni EndTime; no borrar estados ante error de conexión. |
| **Z02 Bloqueo TAG** | Administrador/Mesa Directiva bloquea un TAG activo. | `userauthorize` ausente o sin puerta, `bloqueado=true`, mismo `Pin`, `CardNo` y EndTime. |
| **Z03 Desbloqueo TAG** | Reactivar manualmente con deuda de cada uno de los **3 conceptos**. | Debe permitir la acción sin veto financiero; verificar permiso real de puerta. Si EndTime está vencido, sigue sin acceso efectivo hasta corregir fecha. |
| **Z04 Toda la casa** | Casa con 2–3 TAGs: bloquear y habilitar todos; provocar fallo en el segundo. | Verificar **cada TAG**: la operación no es transacción física atómica; puede quedar parcialmente aplicada y debe informar fallidos. |
| **Z05 Fecha por TAG** | Bloquear físicamente el TAG y cambiar la fecha por `/tarjetas/:id/vigencia`. | EndTime cambia, permiso sigue ausente; comparar SQL `bloqueado` versus lectura física (F03). |
| **Z06 Fecha por vivienda** | Cambiar fecha de la casa por `/viviendas/:id/vigencia-tags` con múltiples TAGs y uno bloqueado. | Cambian fechas de todos los que respondan, sin reautorizar puertas; si alguno falla, HTTP **207**, detalle por TAG y conciliación manual. |
| **Z07 Edición general** | Editar vivienda/datos de TAG manteniendo tarjeta igual; enviar `fechaFin` hipotética en la ficha general. | `editTag()` **no actualiza EndTime por esta vía**; usar endpoint dedicado. Reportar como diferencia funcional/expectativa (F04). |
| **Z08 Alta/reasignación** | Dar de alta, añadir existente y reasignar TAG de vivienda con deuda; comprobar fecha explícita de alta. | Acción administrativa permitida sin veto financiero; no copiar pagos históricos ni prometer extensión automática; monitor puede bloquear luego. |
| **Z09 Mantenimiento pendiente** | Subir comprobante de $300, sin aprobar, con deuda vencida. | Ningún evento de acceso aplicado ni reactivación; si monitor habilitado, la casa sigue elegible para bloqueo. |
| **Z10 Mantenimiento aprobado** | Aprobar $300 netos; incluir TAG autorizado y otro previamente bloqueado; leer diario y C3. | Cada TAG avanza un mes físico y se preserva el estado de `userauthorize`: el autorizado sigue autorizado, el bloqueado sigue bloqueado (F01). Reintentar sin duplicar mes. |
| **Z11 Mantenimiento manual** | Registrar 2 mensualidades desde Análisis; repetir/conciliar una referencia. | Un lote `pagos_acceso_c3`, fecha final **día 10 del mes seleccionado** para todos los TAGs; no levantar bloqueos anteriores ni duplicar cargos. |
| **Z12 Extraordinaria** | Crear proyecto de 231 casas en 2 meses; dejar cargo actual impago, activar piloto del monitor y luego validar pago. | Solo casa/cargo exigible se bloquea; pago confirmado elimina motivo de bloqueo **en nuevos barridos**, **no** reautoriza TAG ya bloqueado (F01). Sin eventos de extensión C3. |
| **Z13 Extraordinaria futura** | Cargo cuyo período empieza el mes siguiente, sin otros adeudos. | No bloquear por él antes de iniciar su período; sí impedir reserva solo cuando `consultarAdeudos()` lo incluya como exigible. |
| **Z14 Casa club pendiente/aprobada** | Solicitar, aprobar con renta/depósito/limpieza y plazo futuro; consultar deuda. | Solicitud pendiente sin cargo; aprobada con desglose, prohibición de nuevas reservas por saldo; sin bloqueo físico antes del plazo, aun si la reserva ya aparece como deuda. |
| **Z15 Casa club vencida** | Vencer fecha de pago sin subir comprobante, ejecutar primero barrido simulado y después consulta a Casa club. | Antes de expirar puede motivar bloqueo; al invocar `expirarReservas()`, reserva pasa a CANCELADA y desaparece el adeudo; **no se rehabilita** TAG bloqueado (F02). |
| **Z16 Comprobante club** | Subir dentro del plazo; dejar en revisión; validar o rechazar desde Pagos. | Mientras está en revisión no se cancela por demora administrativa ni bloquea por club; validación deja `pagado=true`; rechazo requiere evaluar si la reserva ya venció y se libera. Ningún cambio EndTime. |
| **Z17 Concurrencia/errores** | C3 desconectado, lectura parcial, dos pagos simultáneos, reintentos de eventos `ERROR`/`CONFLICTO`. | No extender sin confirmar C3, no duplicar meses ni eliminar permisos; aprobación financiera queda auditada aunque la operación física esté pendiente. |
| **Z18 Monitor seguro** | Probar `INACTIVO`, `SIN_ALCANCE`, `SIMULACION` y piloto de 1 TAG (solo en C3 de pruebas). | Requiere `ENABLED=true`, lista de casas o confirmación global, y **ambos** `DRY_RUN=false` para escribir; no más de 10 TAGs/ciclo; jamás activar global sin padrón verificado. |

### 4.3 Problemas / diferencias lógicas detectadas — registrar en acta

| ID | Severidad | Hallazgo verificado en código y consecuencia | Prueba/decisión pendiente |
| --- | --- | --- | --- |
| **F01** | **Alta** | El monitor **solo bloquea**. Tras saldar mantenimiento, extraordinarias o Casa club, no existe rehabilitación automática del permiso en `userauthorize`. El pago de mantenimiento **sí** puede adelantar EndTime, pero conserva la autorización ausente si el TAG estaba bloqueado. Resultado posible: **saldo cero y TAG todavía inactivo**, hasta activación manual. | Z03, Z10, Z12, Z16: definir política de desbloqueo sin anular bloqueos manuales; hoy no marcar «integración completa de rehabilitación». |
| **F02** | **Alta** | El cargo de Casa club que acaba de vencer se cancela al ejecutar `expirarReservas()` desde endpoints de Casa club; esta función **no corre por cron independiente**. Como `consultarAdeudos()` solo incluye reservas `APROBADA` y no pagadas, después de la cancelación el monitor deja de ver esa deuda. Según orden de solicitudes/barrido, puede bloquearla temporalmente o **nunca llegar a bloquearla**. | Z15: revisar si el objetivo es cancelar sin deuda o mantener una obligación exigible; no prometer bloqueo sostenido por club impago. |
| **F03** | **Alta** | `actualizarVigencia()` de **un TAG** escribe la fecha en `user` sin crear permiso de puerta, pero después hace `zk_tarjetas.update({bloqueado:false,fechaFinOriginal:null})` **incondicionalmente**. Un TAG físicamente bloqueado puede aparecer habilitado en SQL/UI y la discrepancia afecta la selección del monitor hasta nueva reconciliación. | Z05: cotejar `userauthorize` y `zk_tarjetas` inmediatamente y tras auto-sync; la fecha no debe usarse como prueba de acceso. |
| **F04** | **Media** | Los **2 casos** de `backend/test/zkteco-vigencias.test.js` que usan `direct.editTag(...,{fechaFin:'2026-11-10'})` fallan: esperan EndTime `20261110` pero permanece `20260910`. El método de edición general deliberadamente no cambia EndTime; los endpoints dedicados sí lo hacen. Es una **expectativa de test/flujo diferente**, sin afirmar que editar una fecha desde la acción dedicada falle. | Z05–Z07: aclarar en interfaz cuál acción modifica vigencia; ajustar pruebas o implementación en PR separado, **no** en este documento. |
| **F05** | **Media** | `registrarPagoConcepto()` manual y la acción administrativa `PAGO` de Casa club verifican aprobación y saldo, **pero no exigen fecha límite de pago vigente**; en cambio subir comprobante por Pagos sí la exige. Si una reserva vencida sigue `APROBADA` porque nadie invocó `expirarReservas()`, un registro manual tardío puede marcarla pagada. | Agregar caso C3-club-tardío: simular plazo vencido, sin consultar endpoints Casa club, intentar pago manual; contrastar resultado con regla de cancelación. |
| **F06** | **Media** | La solicitud de Casa club consulta adeudos **antes de comprobar** la membresía de la vivienda pedida; un usuario ajeno que envíe otro `casaId` podría recibir un 409 con importe de adeudo en lugar de 403 cuando esa casa deba dinero. No modifica un TAG, pero sí expone un dato financiero a un usuario sin vínculo. | Caso seguridad C3-privacidad: deuda en vivienda ajena y `POST /api/casa-club/reservas`; esperar denegación sin importe. |
| **F07** | **Media** | Calendario filtra por `visibilidad` al leer, pero `crearEvento()` fuerza `visibilidad:'TODOS'` para todo evento nuevo. La API tiene GET/POST/DELETE, **no PATCH** de edición. Por tanto no se puede probar creación individual `SOLO_CASA`/`SEGURIDAD` ni edición como funcionalidad terminada, aunque las columnas soporten esas categorías. | A17: crear evento y leer `calendario`; usar fixtures preexistentes para probar filtros y dejar alta de visibilidad especial/edición como pendiente funcional. |

**Diferencias intencionales, no errores por sí mismas:** (a) Casa club impide reservar con **cualquier saldo** calculado, incluido mantenimiento del mes antes del día 11; el bloqueo C3 requiere deuda **exigible**. (b) Un administrador puede desbloquear, crear y reasignar TAGs aun con deuda; si el monitor se activó puede volver a bloquear, pues no existe exención manual permanente. (c) Un TAG con fecha final **expirada** y permiso autorizado puede seguir sin abrir la puerta. (d) Pago confirmado con resultado `SIN_TAGS` requiere conciliación manual: un TAG dado de alta después no recibe pagos anteriores por sí solo.

### 4.4 Pruebas automatizadas ejecutadas y alcance real

Ejecutadas el **19/10/2026** con Node y `DB_PORT=3306` de prueba, **sin conexión a MySQL/C3 reales**. Resultado de 7 archivos de prueba relevantes:

| Archivo | Resultado | Evidencia que aporta / límite |
| --- | --- | --- |
| `backend/test/zkteco-adeudos.test.js` | **PASA** | Tres reglas de exigibilidad, flags de seguridad y activación manual sin veto financiero mediante mocks. |
| `backend/test/pagos-acceso-c3.test.js` | **PASA** | Validación de mantenimiento, abonos, eventos y escritura de EndTime con dispositivo simulado. |
| `backend/test/analisis-tres-conceptos.test.js` | **PASA** | Separación de ingresos/adeudos en tres conceptos, con datos simulados. |
| `backend/test/cuotas-extraordinarias-casa-club-202610.test.js` | **PASA** | Reparto de 231 casas y comprobación estática de enlaces de interfaz. |
| `backend/test/casa-club.test.js` | **PASA** | Solicitud, autorización de vivienda y deuda de mantenimiento con tablas simuladas. |
| `backend/test/zkteco-autosync.test.js` | **PASA** | Autosync de inventario de solo lectura. |
| `backend/test/zkteco-vigencias.test.js` | **7 PASAN / 2 FALLAN** | Los fallos F04 corresponden a expectativas de `editTag`/EndTime. Las 7 que pasan verifican preservación de permisos y detección de cambios C3 simulados. |

**Interpretación:** 6 archivos pasan y 1 tiene 2 fallos identificados. La primera ejecución sin `DB_PORT` no pudo arrancar algunos archivos por faltar esa variable en el entorno local; al proporcionarla avanzaron todos los archivos. Ninguna de estas pruebas confirma que el lector físico abra, que Hostinger tenga activado el monitor o que existan las columnas/datos reales correctos. **Estado E2E C3 + tres pagos + Casa club: PENDIENTE**, casos Z01–Z18 sin ejecución física documentada. El objetivo de este archivo es que Administración pueda reproducir y cerrar los hallazgos antes de aprobar el despliegue.

## 5. Flujos completos de aceptación entre secciones

Estos flujos conectan módulos que por separado pueden parecer correctos. Ejecutarlos **en este orden**, primero con datos simulados, luego MySQL de staging y solo al final con piloto físico autorizado. Un resultado en «pendiente» no significa «falló»; significa que no existe evidencia de esa etapa.

### FTI-01. Alta de condómino → sesión → vivienda → deuda → ZKTeco

**Precondición:** vivienda A con usuario de prueba, TAG físico simulado y saldo de mantenimiento al corriente; vivienda B con saldo vencido. **Conexiones:** A01 → A05/A06 → A04 → A02 → A08 → A14.

1. Registrar/aceptar y aprobar al condómino de A; confirmar `usuarios.estatus`, sesión con `sesion_version` y `usuarios_casas` activo. Antes de aprobar, login debe fallar.
2. Marcar «Mantener sesión», cerrar el navegador y regresar; el token de 90 días solo debe reabrir si sigue vigente y no fue revocado. Cambiar contraseña/revocar y comprobar que la sesión invalidada no entra.
3. Vincular B también; alternar vivienda activa y verificar `/api/pagos/adeudos` y tarjetas de Inicio independientes. La deuda pertenece a `casa_id`, nunca al nombre de usuario.
4. En B, dejar mantenimiento impago después del 10, monitor **en simulación** y revisar detección. En piloto autorizado, pasar a escritura controlada y observar `userauthorize` ausente; verificar que A no fue tocada.
5. Validar un pago de mantenimiento de B y comprobar el evento `pagos_acceso_c3`, `EndTime` nuevo y deuda financiera cubierta. **No marcar acceso restaurado** si `userauthorize` sigue ausente: requiere activación manual actualmente (F01).
6. Auditar comprobantes y cuenta de B desde otra sesión de A sin vínculo: 403/404 y sin fuga de datos.

### FTI-02. Egreso extraordinario → 231 cargos → Pagos → análisis → bloqueo

**Precondición:** padrón oficial de staging de exactamente 231 viviendas y 2 casas de prueba dentro de él. **Conexiones:** A13 → A09 → A02 → A11 → A14.

1. Registrar egreso `CUOTA_EXTRAORDINARIA` por importe divisible entre 231, con 2 meses. En la misma transacción deben quedar egreso, `cuotas_extraordinarias` y **462 cargos** con importes en centavos cuya suma iguala el gasto.
2. Consultar cuota y adeudo desde dos viviendas: deben mostrar el mes actual, cargo futuro separado y deuda correcta. Un cargo con `periodo` futuro no dispara bloqueo antes de su mes.
3. Intentar solicitar Casa club con cargo exigible: 409 por adeudo, sin reservar la fecha. Probar que otro usuario de casa distinta no ve el comprobante de la primera.
4. Reportar comprobante del mes actual de casa A; durante `PENDIENTE_VALIDACION` la casa sigue pendiente; validar y comprobar `estadoCargos='PAGADO'`, saldo actualizado en Análisis y ausencia de incremento en `pagos_acceso_c3`.
5. Ejecutar piloto de monitor sobre casa B con el cargo impago; confirmar que puede bloquear su TAG y no la casa A. Luego pagar B: el adeudo desaparece, **pero no se reautoriza automáticamente** el TAG si ya quedó bloqueado (F01).
6. Probar proyecto duplicado, padrón de 230/232, reparto con residuo y fallos a mitad de inserción: la transacción no debe dejar medio proyecto.

### FTI-03. Casa club → calendario → comprobante → caducidad → ZKTeco

**Precondición:** casa A sin ninguna deuda exigible, fecha libre y administrador de prueba. **Conexiones:** A11 → A10 → A08/A09 → A13 → A14.

1. Consultar calendario, solicitar fecha en casa A, verificar `PENDIENTE` y rechazo 409 para segunda casa que pide la misma fecha. Antes de aprobación no aparece cargo de renta en Pagos.
2. Aprobar asignando renta, depósito, limpieza opcional y límite de pago anterior al evento. A ve desglose en Casa club y tercera pestaña de Pagos; consultar `reservas_casa_club` y `/api/pagos/adeudos` para cotejar suma.
3. Antes del límite, subir comprobante: reserva sigue `APROBADA`, comprobante `PENDIENTE_VALIDACION`, y en monitor C3 queda exenta por estar en revisión de pago oportuno. Validar para pasar a `pagado=true`; **no** se modifica EndTime.
4. Repetir con otra reserva sin comprobante: al vencer el plazo, ejecutar primero monitor simulado, luego GET de calendario de Casa club; `expirarReservas()` cancela y libera la fecha. Comprobar si la deuda desapareció antes de que el barrido físico la detectara (F02).
5. Intentar pago manual fuera de plazo **sin invocar antes** ninguna ruta Casa club: puede aceptarse pese a plazo vencido (F05), por lo que documentar ese resultado como incidencia y no como aprobación del flujo esperado.
6. Crear nuevo apartado después de cancelación y comprobar que los usuarios vuelven a ver la fecha libre. Un TAG bloqueado antes de la cancelación no se desbloquea solo.

### FTI-04. Registro en caseta → visitas/QR → tablero → pluma/cámaras

**Precondición:** rol SEGURIDAD autenticado, vivienda y visitante ficticios. **Conexiones:** A16 → A15 → A02 → A24.

1. Condómino crea visita y código; comprobar `visitas_programadas` y alcance por vivienda, y que no se cree TAG ni permiso C3.
2. Seguridad consulta visitas del día, registra entrada/salida con transiciones correctas y registra acceso en `accesos_seguridad`; el dashboard operativo debe actualizar contadores y dejar de mostrar como activo al marcar salida.
3. Seguridad consulta cuota limitada pero no accede a análisis financiero global, datos bancarios ni edición de TAGs.
4. En simulador, pulsar ABRIR/CERRAR pluma: verificar comando TCP y resultado, **no posición física**. En piloto aprobado, observar posición real con caseta.
5. Configurar gateway HLS solo en staging, probar lista de cámaras y ticket de transmisión, luego apagarlo y comprobar mensajes seguros; no confundir acceso visible con video operativo de producción.

### FTI-05. Comunidad y comunicaciones → persistencia real o local

**Conexiones:** A17/A18/A19/A20 → A21/A22/A23.

1. Crear un evento público en Calendario, recargar y comprobar persistencia en `calendario`; lectura por visibilidad con fixtures especiales. Una reserva de Casa club el mismo día **no** debe aparecer como evento público automático.
2. Crear anuncio y reporte local; comprobar persistencia tras recargar **el mismo navegador** y ausencia en otro dispositivo. Documentar que no se notificó a Administración ni se guardó en MySQL.
3. Buscar la misma vivienda desde buscador general, conmutador y padrón: anotar fuente y permisos de cada uno. Un teléfono actualizado en `condominos` puede no actualizar `condominos_importacion`.
4. Suspender servicio de noticias, TomTom, telefonía y cámaras por separado; cada sección debe mostrar error/vacío sin comprometer acceso a las demás. No incluir claves ni números privados en evidencia.

### FTI-06. Matriz móvil y permisos para todo el portal

**Conexiones:** A01–A24, `permissions.js` y middleware de backend.

1. Para cada rol (`SUPER_ADMIN`, `ADMINISTRADOR`, `MESA_DIRECTIVA`, `SEGURIDAD`, `CONDOMINO`), abrir desde menú todas las pantallas que le corresponden; pegar las URLs restringidas en otra pestaña y repetir petición API directa para detectar permisos exclusivamente visuales.
2. En 320, 360, 375, 390, 430 y 768 px revisar tres pestañas de Pagos/Análisis **horizontales** sin romper textos, modales de deuda legibles, tabla que permita scroll vertical hasta el último registro, acciones de TAG/fecha y calendario de Casa club.
3. Probar iOS Safari nativo y Android Chrome: selector de mes/año, zoom de comprobante, botón X del modal, panel Noticias/Tráfico sin texto invertido ni noticias cortadas, foco y teclado.
4. Repetir con conexión 3G simulada, 401 caducado, 403 por rol, 409 de conflicto, 429 del proveedor, 502 C3/externo y 503 MySQL. No prometer operación completada ante respuestas ambiguas.

### Registro mínimo por flujo (para cerrar una prueba de verdad)

| Evidencia obligatoria | Ejemplo de qué guardar sin datos reales |
| --- | --- |
| Identidad y alcance | Rol, `casa_id` ficticio, navegador, zona horaria México, commit/versión desplegada |
| Petición y estado | Ruta, método, `status`, antes/después SQL con identificadores anonimizados |
| Cambio financiero | Monto, periodo, recargo, tipo de pago, estado `PENDIENTE`/`VALIDADO`/`RECHAZADO`/manual |
| Cambio C3 | `Pin`/`CardNo` anonimizados, `user.EndTime`, autorización de puerta, estado del diario, resultado físico solo si fue autorizado |
| Seguridad y regresión | 403/409 esperados, no fuga de PII, no duplicados ni cambios a viviendas ajenas |
| Cierre | **PASA**, **FALLA** o **NO EJECUTADO**, capturas sin secretos, responsable y fecha de revalidación |

## 6. Criterios de aceptación / pendientes conocidos

- **PASAR:** cada flujo A01–A24 y FTI-01–FTI-06 con rol correcto, petición rechazada al rol incorrecto, móvil sin cortes, SQL y UI conciliados, sin referencias duplicadas. Registrar la evidencia de campo «PASA» solo si se verificó el entorno donde opera.
- **BLOQUEANTE:** resultados bancarios no validados considerados pagos, diferencia de 231 casas, corte/recargo incorrecto, bloqueo automático no aplicado en vivienda del piloto cuando está activado y autorizado, TAG autorizado involuntariamente por un proceso automático o escritura C3 al leer inventario o deuda. Para afirmar que la **integración de los tres conceptos con ZKTeco está completa**, también deben resolverse/aceptarse expresamente F01–F03 y verificarse Z01–Z18 en staging/piloto.
- **Limitaciones reales del código:** anuncios/reportes usan almacenamiento local; noticias/tráfico y telefonía dependen de proveedores/configuración; Calendario solo crea eventos públicos y no edita por API (F07); Casa club cancela reservas expiradas cuando se invocan operaciones que ejecutan `expirarReservas()`, no por un cron autónomo; cámaras HLS necesitan puente y la pluma requiere comprobación física; base MySQL no certificada contra producción en esta revisión.
- **No ejecutado aquí:** pruebas end-to-end con Hostinger/MySQL/C3 reales, visual en dispositivos físicos, correo real, WhatsApp, bancos y cobertura 100% de APIs. Registrar esas evidencias antes de aprobar activación global.

Pruebas automatizadas relevantes: `backend/test/zkteco-adeudos.test.js`, `backend/test/pagos-acceso-c3.test.js`, `backend/test/recargos-mantenimiento.test.js`, `backend/test/cuotas-extraordinarias-casa-club-202610.test.js`, `backend/test/analisis-tres-conceptos.test.js`, `backend/test/casa-club.test.js`, `backend/test/recordar-sesion.test.js`, `backend/test/auth-permissions.test.js`, `backend/test/noticias-locales.test.js`, `backend/test/zkteco-autosync.test.js`, `backend/test/zkteco-vigencias.test.js`; interfaz en `tests/`.
