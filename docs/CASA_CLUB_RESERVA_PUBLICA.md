# Reserva pública de Casa Club

Comparte [el enlace de Casa Club](https://listoenlinea-labs.github.io/MisionJardines/app.html?page=casa-club.html).
Sin una sesión válida, este enlace abre el formulario público en `casa-club.html`.
La disponibilidad muestra solo
fecha y estado; no devuelve viviendas, nombres ni contactos. La persona
selecciona un día, indica su vivienda, nombre, correo, WhatsApp y motivo, y
acepta el aviso por WhatsApp. Al escribir la calle, se sugieren nombres del
padrón; al elegirla, se sugieren solo los números de esa calle. El
catálogo de sugerencias devuelve únicamente esas opciones, sin datos de
residentes. Si el catálogo no carga, se puede capturar el domicilio manualmente. El formulario público no pide iniciar sesión.
Se conserva el requisito de elegibilidad por adeudos; en público no se
muestran importes ni detalles de una vivienda. La sesión válida de condómino
permite vincular el apartado a Mis reservas. Administración conserva su
reserva directa y su panel protegido.

1. Se guarda un apartado PENDIENTE. El índice único de `fecha_bloqueada` impide
   dos apartados para el mismo día. Hay un apartado con plazo activo por
   vivienda y un límite de solicitudes por IP.
2. El depósito fijo obligatorio para nuevas reservas es **$2,000 MXN** (distribución inicial: $700 de recuperación, $700 de garantía y $600 de limpieza). Administración puede editar cada importe, pero los tres deben sumar $2,000 y se guardan en MySQL. Los importes de reservas antiguas no se modifican. El plazo inicial es de 3 días calendario, con tope en la víspera
   del evento. Se permite pagar hasta el final de ese día en hora de Guadalajara.
   Para el flujo público no se permiten eventos para el mismo día.
3. Se muestran los datos de depósito y se solicitan los envíos al correo y
   WhatsApp capturados. Los proveedores pueden aceptar o rechazar el aviso;
   su aceptación no acredita entrega. Si falla un canal, los datos permanecen
   visibles en pantalla. El correo de Administración avisa que hay una nueva
   solicitud, que también aparece en **Aprobación de reservas**.
4. El solicitante envía su comprobante al correo de Administración con el
   folio CC. Administración debe verificar el depósito completo en el banco
   y aprobar antes del vencimiento. Se guarda el folio bancario y el pago
   confirmado con la aprobación en una sola transacción. No se reprecian los
   apartados que ya recibieron instrucciones. Un abono parcial no confirma
   la reserva; Administración debe conciliarlo y conservar su registro.
5. Al consultar disponibilidad o intentar reservar una fecha vencida sin
   confirmación se libera el apartado; no se necesita un cron. Un correo con
   comprobante no confirma el pago automáticamente. Si Administración no
   verifica el depósito a tiempo, debe revisar el caso antes de ofrecer otra
   fecha o gestionar una devolución. No cambia TAGs ni adeudos de mantenimiento.

## Configuración y puesta en marcha

- Desplegar frontend y backend de la misma versión. El arranque admite
  `usuario_id = NULL` para una solicitud sin cuenta; si el usuario de la base
  no puede hacer ALTER, aplicar antes
  `backend/sql/2026-11-10-casa-club-reserva-publica.sql`. Verificar la tabla
  existente y el índice único de `fecha_bloqueada`.
- En el backend configurar `CASA_CLUB_BANCO`, `CASA_CLUB_TITULAR`,
  `CASA_CLUB_CUENTA` (cuenta/CLABE de recepción), `CASA_CLUB_ADMIN_CORREO`,
  `CASA_CLUB_PLAZO_DIAS` (1–30, predeterminado 3) y las variables `SMTP_*`.
- Configurar `WHATSAPP_GRAPH_VERSION`, `WHATSAPP_PHONE_NUMBER_ID`,
  `WHATSAPP_ACCESS_TOKEN`, `CASA_CLUB_WHATSAPP_TEMPLATE` y
  `CASA_CLUB_WHATSAPP_IDIOMA` (predeterminado `es_MX`). La plantilla de Meta
  debe estar aprobada y tener ocho parámetros de texto en el cuerpo:
  folio CC, fecha del evento, monto MXN, banco, cuenta, titular, fecha límite,
  correo de Administración. Propuesta de plantilla de utilidad:

  > Tu solicitud {{1}} para el {{2}} quedó apartada. Deposita {{3}} en {{4}},
  > cuenta/CLABE {{5}}, a nombre de {{6}}, a más tardar el {{7}} (hora de
  > Guadalajara). Envía el comprobante a {{8}} con el folio de la solicitud.
  > Administración verifica el pago y confirma la reserva. Si el pago no
  > queda confirmado a tiempo, se libera la fecha.

- La ruta de solicitudes devuelve indisponibilidad si falta configuración
  requerida; nunca envía un número de cuenta de ejemplo. Probar con una
  vivienda y destinatarios de prueba antes de compartir el enlace.
- Referencia: [Meta WhatsApp Business Platform, mensajes de plantilla](https://www.postman.com/meta/whatsapp-business-platform/request/o65u5m5/send-message-template-text).

## PR #382 (11-nov-2026): tarifas, reservas y comprobación de pagos

La tarifa se guarda en `casa_club_tarifas` (una única configuración vigente).
Las nuevas solicitudes registran una copia de sus importes en su reserva: el
administrador puede repartir recuperación, garantía y limpieza en pesos
enteros, pero **el total siempre debe ser $2,000**. Para desplegar sin permiso
CREATE en Hostinger, ejecutar antes
`backend/sql/2026-11-11-casa-club-tarifas-fijas.sql`. No migrar importes
históricos ni borrar pagos previos.

Administración ve la fecha **y hora de recepción** en hora de Guadalajara,
el día solicitado y el desglose. Puede aprobar con depósito revisado y folio,
o rechazar. La cancelación de una reserva aprobada exige motivo, cambia su
estado a CANCELADA y libera `fecha_bloqueada` sin eliminar movimientos ni
comprobantes. Si había depósito, debe tratar la devolución por separado.

Los avisos de solicitud por correo y WhatsApp incluyen los tres conceptos y
el total, así como banco, cuenta configurada, titular, plazo y folio. El envío
real depende de las variables SMTP y Meta en Hostinger. La plantilla de Meta
conserva ocho parámetros; ahora el parámetro del monto incluye el desglose.
**Verificar con una plantilla aprobada y recepción real en un teléfono**, no
solo con la respuesta HTTP de la API.

### Validación indispensable antes de activar en producción

1. Publicar frontend y backend de esta misma revisión. Comprobar que una
   solicitud pública elegible aparta un único día con total $2,000 y que los
   correos y WhatsApp llegan realmente a sus destinatarios.
2. Aprobar tras revisar banco y registrar folio: la fecha queda confirmada y el
   movimiento se guarda exactamente una vez. Rechazar otra solicitud y
   confirmar que su fecha se libera sin pago.
3. Cancelar una reserva aprobada: el día queda disponible, los pagos históricos
   permanecen y la devolución no se marca automáticamente.
4. Guardar una distribución distinta que sume $2,000, recargar la página y
   reiniciar el backend para confirmar persistencia. Rechazar sumas erróneas,
   decimales y valores negativos.
5. Entrar como CONDOMINO: debe iniciar en **Pagos**, navegar únicamente a
   **Pagos** y **Casa Club**, y recibir 403 al intentar otros módulos.

La automatización general de pagos de mantenimiento usa captura y OCR en el
servidor, conciliación IMAP y registro `VALIDADO` en transacción. Sólo
entonces las mensualidades completas generan eventos para ajustar TAGs del C3
después del commit. Los abonos parciales no adelantan vigencias; Casa Club y
extraordinarias no actualizan TAGs. Revisar
`PAGOS_BANK_AUTO_VALIDATE=true`, credenciales IMAP, remitente declarado y
destino antes de ejecutar una prueba real con depósito, correo bancario,
MySQL y C3. **No se realizó una prueba extremo a extremo en Hostinger/C3** en
este PR. El criterio de remitente es el encabezado From, no DKIM/DMARC: no
se debe presentar como autenticación criptográfica del banco.

## PR Casa Club · conciliación automática Titan (11-nov-2026)

**Dos caminos para obtener una fecha:**

- **Solo solicitud:** el sistema aparta provisionalmente el día, envía las
  instrucciones y avisa a Administración. El administrador puede aprobar o
  rechazar; si aprueba SIN depósito, `pagado=false` y el cobro no aparece
  como confirmado. El plazo comunicado sigue vigente.
- **Solicitud + comprobante desde Pagos:** la persona entra a su cuenta
  vinculada a la vivienda, abre **Casa Club → Mis reservas → Subir comprobante**
  (o usa el botón mostrado tras solicitar la fecha), y el módulo **Pagos**
  preselecciona la reserva. Usa exactamente el OCR y la conciliación bancarios
  que mantenimiento: remitente autorizado, identificador, importe, fecha,
  cuenta destino, huella única del aviso y comprobante original.

**Aprobación automática:** el archivo por sí solo NO acredita dinero. El
comprobante se guarda como `PENDIENTE_VALIDACION` y se revisa con Titan. Solo
cuando existe **una coincidencia bancaria íntegra** y la reserva sigue viva,
vinculada a esa vivienda y con total exactamente igual al cobro originalmente
comunicado (por defecto $2,000), una única transacción MySQL establece
`PagoReportado=VALIDADO` y
`ReservaCasaClub={estatus:APROBADA,pagado:true,fechaBloqueada:fecha}`.
Después del commit se intenta correo al residente y al administrador; un
fallo del proveedor SMTP no revierte una confirmación bancaria legítima.
Administración ve todos los movimientos y puede descargar imagen y recibo PDF
desde el detalle de la reserva.

**Seguridad:** nunca se puede usar otra vivienda o fecha, una reserva ya
cancelada/rechazada, monto incompleto, evento ya vencido o un comprobante ya
registrado. Dos avisos bancarios completamente compatibles siguen requiriendo
revisión: no se relaja ninguna condición de Titan. Los pagos de Casa Club
**no adelantan cuotas de mantenimiento ni TAGs de ZKTeco**. En el panel
administrativo, confirmar pago manual requiere folio bancario y prohíbe
duplicarlo si existe ya una captura en revisión. Rechazar con comprobante en
revisión queda bloqueado, porque podría existir un depósito real.

**Solicitudes públicas:** se mantienen accesibles sin cuenta, pero para subir
un comprobante y consultar el estado en Pagos la persona debe iniciar sesión
en una cuenta vinculada a la vivienda; nunca se concede acceso a pagos
de viviendas ajenas mediante un enlace público.

### Pruebas de aceptación (Hostinger/Titan)

1. Crear una solicitud de vivienda elegible para un día libre. Comprobar
   `PENDIENTE`, `pagado=false`, día bloqueado y aviso a Administración.
2. Sin pagar, aprobar una fecha desde Administración: debe permanecer
   `pagado=false`, sin inventar depósito ni crear movimiento de dinero.
3. Crear otra reserva, subir captura real de **$2,000** en Pagos → Casa Club:
   debe quedar En revisión y no ocupar un segundo día ni generar pago duplicado.
4. Confirmar que Titan recibió una notificación válida. Después de la
   conciliación, deben cambiar **juntos** estado del pago y estado de reserva;
   el calendario pasa de Apartada a Reservada y Administración puede descargar
   imagen original y PDF. Verificar recepción real de correos.
5. Probar comprobante sin coincidencia o con datos incorrectos: no se
   autoriza el día automáticamente. Repetir prueba de envío: el sistema no
   debe aceptar otro reporte mientras existe el primero en revisión.
6. Comprobar que mantenimiento, proyectos extraordinarios, cuotas y C3 no
   cambiaron por el pago Casa Club. Probar cancelación y liberación de día
   conservando el pago histórico para eventual devolución.

Para solicitudes antiguas se respeta el precio almacenado en cada reserva;
la tarifa vigente de $2,000 se aplica a las nuevas. El código NO fue probado
con correo ni MySQL reales al abrir el PR; el despliegue requiere frontend
GitHub Pages y backend Hostinger, pero **no requiere migración SQL nueva**.
