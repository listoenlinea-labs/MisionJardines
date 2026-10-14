# Auto-users: prerregistro e invitaciones de condóminos

## Flujo

La página `auto-users.html`, en el menú Administración, solo admite SUPER_ADMIN
y ADMINISTRADOR. Sus API administrativas están protegidas por autenticación y
roles reales de MySQL, no por el rol guardado en el navegador.

1. **Crear usuarios** recorre condóminos por lotes de 20. Crea una cuenta PENDIENTE,
   `cuenta_aceptada=false`, vinculada al condómino y su vivienda. La contraseña
   inicial es aleatoria, desconocida y solo se guarda su hash. El vínculo de
   vivienda permanece inactivo hasta la aceptación.
2. El usuario inicial es el correo. Sin correo, usa el teléfono; si coincide,
   concatena el nombre sin espacios/acentos. Si también coincide el nombre, añade
   el ID de condómino. Si no hay ningún contacto, usa `condomino<ID>` y Administración
   debe corregir el teléfono antes de enviar. No se inventan correos.
3. Crear otra vez no duplica cuentas ni prerregistros: bloqueo por condómino y
   UNIQUE(condomino_id). Una cuenta activa existente se vincula únicamente si
   contacto, nombre, vivienda y rol Condómino coinciden. Coincidencias ambiguas,
   condóminos inactivos, correos inválidos o viviendas inexistentes se presentan
   como incidencias para revisión; no se fusionan personas por coincidencia de teléfono.
4. **Mandar invitación** envía por lotes de 5 exclusivamente a cuentas vinculadas,
   PENDIENTES y no aceptadas. **Enviar** hace lo mismo para una sola cuenta.
   Un reporte abierto bloquea su envío hasta corregirlo. Los resultados distinguen
   aceptación del mensaje por el proveedor, error y registro que requiere revisión.
5. Cada envío crea un enlace aleatorio de 256 bits, válido por 14 días, y reemplaza
   el anterior. Solo se guarda SHA-256 del token; el token viaja en el fragmento
   de la URL, no en parámetros de consulta. No se devuelve en listados ni logs.
6. `aceptar-cuenta.html` muestra calle/número como texto. E-mail (opcional), usuario,
   contraseña y confirmación son editables. Las advertencias rojas piden comprobar
   la vivienda; ambos botones principales tienen el mismo color.
7. **Crear cuenta** abre una segunda confirmación: **NO** vuelve al formulario;
   **Confirmar** exige escribir el número exacto de casa (incluidas letras/ceros).
   El servidor coteja el número contra la vivienda almacenada, ignora casa/rol
   enviados por el cliente, activa la cuenta y el vínculo, marca aceptada=true,
   consume el enlace y crea una sesión. Redirige a **Inicio**. Condóminos ahora
   tienen permiso de lectura de Inicio/dashboard; Seguridad sigue sin ese acceso.
   El landing habitual al iniciar sesión por el login sigue siendo Cuotas.
8. **Reportar error** guarda comentario y datos del prerregistro, invalida el
   enlace y muestra el acuse de revisión. Administración ve cuentas/reportes
   paginados (50), puede editar nombre, usuario, correo, teléfono y seleccionar una
   vivienda existente. La corrección cambia también el registro del condómino y
   conserva el reporte con estado CORREGIDO. Luego puede enviar individualmente
   o reenviar a todas las cuentas pendientes.

No se realizan cambios financieros, de recargos o fechas de TAGs. Este flujo es
distinto del registro público previo, que conserva aprobación administrativa.
No se deben aprobar estos prerregistros mediante SQL/cambio manual de estatus:
la autenticación verifica también `cuenta_aceptada`.

## Esquema y despliegue

`auto-users-schema.service.js` se ejecuta antes de las demás migraciones del
servidor. Añade a `usuarios`: `condomino_id` (único, FK a condominos con RESTRICT),
`nombre_usuario` (único) y `cuenta_aceptada` (true para cuentas existentes).
`correo` permite NULL sin quitar su unicidad. Crea `auto_users_invitaciones` y
`auto_users_reportes`. No altera contraseñas, roles ni estatus de cuentas antiguas.
El modelo y el login aceptan usuario **o** correo. Los formularios verifican colisiones de usuario/correo con identificadores de
otras cuentas. El login deniega identificadores ambiguos existentes en los datos,
en lugar de elegir una cuenta arbitrariamente.

Desplegar frontend y backend; validar la migración con un respaldo/copia del
MySQL real antes de producción. Las pruebas del PR usan almacenamiento simulado,
no certifican el esquema desplegado ni crean usuarios reales. El índice/FK evita
borrar físicamente un condómino vinculado sin resolver su cuenta.

## WhatsApp Business

No usa WhatsApp Web ni el agente de llamadas del conmutador. El envío automático
utiliza la API de Meta y una plantilla aprobada con **tres parámetros en el body**:
nombre, domicilio y enlace completo. Ejemplo de texto de plantilla:

> Hola {{1}}. Misión Jardines preparó tu cuenta para {{2}}. Revisa tu vivienda y
> completa tu cuenta en {{3}}.

Variables privadas del backend (no pegarlas en GitHub):

```dotenv
AUTO_USERS_FRONTEND_URL=https://TU_DOMINIO/RUTA_DEL_PORTAL
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_API_VERSION=
WHATSAPP_INVITACION_TEMPLATE=
WHATSAPP_TEMPLATE_LANGUAGE=es_MX
```

La URL es la raíz pública que contiene `aceptar-cuenta.html`, sin query ni fragmento.
La versión de Graph y el idioma deben corresponder a la configuración vigente
del remitente/plantilla. Sin configuración completa el botón informa el problema;
no finge envíos ni rota enlaces. Un timeout o rechazo queda como ERROR y permite
reintentar; ENVIADO solo indica que Meta aceptó el mensaje, no que llegó/se leyó.
Una cuenta aceptada ya no se selecciona para reenvío. No hay sondeo periódico ni
enviador automático en segundo plano: el administrador ejecuta los lotes desde
la página y puede repetirlos si se interrumpe.

Referencia del formato del proveedor:
[Meta WhatsApp Cloud API](https://www.postman.com/meta/whatsapp-business-platform/documentation/wlk6lh4/whatsapp-cloud-api).

## Validación

Desde backend:

```sh
DB_PORT=3306 node --test test/auto-users*.test.js test/permissions.test.js test/auth-permissions.test.js test/registro-invitacion.test.js test/cuentas-verificacion.test.js test/cuentas-baja.test.js
```

Pruebas de modelo/servicio, migración simulada, HTTP local, formularios/DOM y Meta
simulado. Cubren repetición/concurrencia, correo ausente y colisiones, cuenta
existente, token reemplazado/caducado/usado, número incorrecto, manipulación de
vivienda/rol, reporte/corrección/reenvío, contraseña, sesión, permisos y privacidad.
Quedan pendientes revisión visual en navegador, MySQL real y envío de prueba desde
el remitente configurado; no se envió WhatsApp ni se modificó producción en este PR.

## Prueba individual sin WhatsApp

En Auto-users, utiliza **Prueba individual · sin WhatsApp** antes de operar el padrón completo.

1. Selecciona una vivienda dedicada a pruebas (calle con la palabra `Prueba` o número que empiece por `TEST-`). Si no existe, regístrala primero en Viviendas; no renombres una vivienda real.
2. Presiona **Crear cuenta de prueba**. Se guarda un condómino ficticio sin teléfono y una sola cuenta pendiente con e-mail `example.com`. No se recorren los condóminos reales. Repetir en la misma sesión de administrador conserva esa cuenta, incluso después de editarla o aceptarla.
3. Presiona **Generar enlace sin enviar** y **Copiar enlace**. Abre el enlace en incógnito para conservar la sesión administrativa. No requiere configuración de WhatsApp. Cada generación reemplaza el enlace anterior, dura 14 días y guarda solamente su hash.
4. Comprueba campos de vivienda de solo lectura, edición de usuario/e-mail, contraseñas, botón NO y rechazo de número de casa incorrecto. La cuenta debe continuar pendiente.
5. Prueba **Reportar error**: verifica el reporte en Administración, corrígelo con **Editar**, y vuelve a **Generar enlace sin enviar** en la sección de prueba. No uses Enviar; las cuentas de prueba se excluyen de WhatsApp, aunque se les agregue un teléfono. Su vivienda solo puede corregirse hacia otra vivienda de pruebas.
6. Con el nuevo enlace, confirma el número correcto: debe iniciar sesión en Inicio, mostrar Cuenta aceptada = Sí y dejar inutilizable ese enlace. Repetir Crear cuenta de prueba en la misma sesión no duplica la cuenta aceptada.

Estos botones crean registros ficticios persistentes en la base, pero no envían mensajes ni modifican cuentas reales, pagos o fechas de TAGs. La clave de repetición se conserva en `sessionStorage` de esa pestaña; otra sesión puede crear otra prueba. La vivienda elegida recibe un vínculo activo al aceptar: úsala exclusivamente para pruebas. No se ofrece reiniciar cuentas aceptadas.

Rutas administrativas: `GET /api/auto-users/prueba/viviendas`, `POST /prueba/crear` (`casaId`, `clavePrueba` de 32 hex), `POST /prueba/:id/enlace`. La URL usa `AUTO_USERS_FRONTEND_URL` si está configurada; de lo contrario acepta la ruta del portal enviada por el administrador solo cuando su origen coincide con el encabezado Origin, con HTTPS salvo localhost. Los enlaces son privados y no deben publicarse.


## Ver, editar y borrar cuentas de prueba

La sección **Prueba individual** incluye la tabla **Usuarios de prueba guardados**, paginada de 50 en 50. Consulta cuentas pendientes y aceptadas creadas por este flujo, incluso de sesiones anteriores: IDs de cuenta/condómino, nombre, vivienda, usuario, correo, teléfono, estado y estado de invitación. **Ver / editar** abre el formulario con esos datos y fechas de creación/actualización. Se editan nombre, vivienda dedicada a pruebas, usuario, correo y teléfono; conserva aceptación, contraseña y rol, actualiza también el condómino y el vínculo, revoca enlaces anteriores y sesiones de la cuenta. Una cuenta pendiente puede obtener un nuevo **Enlace sin enviar** desde su fila.

**Borrar** pide confirmación e inicia una transacción que elimina los reportes de prerregistro, invitación, vínculos usuario-vivienda, cuenta y condómino ficticio. Conserva la vivienda. Verifica la marca interna de prueba, rol Condómino y ausencia de otra cuenta para ese condómino. Si existen referencias a la cuenta/condómino en otros modelos (por ejemplo pagos o reservas), rechaza la eliminación; un error de clave foránea revierte todo. No elimina historial de otros módulos como atajo. Después de borrar puede volver a crearse una cuenta de prueba con el botón individual.

Esta vista no incluye cuentas antiguas creadas manualmente que carezcan de la marca interna `AUTO_USERS_PRUEBA`; no se considera suficiente que un nombre, correo o vivienda diga Prueba. No muestra contraseñas ni hashes de invitación. Estado y aceptación se consultan; para repetir el proceso de una cuenta ya aceptada, bórrala y crea una prueba nueva.

API administrativa: `GET /api/auto-users/prueba/usuarios?pagina=1`, `PATCH /api/auto-users/prueba/:id` (campos del formulario), `DELETE /api/auto-users/prueba/:id`. Sin migraciones adicionales; requiere desplegar backend y frontend.


### Confirmación y diagnóstico del borrado

Borrar abre un panel dentro de Auto-users con el ID de la cuenta y botones **Sí, borrar cuenta de prueba** / **Cancelar**. No depende de `window.confirm`, que puede ser suprimido por el navegador o su contenedor. La cancelación se muestra explícitamente. Al confirmar aparece **Borrando cuenta de prueba #…**; cualquier rechazo de la API permanece visible en el panel y en la sección de prueba, con los botones habilitados para cancelar o reintentar.

Las solicitudes de Auto-users tienen límite de espera de 45 segundos. Si vence o falla la conexión, actualizar la tabla antes de reintentar, porque la operación puede haberse completado en el servidor. Una respuesta que no sea JSON informa su código HTTP y pide revisar el despliegue del backend. Si DELETE termina pero falla la actualización de la tabla, se informa que el borrado sí fue completado. El cursor de espera se usa durante operaciones en curso; los botones deshabilitados por estado muestran cursor de no disponible.


### Compatibilidad del borrado con el esquema real

Antes de buscar historial, el backend consulta las tablas y columnas físicas disponibles dentro de la transacción. Consulta únicamente los campos de referencia a usuario/condómino que existen: no selecciona todos los atributos del modelo de otros módulos. Esto evita que un campo adicional pendiente de migración o una tabla opcional ausente impida borrar una prueba sin historial. Una tabla ausente no contiene registros; las referencias existentes siguen bloqueando la eliminación. No se desactivan claves foráneas ni se borran pagos/historial externos.

Si falla la comprobación, el mensaje identifica la tabla y el código de error sin publicar SQL, credenciales ni datos personales. Otros fallos internos de las rutas administrativas de prueba muestran un código seguro para revisar los logs del backend. La transacción conserva los registros cuando hay un error.


## Confirmación de acciones masivas

**Crear usuarios** y **Mandar invitación** abren un segundo panel que pregunta si estás seguro y describe la operación para el padrón completo. **Sí** inicia el procesamiento habitual por lotes; **No** o Escape cancela sin crear cuentas ni enviar mensajes. La confirmación se pide una vez por operación, no por lote. Los botones individuales y los de prueba conservan su flujo; no reciben esta confirmación masiva.
