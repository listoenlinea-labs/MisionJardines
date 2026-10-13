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
