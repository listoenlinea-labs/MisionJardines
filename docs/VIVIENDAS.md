# Usuarios y varias viviendas

Una cuenta personal puede estar vinculada a varias viviendas. El rol global (Administración, Seguridad, Condómino) es independiente del tipo de miembro por casa (RESPONSABLE o MIEMBRO). Cada pago conserva casaId y usuarioId; cuotas e historial se consultan con la vivienda activa validada en servidor.

## Operación

- Mis viviendas aparece para todos los roles reconocidos; los demás permisos de secciones no cambian.
- Administración selecciona cualquier casa para vincular una cuenta existente, invitar un responsable o miembro, cambiar su tipo o desvincularlo.
- Un responsable puede invitar miembros de sus viviendas y revocar invitaciones de miembros. No puede nombrar responsables ni otorgar roles globales.
- Cada invitación se envía por correo y vence a las 72 horas. Solo se almacena su hash. Una cuenta existente acepta iniciando sesión con el mismo correo. Una cuenta nueva recibe además un código de verificación de correo antes de crearse.
- Registro público ya no permite elegir vivienda: requiere invitación. Códigos anteriores sin invitación dejan de ser válidos.
- El selector de vivienda recarga la página y muestra el domicilio. Cada documento conserva su contexto para no cambiar el destinatario de una petición de pago en curso.
- El servidor comprueba X-Casa-Id contra vinculaciones activas en cada petición. Sin selección usa la primera vinculación activa. Una selección revocada se rechaza; no se reasigna silenciosamente a otra casa.
- Las vinculaciones se desactivan, no se borran. HistorialVinculo registra cambios. Al quitar un responsable se revocan sus invitaciones pendientes.

## Base de datos y despliegue

Respaldar MySQL antes de desplegar. El backend crea idempotentemente usuarios_casas, invitaciones_casa e historial_vinculos al arrancar, con Sequelize. Requiere permisos CREATE/INSERT/INDEX para estas tablas y acceso a las tablas existentes. Se conserva usuarios.casa_id por compatibilidad; no se usa como autorización.

La migración INSERT IGNORE copia las asociaciones existentes como MIEMBRO. La clave única usuario_id+casa_id impide duplicados y evita reactivar asociaciones dadas de baja al reiniciar. Administración asigna responsables desde Mis viviendas. No se modifican importes ni historiales de pagos.

Desplegar backend primero y después docs; el backend debe incluir todos sus nuevos modelos, servicios y rutas. Configurar SMTP existente y FRONTEND_APP_URL con la URL completa de la página, por ejemplo https://listoenlinea-labs.github.io/MisionJardines. FRONTEND_URL se conserva como origen para CORS. Las invitaciones fallidas por SMTP se revocan y el usuario recibe un error para volver a intentar.

La promoción previa de la cuenta administradora sigue siendo una migración independiente. Para usuarios nuevos, usuarios.casa_id se conserva como la primera vivienda del registro; las demás vinculaciones pertenecen a usuarios_casas.

## Validación y límites

Ejecutar node --test backend/test/*.test.js. Las pruebas de autorización, rutas y registro usan dobles de MySQL/SMTP; no demuestran un despliegue real. Antes de producción comprobar dos cuentas de la misma vivienda, un responsable de dos viviendas, invitación por correo, baja con sesión abierta y cuotas/recibos de ambas casas. Las reglas de pagos, conciliación bancaria y reactivación de tags conservan su comportamiento anterior; este cambio no automatiza la confirmación bancaria.
