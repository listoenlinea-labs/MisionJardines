# Plan integral de pruebas funcionales — Misión Jardines

Revisión inicial del código del **18 de octubre de 2026**; **auditoría adicional de pagos, Casa club y ZKTeco: 19 de octubre de 2026**. Alcance: páginas de `docs/`, API de `backend/src/app.js`, modelos, servicios y pruebas en `backend/test/`. Este documento es un **guion de aceptación**, no un certificado de que Hostinger, MySQL, correo, TomTom o el C3-200 funcionen hoy: para afirmarlo hay que ejecutar y registrar los casos en un entorno real autorizado. Los resultados de pruebas automatizadas mencionados abajo usan simulaciones, no el controlador de producción.

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
9. Distinguir **edición general de TAG** (`PATCH /api/zkteco/tarjetas/:id`, que no cambia EndTime si se mantiene el mismo número de tarjeta) de **edición dedicada de vigencia** (`PATCH /api/zkteco/tarjetas/:id/vigencia` o `PATCH /api/zkteco/viviendas/:id/vigencia-tags`, que sí escribe la fecha física). Probar explícitamente ambas rutas, con permiso de puerta presente y ausente.

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

## 5. Criterios de aceptación / pendientes conocidos

- **PASAR:** cada flujo A01–A23 con rol correcto, petición rechazada al rol incorrecto, móvil sin cortes, SQL y UI conciliados, sin referencias duplicadas.
- **BLOQUEANTE:** resultados bancarios no validados considerados pagos, diferencia de 231 casas, corte/recargo incorrecto, bloqueo automático no aplicado en vivienda del piloto cuando está activado y autorizado, TAG autorizado involuntariamente por un proceso automático o escritura C3 al leer inventario o deuda. Para afirmar que la **integración de los tres conceptos con ZKTeco está completa**, también deben resolverse/aceptarse expresamente F01–F03 y verificarse Z01–Z18 en staging/piloto.
- **Limitaciones reales del código:** anuncios/reportes usan almacenamiento local; noticias/tráfico y telefonía dependen de proveedores/configuración; Casa club cancela reservas expiradas cuando se invocan operaciones que ejecutan `expirarReservas()`, no por un cron autónomo; base MySQL no certificada contra producción en esta revisión.
- **No ejecutado aquí:** pruebas end-to-end con Hostinger/MySQL/C3 reales, visual en dispositivos físicos, correo real, WhatsApp, bancos y cobertura 100% de APIs. Registrar esas evidencias antes de aprobar activación global.

Pruebas automatizadas relevantes: `backend/test/zkteco-adeudos.test.js`, `backend/test/pagos-acceso-c3.test.js`, `backend/test/recargos-mantenimiento.test.js`, `backend/test/cuotas-extraordinarias-casa-club-202610.test.js`, `backend/test/analisis-tres-conceptos.test.js`, `backend/test/casa-club.test.js`, `backend/test/recordar-sesion.test.js`, `backend/test/auth-permissions.test.js`, `backend/test/noticias-locales.test.js`, `backend/test/zkteco-autosync.test.js`, `backend/test/zkteco-vigencias.test.js`; interfaz en `tests/`.
