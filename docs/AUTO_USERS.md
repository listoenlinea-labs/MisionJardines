# Auto-users: prerregistro, invitación por correo y acceso por teléfono

## Flujo vigente

Auto-users es exclusivo de SUPER_ADMIN y ADMINISTRADOR, tanto en menú como en API. No sustituye el registro público manual ni modifica pagos o TAGs. Cada condómino del padrón tiene como máximo una cuenta vinculada mediante `usuarios.condomino_id` único.

**Crear usuarios** pide confirmación Sí/No y recorre condóminos por lotes de 20. Conserva cuentas vinculadas y crea únicamente faltantes: estado PENDIENTE, cuenta_aceptada=false, contraseña aleatoria desconocida guardada como hash y un vínculo inactivo por cada vivienda activa de `condominos_viviendas`. El usuario inicial usa el correo registrado; sin correo usa teléfono y, si coincide, concatena nombre sin espacios o ID para evitar colisión. Coincidencias ambiguas de identidad/correo no se vinculan automáticamente; se muestran para revisión. Un correo mal capturado se corrige antes de crear.

**Mandar invitación** pide confirmación Sí/No y envía por **SMTP**, individualmente, a las cuentas de condóminos PENDIENTES y no aceptadas. El navegador recorre lotes de una cuenta; mantener la página abierta hasta terminar. Los envíos individuales usan el mismo remitente. No se utiliza WhatsApp Business, Meta, plantillas ni códigos QR. Las cuentas de prueba, las ya aceptadas, correos inválidos y reportes de corrección abiertos no reciben correo.

Cada correo incluye nombre, domicilio y enlace personal `aceptar-cuenta.html#invitacion=…`. El token aleatorio de 256 bits dura 14 días, se almacena solo como SHA-256 y se consume al aceptar. Un reenvío reemplaza el enlace anterior. El token no viaja como query string ni se guarda en almacenamiento del navegador. Estado ENVIADO significa que SMTP aceptó el destinatario; no acredita entrega ni lectura. No hay reintento automático del envío SMTP, para evitar duplicados ante una respuesta incierta. Un fallo se registra y puede revisarse/reintentarse desde Administración.

## Configuración

El remitente utiliza el mismo servicio SMTP del proyecto:

- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL` obligatorias.
- `SMTP_SECURE` según el proveedor y puerto; `SMTP_FROM_NAME` opcional.
- `AUTO_USERS_FRONTEND_URL` o `FRONTEND_APP_URL`: raíz pública HTTPS del portal, sin credenciales, parámetros o fragmentos. Si faltan ambas, se usa `https://listoenlinea-labs.github.io/MisionJardines`.

No se necesitan variables WHATSAPP_*. Validar remitente, límites de envío y recepción con el proveedor SMTP antes del envío completo. Esta implementación no certifica la configuración real del servidor.

## Login por teléfono

El primer campo es el teléfono; **Continuar** consulta su estado sin recibir nombres, correo, vivienda ni token:

1. **Cuenta ACTIVA y aceptada:** aparece la contraseña. El servidor exige que coincida y vuelve a comprobar el estado actual antes de crear la sesión.
2. **Prerregistro PENDIENTE y no aceptado:** dirige a la misma página de aceptación. Allí se envía el enlace al correo ya registrado y se pide abrirlo para revisar datos y completar la cuenta. Conocer un teléfono no autoriza a ver/activar la vivienda de otra persona.
3. **Teléfono sin cuenta:** dirige a `registro.html` y precarga el teléfono. El formulario solicita nombre/apellidos, contacto, vivienda y contraseña; guarda una cuenta sin acceso y una solicitud PENDIENTE para revisión administrativa. No vincula ni activa una vivienda automáticamente. Al aprobar con identidad verificada, Administración crea el acceso autorizado.
4. **Teléfono compartido, cuenta bloqueada/baja/suspendida o solicitud ya pendiente:** indica revisión administrativa. No elige arbitrariamente una cuenta, no recupera contraseñas ni crea una solicitud repetida desde ese flujo.

**Usar usuario o correo** conserva acceso a administradores y cuentas antiguas que no tengan teléfono o compartan número. La normalización admite formatos mexicanos de 10 dígitos, +52 y prefijo histórico +521, además de números internacionales con lada; rechaza listas/extensiones. Se comparan teléfonos con expresiones ORM, no SQL interpolado.

La consulta pública tiene límite por IP de 20 peticiones cada 15 minutos y el envío desde login de 6. Un enlace enviado recientemente y válido se reutiliza: no se reenvía/rota por consulta pública durante cinco minutos. La página no devuelve el token por conocer el teléfono, ni permite indicar otro destinatario. Si falta correo, hay reporte abierto o el envío falla, debe intervenir Administración. Los envíos administrativos conservan reenvío explícito.

## Solicitudes y alertas para Administración

### Compatibilidad con sesiones y avisos actuales

El acceso por teléfono y el alternativo por usuario/correo conservan «Mantener sesión iniciada»: al marcarlo, el servidor emite la sesión de 90 días y el navegador usa localStorage; sin marcarlo usa sessionStorage y el vencimiento corto configurado (8 horas por defecto). Nunca se guarda la contraseña. Al volver al login se valida el token guardado con `/api/auth/perfil` y se usa el rol devuelto por el servidor antes de entrar. Un 401/403 elimina esa sesión; una falla de red la conserva. Una respuesta tardía de una sesión anterior no reemplaza ni elimina una cuenta que acaba de autenticarse.

El menú conserva simultáneamente avisos de adeudos de Inicio/Pagos, solicitudes pendientes de Casa Club y solicitudes de cuentas. Los avisos administrativos mantienen sus permisos y los adeudos conservan el contexto de vivienda seleccionada.

Una solicitud del formulario queda en `solicitudes_cuenta`, con usuario PENDIENTE, vivienda declarada y datos de contacto; requiere revisión en **Verificación de cuentas**. La aprobación exige identidad verificada, rol autorizado y vivienda real cuando corresponda. La solicitud no concede acceso por sí misma.

El menú lateral muestra el número de solicitudes pendientes solo a administradores. Consulta una vez por carga de página, sin temporizador. Auto-users muestra una sección **Alertas: solicitudes de cuenta**, con resumen de la primera página y enlace a la revisión completa. La aprobación/rechazo usa las validaciones existentes del servidor. No se genera una cuenta aceptada automáticamente por coincidencia de teléfono o correo.

## Aceptación y reporte

Con enlace válido se muestran las calles y números de todas las viviendas activas como texto sombreado, sin inputs editables. El usuario puede editar correo y nombre de usuario, y definir/confirmar contraseña (8 caracteres, mayúscula, minúscula y número; máximo 72 bytes bcrypt).

Crear cuenta abre una segunda confirmación de domicilio. NO cierra el panel; Confirmar exige escribir el número de cada vivienda del prerregistro; el servidor exige el conjunto completo, sin IDs extra ni repetidos. En transacción se establece cuenta_aceptada=true/ACTIVO, activa exclusivamente los vínculos confirmados, invalida el enlace y devuelve la sesión para entrar a Inicio. El enlace no puede aceptarse dos veces. Inicio está permitido para Condómino; Seguridad conserva sus restricciones.

Reportar error requiere comentario y revoca el enlace. Administración ve los reportes paginados, corrige nombre/vivienda/contacto/usuario, y envía un nuevo correo. Con reporte abierto no se reenvía. Nunca cambiar solo estatus para saltarse la aceptación.

## Prueba individual sin envío

La sección de pruebas crea un único condómino ficticio y una cuenta pendiente en una vivienda dedicada a pruebas (calle contiene Prueba o número empieza TEST-). No selecciona IDs constantes. Usa correo example.com y no inventa teléfono. Se marca internamente como AUTO_USERS_PRUEBA y queda excluida de todos los envíos de correo, incluso al editarla.

Crear cuenta de prueba es idempotente por clave de pestaña guardada en sessionStorage; no duplica la cuenta al repetir dentro de esa pestaña. Generar enlace sin enviar solo devuelve un enlace privado al administrador y no requiere SMTP; abrirlo en incógnito conserva la sesión administrativa. Cada generación revoca el enlace anterior. Tras aceptar, el enlace ya no puede regenerarse.

La tabla Usuarios de prueba guardados consulta pendientes/aceptadas, IDs, nombre, vivienda, usuario/correo/teléfono, invitación y fechas. Ver/editar modifica perfil, condómino y vínculo, conserva aceptación/rol/contraseña y revoca sesiones/enlaces anteriores. Solo permite viviendas de pruebas. Cuentas manuales sin marca interna no aparecen ni se pueden editar/borrar como pruebas.

Borrar abre panel propio con ID y confirmación explícita. En transacción elimina reportes, invitación, vínculos, cuenta y condómino ficticio; conserva la vivienda. Bloquea historial en otros módulos, roles incompatibles, otra cuenta para el condómino y referencias FK. La comprobación consulta tablas/columnas físicas y únicamente campos de referencia para tolerar módulos opcionales o esquemas heredados. Nunca borra pagos/historial externo como atajo. Ante error se revierte todo.

No/escape cancela; errores y progreso permanecen visibles. El timeout no confirma un fallo del servidor: actualizar la tabla antes de reintentar. DELETE confirmado con fallo posterior al refrescar se distingue de borrado fallido. Para repetir aceptación de una prueba ya aceptada, borrar y crear otra prueba. Estos registros sí persisten en DB; la vivienda debe usarse exclusivamente para pruebas.

## API y despliegue

- Públicas: POST `/api/auto-users/acceso/telefono`, `/acceso/enviar`, `/invitacion/consultar`, `/invitacion/aceptar`, `/invitacion/reportar`.
- Administrativas: GET raíz/config/viviendas, POST crear/invitaciones/:id/invitacion, PATCH :id y las rutas prueba/usuarios, prueba/viviendas, prueba/crear, prueba/:id/enlace, PATCH/DELETE prueba/:id.
- La API de login acepta `telefono` + `contrasena` o el identificador anterior + contraseña. El formulario de solicitud sigue usando `/api/auth/registro/solicitar` y la revisión `/api/auth/cuentas`.

Actualizar frontend y backend juntos. Requiere la tabla `condominos_viviendas` ya creada y poblada antes del despliegue. Ver [relaciones del padrón](CONDOMINOS_VIVIENDAS.md). No afecta el servicio de correo de recibos, invitaciones de vivienda ni verificación de cambio de correo. Las pruebas usan SMTP/DB simulados; no prueban entrega real ni aprobación de producción.
