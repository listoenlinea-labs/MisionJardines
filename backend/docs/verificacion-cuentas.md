# Registro y verificación administrativa de cuentas

El enlace **Crear cuenta** del login abre un registro público. Recoge nombre, apellidos, correo, contraseña, teléfono opcional y domicilio declarado. **Soy de seguridad** oculta y deshabilita los campos de domicilio; solo solicita ese perfil, nunca concede permisos.

El código de correo vigente durante 15 minutos confirma la propiedad del correo. Al verificarlo se crean, en una sola transacción, un usuario `PENDIENTE` con rol inicial `CONDOMINO`, sin vivienda ni membresía activa, y una solicitud en `solicitudes_cuenta`. Ninguna cuenta pendiente obtiene JWT ni entra a las API protegidas. El alta no modifica el padrón de direcciones ni los tags.

## Revisión

**Verificación de cuentas**, debajo de Conexión, está disponible solo para `ADMINISTRADOR` y `SUPER_ADMIN`. Tiene pendientes e historial de aprobadas/rechazadas con paginación. Muestra nombre, correo verificado, teléfono, domicilio declarado, fecha y tipo de cuenta solicitado. No muestra hashes, contraseñas ni códigos de verificación.

El administrador contrasta los datos con la persona real y el padrón, selecciona uno de los roles `CONDOMINO`, `SEGURIDAD` o `ADMINISTRADOR`, y confirma que verificó la identidad. Para un condómino debe seleccionar una vivienda existente; la cuenta se vincula como **MIEMBRO**. Si debe ser responsable de la vivienda, Administración lo nombra desde **Mis viviendas** después de aprobar. Seguridad se aprueba sin vivienda ni una casa ficticia. Administrador puede tener una vivienda opcional y acceso administrativo; nunca se permite conceder `SUPER_ADMIN` desde esta pantalla.

Rol, vivienda/membresía, activación y revisión se guardan en la misma transacción. La solicitud se bloquea para impedir decisiones simultáneas; una revisión repetida responde 409. También se vuelve a comprobar que quien revisa conserva un rol administrativo activo. Una cuenta no se aprueba a sí misma.

Rechazar exige un motivo, deja la solicitud `RECHAZADA` y el usuario `BLOQUEADO`. El historial conserva quién decidió, cuándo, comentario y rol asignado. Una cuenta rechazada no puede registrarse nuevamente con el mismo correo; debe contactar a Administración para resolver su caso. La pantalla no incorpora reactivación de cuentas rechazadas ni edición de roles de cuentas activas; los cambios de rol existentes continúan en Configuración de cuenta.

Las cuentas nuevas que llegan por invitación también quedan pendientes tras verificar el correo. La invitación queda consumida y su vivienda se muestra como sugerencia; la revisión administrativa verifica y crea la membresía. Las invitaciones a otras viviendas para una cuenta ya activa conservan su flujo existente. Los usuarios activos actuales no pasan a pendientes.

## Despliegue

1. Desplegar backend y frontend de esta rama y reiniciar Node.
2. El arranque crea `solicitudes_cuenta` y verifica las tablas de códigos y cambios de rol. Cambia únicamente la nulabilidad de `usuarios.casa_id` (INT UNSIGNED, según el esquema real) para permitir cuentas pendientes/personal sin vivienda. Conserva las cuentas, claves y demás datos. No usa `sync({alter:true})` ni borra tablas.
3. La conexión de la aplicación necesita permisos DDL para estas migraciones, como las migraciones existentes. Si la migración falla, el servidor no anuncia estar disponible con un esquema incompleto.
4. Configurar las variables SMTP existentes (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `SMTP_FROM_EMAIL` y `SMTP_SECURE`). Un fallo de envío no crea una cuenta ni habilita acceso; permite volver a solicitar el código. No se requiere una nueva variable de registro.
5. Probar con un correo de prueba real: verificar el código, comprobar el rechazo del login mientras está pendiente, aprobar como residente con vivienda y como seguridad sin vivienda, y volver a iniciar sesión. Para rechazo, comprobar motivo e historial.

La verificación de correo ocurre antes de que la solicitud aparezca en la bandeja. No se envía un aviso automático de aprobación/rechazo: Administración puede consultar el historial y la persona puede intentar iniciar sesión para conocer si su acceso ya fue autorizado.

## API

- `POST /api/auth/registro/solicitar`: campos del formulario, `tipoCuenta` CONDOMINO (predeterminado) o SEGURIDAD. Calle y número obligatorios solo para residentes. Admite el token de invitación existente.
- `POST /api/auth/registro/verificar`: correo y código de seis dígitos. Devuelve `pendienteAprobacion: true`.
- `GET /api/auth/cuentas?estatus=PENDIENTE&pagina=1`: solicitudes; también APROBADA y RECHAZADA. JWT y rol administrativo.
- `GET /api/auth/cuentas/viviendas?q=Gardenias`: búsqueda privada del padrón para revisar el domicilio; máximo 200 resultados.
- `PATCH /api/auth/cuentas/:id`: `{ "accion": "APROBAR", "rol": "CONDOMINO", "casaId": 7, "identidadVerificada": true, "comentario": "Identidad comprobada" }`. Para rechazar: `{ "accion": "RECHAZAR", "comentario": "Motivo de rechazo" }`.

Las pruebas automatizadas simulan almacenamiento y SMTP; no modifican la base ni envían correos de producción. La revisión visual en Chromium no pudo ejecutarse en este entorno porque no se pudo instalar el navegador. Revisar las nuevas pantallas en monitor, tableta y celular antes del despliegue definitivo.
