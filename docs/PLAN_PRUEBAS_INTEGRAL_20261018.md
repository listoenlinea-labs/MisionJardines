# Plan integral de pruebas funcionales — Misión Jardines

Revisión del código del **18 de octubre de 2026**. Alcance: páginas de `docs/`, API de `backend/src/app.js`, modelos, servicios y pruebas en `backend/test/`. Este documento es un **guion de aceptación**, no un certificado de que Hostinger, MySQL, correo, TomTom o el C3-200 funcionen hoy: para afirmarlo hay que ejecutar y registrar los casos en un entorno real autorizado.

## 1. Preparación y reglas de ejecución

1. Probar primero en **staging** con copia anonimizada y un C3 de pruebas o simulador. No crear cargos, cambiar fechas ni deshabilitar TAGs del fraccionamiento para ensayar casos.
2. Crear usuarios de prueba `SUPER_ADMIN`, `ADMINISTRADOR`, `MESA_DIRECTIVA`, `SEGURIDAD` y `CONDOMINO`; una vivienda sin deuda, otra con mantenimiento vencido, otra con cuota extraordinaria exigible y otra con reserva de Casa club aprobada/no pagada. Un administrador también debe estar vinculado a una vivienda: no eximirlo por su rol del cobro.
3. Confirmar con las consultas del [mapa SQL](MAPA_SQL_POR_MODULO_20261018.md) las tablas, índices, vínculos y **padrón real**. La cifra contractual para repartir extraordinarias es **231**; un listado más grande no equivale al padrón oficial.
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

1. Registrar una cuenta de prueba; solicitar/verificar código y revisar estados previos a su autorización. No debe habilitarse antes de ser aprobada.
2. Iniciar sesión con contraseña correcta, incorrecta y cuenta suspendida; esperar redirección correcta o 401/403 sin revelar si existe el usuario.
3. Marcar «Mantener sesión iniciada», cerrar pestaña y navegador, reabrir y comprobar autenticación válida; repetir sin marcarla y tras caducidad/revocación. La opción no debe saltarse expiración o cierre forzoso.
4. Abrir rutas de administrador como condómino, tanto desde la interfaz como enviando peticiones API: esperar 403; una URL pegada no es autorización.
5. Verificar en móvil, pestaña privada y cambio de contraseña: no reutilizar una sesión invalidada.

### A02. Inicio y tablero (`index.html`)

**Hace:** muestra KPIs, actividad, avisos de adeudos por vivienda y panel de noticias/tráfico. **No hace:** conciliar depósitos ni actualizar el acceso físico desde una tarjeta informativa.

1. Abrir como condómino sin deuda, condómino con cada deuda y administrador con vivienda vinculada: cotejar burbujas, total y enlace a Pagos por concepto.
2. Verificar que las tarjetas de noticias inician a la izquierda y tráfico a la derecha, y que el componente se puede voltear y volver sin texto invertido.
3. Buscar noticias por término, ordenar por fecha, revisar relevancia de Zapopan/Guadalajara y cercanías; descartar resultados de otras ciudades y publicaciones mayores de siete días cuando la fuente publique fecha válida.
4. En tráfico, verificar consulta TomTom con `language=es`, teselas y mensaje legible ante 400/429/timeout; no atribuir colores a segmentos sin datos.
5. Revisar scroll completo y tarjetas responsivas sin cortar últimas noticias; comprobar vacío y error externo sin bloquear todo Inicio.

### A03. Mi cuenta (`cuenta.html`)

**Hace:** muestra/edita perfil, contraseña, cambio de correo verificado y solicitudes de rol. **No hace:** reasignar automáticamente vivienda o modificar el padrón de residentes.

1. Consultar datos de la cuenta, editar datos permitidos, recargar y constatar persistencia.
2. Cambiar contraseña y verificar que el secreto anterior no funciona; cambio de correo debe requerir código y no poder usarse antes de validarlo.
3. Solicitar rol, revisar como administrador; comprobar que no existe escalamiento por un payload manipulado.

### A04. Mis viviendas (`viviendas.html`, `invitacion.html`)

**Hace:** vincula cuentas a viviendas mediante `usuarios_casas`, gestiona miembros/responsables e invitaciones. **No hace:** alterar por ello deudas, pagos, TAGs ni registros `condominos`.

1. Vincular una cuenta a dos viviendas; cambiar la vivienda activa y constatar que Pagos consulta el `casa_id` seleccionado.
2. Invitar, aceptar, caducar, revocar y reintentar una invitación; prevenir tokens repetidos y vínculos duplicados.
3. Eliminar vínculo de un miembro; comprobar que pierde acceso a datos de la vivienda, sin borrar su historial financiero ni al residente del padrón.

### A05. Verificación de cuentas (`verificacion-cuentas.html`)

**Hace:** aprobar, rechazar, revocar y asignar rol/vivienda a cuentas. **No hace:** confirmar pagos ni autorizar permisos físicos del C3.

1. Crear solicitudes PENDIENTES; aprobar y revisar `usuarios.estatus`, `usuarios_casas` y `historial_vinculos`.
2. Rechazar/revocar, intentar acceso con token anterior y verificar invalidación de sesión (`sesion_version`).
3. Repetir operaciones desde usuario no administrador: 403. Confirmar que altas no crean casas duplicadas.

### A06. Auto-users y aceptación (`auto-users.html`, `aceptar-cuenta.html`)

**Hace:** genera prerregistros, prepara invitaciones, permite consulta/reporte/aceptación con token válido; pruebas individuales. **No hace:** garantizar envío WhatsApp si no está configurada la integración, ni habilitar por defecto un prerregistro sin aceptación.

1. Seleccionar lote pequeño de staging; crear dos veces (idempotencia), revisar `auto_users_invitaciones` y estados sin publicar hashes.
2. Probar envío individual con canal configurado, token vencido, sustituido, usado dos veces y reporte de datos incorrectos.
3. Aceptar una vez: usuario ACTIVO, rol CONDOMINO, vivienda correcta; intentar aceptación con token gastado: rechazo.
4. Editar/borrar **solo** cuenta de prueba identificada con confirmación; comprobar ausencia de afectación a cuentas reales.

### A07. Residentes / padrón (`bases_datos.html` y gestión de residentes)

**Hace:** consultar viviendas, gestionar datos de `condominos`, contacto y renta. **No hace:** crear automáticamente contraseña/cuenta, cambiar fecha C3 ni extinguir adeudos al cambiar de inquilino.

1. Buscar vivienda por calle y número con acentos/«Av.»; comparar contra padrón oficial y lista de exclusiones.
2. Crear residente ficticio; editar teléfono/correo/contacto; sustituir inquilino según edición soportada y revisar que no se multiplica el ID.
3. Comprobar cuotas, TAGs y pagos invariantes tras la edición; confirmar permisos de edición solo a administración.

### A08. Pagos — Mantenimiento (`pagos.html`, primera pestaña)

**Hace:** cotiza desde la fecha **física** de los TAGs C3, reporta comprobantes con OCR, abonos, validación administrativa, recibos y diario de avance C3. **No hace:** aprobar automáticamente un comprobante ni tomar la fecha de una tabla heredada como vigencia física.

1. Elegir casa, leer TODOS sus TAGs y la misma fecha final. Si no hay TAG, la lectura falla, las fechas difieren o existe pago en C3 pendiente, detener cotización con error explicativo.
2. Verificar $300/mes, vencimiento día 10 inclusive, recargo $50 por corte vencido no pagado; contrastar casos numéricos de `AGENTS.md`.
3. Reportar imagen legible; confirmar OCR **de servidor**: destino, fecha, hora, folio y monto. Dato ilegible o discrepante detiene reporte. No subir información bancaria real al entorno de pruebas.
4. Revisar como administrador: antes `PENDIENTE_VALIDACION`, después `VALIDADO`/`RECHAZADO`, recibo si procede; recargar y comprobar que no se confirmó dos veces.
5. Abono de $300 con recargo de $50: $250 de principal, 0 meses; complemento nuevo de $50 validado debe completar el mes sin recobrar el corte.
6. Duplicar referencia bancaria: error/idempotencia; simular falla TCP **solo en ambiente de pruebas** y comprobar diario ERROR/CONFLICTO, reintento sin duplicar extensión.
7. Administrador dueño también debe su cuota; prueba negativa: extraordinaria o Casa club no incrementan vigencia.

### A09. Pagos — Cuota extraordinaria (`pagos.html`, segunda pestaña)

**Hace:** presenta cargos mensuales por proyecto/vivienda, acepta comprobante o registro manual, valida cobros, refleja adeudo independiente. **No hace:** aumentar meses de mantenimiento o desbloquear por sí sola el C3.

1. Crear en staging egreso categoría `CUOTA_EXTRAORDINARIA`; seleccionar 1–36 meses y primer mes válido; confirmar reparto exacto de centavos entre **231 viviendas**, sin duplicar cargos por mes.
2. Como dos viviendas distintas, verificar cargos distintos cuando corresponda residuo, suma total igual al egreso y cuota mensual por período.
3. Reportar comprobante; observar `PENDIENTE_VALIDACION`, aprobar y actualizar solo cargo indicado. Rechazar y reintentar otro folio.
4. Registrar pago manual con categoría correcta en Análisis; comprobar `pagos_manuales_concepto` y que el cargo pasa a PAGADO sin nuevo evento C3.
5. Probar egreso sin padrón reconciliado, fechas inválidas y repetición de `egreso_id`: no emitir cuotas incompletas o duplicadas.

### A10. Pagos — Casa club (`pagos.html`, tercera pestaña)

**Hace:** muestra renta, depósito y limpieza opcional de una reserva aprobada; recibe comprobante y conciliación. **No hace:** cobrar una reserva PENDIENTE como si estuviera aprobada ni conceder meses de mantenimiento.

1. Crear solicitud pendiente desde Casa club; comprobar que no aparece un cargo exigible antes de aprobación.
2. Aprobar con renta, depósito, limpieza y `fecha_limite_pago`; revisar desglose exacto y que solo la casa solicitante ve su deuda.
3. Subir comprobante ANTES de fecha límite; permanece en revisión hasta aprobación. Confirmación debe marcar reserva pagada; verificar no repetición del cobro.
4. Sin comprobante oportuno, al expirar liberar día y marcar reserva CANCELADA; con comprobante oportuno aún sin validar, NO cancelar por demora del administrador.
5. Comprobar en móvil tres pestañas visibles en una línea horizontal con desplazamiento horizontal si no caben, sin superponer títulos.

### A11. Casa club — Calendario y administración (`casa-club.html`)

**Hace:** permite solicitar fecha disponible, mostrar PENDIENTE, aprobar/rechazar, asignar fecha límite y costo, cancelar por falta de pago. **No hace:** marcar APARTADO una solicitud PENDIENTE ni permitir reservar con cualquier adeudo detectado por `consultarAdeudos`.

1. Sin adeudos, solicitar fecha y revisar ficha (nombre, casa, teléfono, fecha); debe quedar PENDIENTE para solicitante y terceros.
2. Intentar segunda solicitud del mismo día por otra casa: conflicto por fecha única; otra fecha sí puede solicitarse.
3. Con deuda en cada uno de los 3 conceptos: POST `/api/casa-club/reservas` devuelve 409; probar también como administrador vinculado a vivienda deudora.
4. Aprobar: exigir fecha límite anterior a evento y >= hoy, desglosar montos y dejar fecha ocupada; rechazar/cancelar: liberar.
5. Expiración: simular reloj en staging; comprobar regla de comprobante oportuno indicada en A10.

### A12. Cuotas (`cuotas.html`)

**Hace:** consulta/gestiona mensualidades por vivienda y estado de pago, según permisos. **No hace:** convertir un cambio de estado UI en escritura física inmediata ni saltar conciliación de C3.

1. Filtrar vivienda, mes, año y pagados/pendientes; cotejar con `cuotas` y desglose por $300/recargo.
2. Registrar o confirmar cuota desde rol autorizado, revisar folio y diario C3; rechazo/devolución no deben retroceder automáticamente EndTime.
3. Probar 403 en ediciones desde Condómino y Seguridad; recargar en móvil sin pérdida de filtros.

### A13. Análisis de cuotas / finanzas (`analisis-cuotas.html`)

**Hace:** consolida ingresos/egresos, tres pestañas por concepto, quién pagó/quién debe, gráfica de Casa club y pagos administrativos. **No hace:** asumir que todos los egresos son cargos a casas ni inferir por SQL una vigencia física.

1. Abrir Mantenimiento, Extraordinarias y Casa club; cada tabla debe conservar filtros, orden, acciones y columnas Estado/Pagado/Último mes pagado/Saldo pendiente con SU concepto.
2. Con cargos cero, Extraordinarias y Casa club deben mostrar saldo cero; añadir un cargo único de staging y comprobar solo la fila afectada (o las 231 en proyecto repartido).
3. Registrar pago manual con selector Mantenimiento / Extraordinaria / Casa club; verificar tabla de destino, folio único y ninguna imputación cruzada.
4. Crear egreso «Cuota extraordinaria» y plan de mensualidades; confirmar no duplicación ni proyecto al guardar dos veces.
5. Comparar barra Casa club contra pagos **validados** o manuales, nunca contra depósitos sin revisar; inspeccionar tablas/gráficas/scroll en móvil.

### A14. ZKTeco / TAGs / portones (`zkteco.html`)

**Hace:** refleja inventario físico C3, vincula TAGs a `direcciones`, permite operaciones físicas verificadas y bloqueos, aplica incrementos de mantenimiento desde diario. **No hace:** convertir una fila SQL en lectura física confiable, ni autorizar un TAG solo por editarle fecha.

1. Diagnosticar presencia de TAG y autorizaciones en `user`/`userauthorize` vía API; simular lectura parcial sin marcar todos los TAGs como ausentes.
2. Comprobar que auto-sync cada 60s por defecto **solo lee**; recuperación de pagos cada 5 min no aplica fechas heredadas.
3. Probar bloqueo manual de un TAG y de una vivienda con varios TAGs en C3 de pruebas; verificar `userauthorize` y `zk_tarjetas.bloqueado` tras lectura. No borrar PIN/fechas/perfil de puertas.
4. Por cada deuda exigible (Mantenimiento vencido desde día 11; Extraordinaria período iniciado; Casa club aprobada y plazo vencido sin comprobante en revisión), probar **monitor de adeudos**: simulación sin escritura, piloto con ID explícito y escritura autorizada, lectura posterior sin autorización. Repetir: TAG ya bloqueado no vuelve a procesarse.
5. Aun con deuda, comprobar que el administrador puede **habilitar manualmente**, emitir y reasignar TAGs sin veto financiero. Confirmar la autorización física resultante. Si el monitor de adeudos está habilitado, podrá **volver a bloquear** el TAG en el siguiente barrido; esta acción manual no crea una exención permanente.
6. Fallos parciales C3: registrar TAG fallido, continuar máximo `ZKTECO_ADEUDOS_MAX_TAGS` por vuelta, conservar autorización/fecha si hubo error; inspeccionar respuesta y bitácora sin secretos.
7. Una reserva cancelada por expiración deja de ser deuda de Casa club; el monitor no reautoriza por sí solo. Administración puede reactivar el TAG manualmente.
8. Al editar directamente la vigencia del TAG, comprobar que se restaura el comportamiento previo de la ficha SQL (`bloqueado=false`, `fecha_fin_original=NULL`) y verificar **por separado** la autorización física, pues actualizar EndTime no garantiza que exista `userauthorize`.

### A15. Seguridad y registro (`seguridad.html`)

**Hace:** registra entradas/salidas de visitas, paquetería y transporte; puede consultar estados de cuota permitidos. **No hace:** alterar historial bancario ni controlar TAGs por deducción de un panel visual.

1. Con rol Seguridad registrar acceso con vivienda/placas y salida; comprobar dos marcas temporales y usuario responsable.
2. Buscar visita válida/expirada, verificar autorización y datos mínimos; probar duplicación de salida y bloqueo de rutas de administración.
3. Consultar información de cuotas mostrada a Seguridad sin permitir ver comprobantes bancarios ajenos ni editar saldos.

### A16. Visitas y QR (`visitas.html`)

**Hace:** programa visitas con código único y marca entrada/salida; cancela según rol. **No hace:** abrir el C3 al crear una visita ni reemplazar la validación de guardia.

1. Crear visita para propia vivienda, comprobar código, rango, fecha y estado PROGRAMADA; no permitir usar otra casa no vinculada.
2. Registrar entrada/salida desde Seguridad; comprobar EN_CURSO/FINALIZADA y fechas persistidas; rechazar segundo uso inválido.
3. Cancelar antes del evento, verificar no reutilización de QR; capturar comportamiento de vencimiento.

### A17. Calendario comunitario (`calendario.html`)

**Hace:** crea/muestra eventos de `calendario` por visibilidad y rol. **No hace:** administrar reservas de Casa club (tienen tabla y calendario distintos) ni usar automáticamente la tabla histórica `eventos`.

1. Crear evento con fecha y visibilidad TODOS/SOLO_CASA/SEGURIDAD/ADMINISTRACION; abrir con cada rol y comprobar filtrado en backend.
2. Editar/cancelar evento con permisos y comprobar que no aparece activo; verificar zonas horarias y eventos que cruzan medianoche.

### A18. Anuncios (`anuncios.html`)

**Hace:** administra anuncios **locales del navegador**. **No hace:** sincronizarlos a MySQL ni a otros equipos (implementación actual usa `localStorage`).

1. Crear, editar, borrar anuncio de prueba; recargar en el mismo navegador y comprobar persistencia local.
2. Abrir otra sesión/dispositivo: no prometer la misma lista; revisar mensaje de limitación y manejo de localStorage vacío/bloqueado.

### A19. Reportes y detalle (`reportes.html`, `reporte.html`)

**Hace:** captura/consulta tickets locales en `localStorage`. **No hace:** persistirlos en base central ni notificar automáticamente a administración.

1. Crear reporte, editar estado/abrir detalle y recargar en ese equipo; probar filtros y adjuntos si la UI los permite.
2. Abrir en segundo dispositivo: registrar limitación de no sincronización, sin afirmar que hubo recepción central.

### A20. Directorio y mapa (`directorio.html`, `mapa.html`)

**Hace:** muestra puntos/contactos definidos en las páginas y cartografía. **No hace:** mantener un catálogo editable central de direcciones/establecimientos en MySQL.

1. Verificar enlaces, búsqueda/listado, coordenadas, datos visibles a roles y permisos de ubicación.
2. Probar dispositivo sin geolocalización, conexión lenta, zoom móvil y proveedor de mapa sin API key.

### A21. Conmutador / telefonía (`conmutador.html`)

**Hace:** expone modo y configuración de la integración telefónica; la búsqueda de teléfonos usa una tabla heredada de importación. **No hace:** garantizar llamadas o mensajes WhatsApp si el motor externo está deshabilitado; alta en `condominos` no actualiza automáticamente `condominos_importacion`.

1. Consultar `/api/telefonia/modo` y `/configuracion` en staging; con integración apagada mostrar estado claro.
2. Buscar residente ficticio existente en la fuente correcta; verificar caso donde existe en `condominos` pero no en importación.
3. Con proveedor de prueba, comprobar enlace, fallo de llamada, privacidad, permisos y respuesta sin marcar éxito antes del proveedor.

### A22. Conexión / integraciones

**Hace:** gestiona parámetros de integración en `configuraciones_conexion`, además de variables de entorno privadas para servicios. **No hace:** guardar claves de TomTom/Google en el frontend como secretos seguros ni levantar una integración sin servicio.

1. Verificar vista/configuración disponible según rol; nunca exponer valores de secretos por GET público.
2. Probar errores sin red, credencial revocada, 429 y timeout; registrar estado sin filtrar tokens en logs.

### A23. Búsqueda general, calles y navegación

**Hace:** busca viviendas, residentes y actividad según rol y catálogos de calle. **No hace:** dar acceso a resultados restringidos mediante parámetros modificados.

1. Buscar casa con variantes de acento, espacios, Av.; verificar orden numérico y exclusión de viviendas de prueba cuando corresponda.
2. Con rol Condómino comprobar solo resultados permitidos; con Admin los permitidos de administración; probar cadenas maliciosas y paginación.
3. Revisar menú lateral, notificaciones, navegación de retorno y accesibilidad en móvil.

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

## 4. Criterios de aceptación / pendientes conocidos

- **PASAR:** cada flujo A01–A23 con rol correcto, petición rechazada al rol incorrecto, móvil sin cortes, SQL y UI conciliados, sin referencias duplicadas.
- **BLOQUEANTE:** resultados bancarios no validados considerados pagos, diferencia de 231 casas, corte/recargo incorrecto, bloqueo automático no aplicado en vivienda del piloto sin intervención manual, TAG autorizado involuntariamente por un proceso automático o escritura C3 al leer inventario o deuda.
- **Limitaciones reales del código:** anuncios/reportes usan almacenamiento local; noticias/tráfico y telefonía dependen de proveedores/configuración; Casa club cancela reservas expiradas cuando se invocan operaciones que ejecutan `expirarReservas()`, no por un cron autónomo; base MySQL no certificada contra producción en esta revisión.
- **No ejecutado aquí:** pruebas end-to-end con Hostinger/MySQL/C3 reales, visual en dispositivos físicos, correo real, WhatsApp, bancos y cobertura 100% de APIs. Registrar esas evidencias antes de aprobar activación global.

Pruebas automatizadas relevantes: `backend/test/zkteco-adeudos.test.js`, `backend/test/pagos-acceso-c3.test.js`, `backend/test/recargos-mantenimiento.test.js`, `backend/test/cuotas-extraordinarias-casa-club-202610.test.js`, `backend/test/analisis-tres-conceptos.test.js`, `backend/test/casa-club.test.js`, `backend/test/recordar-sesion.test.js`, `backend/test/auth-permissions.test.js`, `backend/test/noticias-locales.test.js`, `backend/test/zkteco-autosync.test.js`, `backend/test/zkteco-vigencias.test.js`; interfaz en `tests/`.
