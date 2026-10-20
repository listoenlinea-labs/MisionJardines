# Auto-users: prerregistro, invitación por correo e inicio de sesión

## Flujo vigente

Auto-users es exclusivo de SUPER_ADMIN y ADMINISTRADOR, tanto en menú como en API. No sustituye el registro público manual ni modifica pagos o TAGs. Cada condómino del padrón tiene como máximo una cuenta vinculada mediante `usuarios.condomino_id` único.

**Crear usuarios** pide confirmación Sí/No y recorre condóminos por lotes de 20. Conserva cuentas vinculadas y crea únicamente faltantes: estado PENDIENTE, cuenta_aceptada=false, contraseña aleatoria desconocida guardada como hash y un vínculo inactivo por cada vivienda activa de `condominos_viviendas`. El usuario inicial usa el correo registrado; sin correo usa teléfono y, si coincide, concatena nombre sin espacios o ID para evitar colisión. Coincidencias ambiguas de identidad/correo no se vinculan automáticamente; se muestran para revisión. Un correo mal capturado se corrige antes de crear.

**Mandar invitación** pide confirmación Sí/No y envía por **SMTP**, individualmente, a las cuentas de condóminos PENDIENTES y no aceptadas. El navegador recorre lotes de una cuenta; mantener la página abierta hasta terminar. Los envíos individuales usan el mismo remitente. No se utiliza WhatsApp Business, Meta, plantillas ni códigos QR. El envío masivo omite las cuentas de prueba. Las cuentas ya aceptadas, correos inválidos y reportes de corrección abiertos no reciben correo. El botón **Enviar** de una fila permite a Administración enviar una invitación individual, también a una cuenta de prueba pendiente.

Cada correo incluye nombre, domicilio y enlace personal `aceptar-cuenta.html#invitacion=…`. El token aleatorio de 256 bits dura 14 días, se almacena solo como SHA-256 y se consume al aceptar. Un reenvío reemplaza el enlace anterior. El token no viaja como query string ni se guarda en almacenamiento del navegador. Estado ENVIADO significa que SMTP aceptó el destinatario; no acredita entrega ni lectura. No hay reintento automático del envío SMTP, para evitar duplicados ante una respuesta incierta. Un fallo se registra y puede revisarse/reintentarse desde Administración.

## Configuración

El remitente utiliza el mismo servicio SMTP del proyecto:

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL` obligatorias.
- `SMTP_SECURE` según el proveedor y puerto; `SMTP_FROM_NAME` opcional.
- `AUTO_USERS_FRONTEND_URL` o `FRONTEND_APP_URL`: raíz pública HTTPS del portal, sin credenciales, parámetros o fragmentos. Si faltan ambas, se usa `https://listoenlinea-labs.github.io/MisionJardines`.

No se necesitan variables WHATSAPP_*. Validar remitente, límites de envío y recepción con el proveedor SMTP antes del envío completo. Esta implementación no certifica la configuración real del servidor.

## Inicio de sesión con usuario o correo

El login muestra **Usuario o correo electrónico** y **Contraseña** desde el inicio. Al enviar, consulta directamente `/api/auth/login`, sin descubrir cuentas por teléfono, ocultar la contraseña ni redirigir a otro formulario según un número. Conserva los nombres de usuario numéricos existentes como identificadores exactos; no busca en la columna de teléfono.

Los prerregistros PENDIENTES/no aceptados no pueden autenticarse: deben abrir su enlace personal recibido por correo y completar la aceptación. Administración puede reenviar el correo desde Auto-users. Las rutas públicas `/acceso/telefono` y `/acceso/enviar` se retiraron. El registro manual y sus alertas administrativas permanecen disponibles mediante **Crear cuenta**.

## Solicitudes y alertas para Administración

### Compatibilidad con sesiones y avisos actuales

El acceso por usuario o correo conserva «Mantener sesión iniciada»: al marcarlo, el servidor emite la sesión de 90 días y el navegador usa localStorage; sin marcarlo usa sessionStorage y el vencimiento corto configurado (8 horas por defecto). Nunca se guarda la contraseña. Al volver al login se valida el token guardado con `/api/auth/perfil` y se usa el rol devuelto por el servidor antes de entrar. Un 401/403 elimina esa sesión; una falla de red la conserva. Una respuesta tardía de una sesión anterior no reemplaza ni elimina una cuenta que acaba de autenticarse.

El menú conserva simultáneamente avisos de adeudos de Inicio/Pagos, solicitudes pendientes de Casa Club y solicitudes de cuentas. Los avisos administrativos mantienen sus permisos y los adeudos conservan el contexto de vivienda seleccionada.

Una solicitud del formulario queda en `solicitudes_cuenta`, con usuario PENDIENTE, vivienda declarada y datos de contacto; requiere revisión en **Verificación de cuentas**. La aprobación exige identidad verificada, rol autorizado y vivienda real cuando corresponda. La solicitud no concede acceso por sí misma.

El menú lateral muestra el número de solicitudes pendientes solo a administradores. Consulta una vez por carga de página, sin temporizador. Auto-users muestra una sección **Alertas: solicitudes de cuenta**, con resumen de la primera página y enlace a la revisión completa. La aprobación/rechazo usa las validaciones existentes del servidor. No se genera una cuenta aceptada automáticamente por coincidencia de teléfono o correo.

## Aceptación y reporte

Con enlace válido se muestran las calles y números de todas las viviendas activas como texto sombreado, sin inputs editables. El usuario puede editar correo y nombre de usuario, y definir/confirmar contraseña (8 caracteres, mayúscula, minúscula y número; máximo 72 bytes bcrypt).

Crear cuenta primero comprueba el formato y disponibilidad del correo/usuario, la coincidencia de contraseñas y los requisitos de contraseña (incluido el máximo de 72 bytes). Los errores se muestran en el formulario principal. La consulta pública `/invitacion/validar` requiere enlace vigente, comparte su límite de peticiones y no guarda contraseñas, activa cuentas ni consume el enlace. Un correo vacío sigue siendo opcional.

Solo con datos válidos se abre la segunda confirmación, titulada «Introduce SOLO tu numero de casa». NO cierra el panel; Confirmar exige escribir el número de cada vivienda del prerregistro; el servidor exige el conjunto completo, sin IDs extra ni repetidos. Si cambian las credenciales durante la consulta o antes de confirmar, se pide validarlas de nuevo. La aceptación vuelve a comprobar las credenciales, disponibilidad y enlace para cubrir cambios concurrentes o llamadas directas a la API. En transacción se establece cuenta_aceptada=true/ACTIVO, activa exclusivamente los vínculos confirmados, invalida el enlace y devuelve la sesión para entrar a Inicio. El enlace no puede aceptarse dos veces. Inicio está permitido para Condómino; Seguridad conserva sus restricciones.

Reportar error requiere comentario y revoca el enlace. Administración ve los reportes paginados, corrige nombre/vivienda/contacto/usuario, y envía un nuevo correo. Con reporte abierto no se reenvía. Nunca cambiar solo estatus para saltarse la aceptación.

## Prueba individual y comprobación SMTP

La sección de pruebas crea un único condómino ficticio y una cuenta pendiente en una vivienda dedicada a pruebas (calle contiene Prueba o número empieza TEST-). No selecciona IDs constantes. Usa correo example.com y no inventa teléfono. Se marca internamente como AUTO_USERS_PRUEBA y queda excluida de los envíos masivos y de cualquier reenvío por teléfono, incluso después de editarla o de un envío individual.

Para comprobar SMTP sin invitar a los residentes: editar la cuenta de prueba pendiente, registrar un correo propio accesible y usar **Enviar** en su fila de **Cuentas de condóminos**. Esa ruta administrativa selecciona una sola cuenta y autoriza explícitamente incluir la prueba; no basta agregar una opción al cuerpo de una petición masiva. Mantiene los controles de vivienda de prueba, correo válido, reporte abierto y aceptación. ENVIADO indica aceptación del proveedor; revisar entrada/spam y abrir en incógnito el enlace recibido para completar la prueba. El reenvío reemplaza el enlace anterior. No requiere cambios SQL ni borrar/recrear la cuenta pendiente.

Crear cuenta de prueba es idempotente por clave de pestaña guardada en sessionStorage; no duplica la cuenta al repetir dentro de esa pestaña. Generar enlace sin enviar solo devuelve un enlace privado al administrador y no requiere SMTP; abrirlo en incógnito conserva la sesión administrativa. Cada generación revoca el enlace anterior. Tras aceptar, el enlace ya no puede regenerarse.

La tabla Usuarios de prueba guardados consulta pendientes/aceptadas, IDs, nombre, vivienda, usuario/correo/teléfono, invitación y fechas. Ver/editar modifica perfil, condómino y vínculo, conserva aceptación/rol/contraseña y revoca sesiones/enlaces anteriores. Solo permite viviendas de pruebas. Cuentas manuales sin marca interna no aparecen ni se pueden editar/borrar como pruebas.

Borrar abre panel propio con ID y confirmación explícita. En transacción elimina reportes, invitación, vínculos, cuenta y condómino ficticio; conserva la vivienda. Bloquea historial en otros módulos, roles incompatibles, otra cuenta para el condómino y referencias FK. La comprobación consulta tablas/columnas físicas y únicamente campos de referencia para tolerar módulos opcionales o esquemas heredados. Nunca borra pagos/historial externo como atajo. Ante error se revierte todo.

No/escape cancela; errores y progreso permanecen visibles. El timeout no confirma un fallo del servidor: actualizar la tabla antes de reintentar. DELETE confirmado con fallo posterior al refrescar se distingue de borrado fallido. Para repetir aceptación de una prueba ya aceptada, borrar y crear otra prueba. Estos registros sí persisten en DB; la vivienda debe usarse exclusivamente para pruebas.

## API y despliegue

- Públicas: POST `/api/auto-users/invitacion/consultar`, `/invitacion/validar`, `/invitacion/aceptar`, `/invitacion/reportar`.
- Administrativas: GET raíz/config/viviendas, POST crear/invitaciones/:id/invitacion, PATCH :id y las rutas prueba/usuarios, prueba/viviendas, prueba/crear, prueba/:id/enlace, PATCH/DELETE prueba/:id.
- La API de login acepta `nombreUsuario` o `correo` junto con `contrasena`; un teléfono por sí solo no es una credencial de acceso. El formulario de solicitud sigue usando `/api/auth/registro/solicitar` y la revisión `/api/auth/cuentas`.

Actualizar frontend y backend juntos. Requiere la tabla `condominos_viviendas` ya creada y poblada antes del despliegue. Ver [relaciones del padrón](CONDOMINOS_VIVIENDAS.md). No afecta el servicio de correo de recibos, invitaciones de vivienda ni verificación de cambio de correo. Las pruebas usan SMTP/DB simulados; no prueban entrega real ni aprobación de producción.
