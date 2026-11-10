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
2. El total actual es $1,400 MXN ($700 de renta, $700 de garantía y $0 de
   limpieza). El plazo inicial es de 3 días calendario, con tope en la víspera
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
