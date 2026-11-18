# WhatsApp Flows · Calendario Casa Club
Fecha: 17/11/2026

## Qué hace el nuevo calendario
- En «Reservar Casa Club», si Meta tiene publicado el Flow y se configuró su ID, el bot envía un mensaje con botón **Abrir calendario**.
- El archivo de Flow es: `backend/flows/casa-club-fecha.flow.json` (versión Flow JSON 7.3, pantalla `FECHA_CASA_CLUB`).
- Al abrirlo, el backend consulta `GET /api/casa-club/publico/fechas` para los próximos 365 días (desde mañana, horario de Guadalajara).
- Envía al Flow **solo** `min_date`, `max_date` y `unavailable_dates`. No incluye nombre, correo, teléfono, domicilio, ID de reserva o cualquier información de quién apartó el día.
- Si Google Sheets no puede verificarse (disponibilidadVerificada=false), no presenta el calendario como confiable. Ofrece el formato manual.
- Cuando una persona confirma, Meta manda el resultado por el mismo webhook firmado `/api/webhooks/whatsapp-comprobantes` como `interactive.nfm_reply.response_json`.
- Se comprueba un `flow_token` aleatorio de un solo uso, vinculado únicamente a la sesión del teléfono que recibió el Flow. Se consume antes de consultar la fecha.
- **Siempre** se consulta nuevamente el calendario de Casa Club antes de mostrar las calles. Nunca se aparta ni se hace una reservación por tocar una fecha; el flujo de reglamento/identidad/pago del PR #460 permanece intacto.
- Si alguien termina un Flow antiguo o selecciona una fecha ahora ocupada, se invita a abrir el calendario otra vez. También puede escribir la fecha con los formatos que ya soporta el bot.
- Si el Flow no está configurado en Hostinger o falla su envío, mantiene el funcionamiento anterior de fecha manual.

## Configurar en Meta (requerido después del merge)
1. Abrir [WhatsApp Manager](https://business.facebook.com/wa/manage/flows/), seleccionar la misma **cuenta de WhatsApp Business** donde está registrado el número que usa `WHATSAPP_PHONE_NUMBER_ID`. En la interfaz actual puede estar bajo **Herramientas de la cuenta → Flows**.
2. Crear un nuevo Flow llamado **Misión Jardines · Calendario Casa Club**. Seleccionar flujo en blanco y abrir su editor JSON.
3. Pegar **el contenido íntegro** de `backend/flows/casa-club-fecha.flow.json`, validar con el editor de Meta, revisar en vista previa y **Publicar**. Una vez publicado, Meta no permite editar directamente esa versión: para cambiar el diseño se crea un nuevo Flow o se clona según la interfaz.
4. Copiar el **Flow ID** numérico asignado por Meta. No confundir con App ID, WABA ID ni Phone Number ID.
5. En variables de Hostinger del backend, registrar:
   - `WHATSAPP_CASA_CLUB_FLOW_ID=<FLOW_ID_PUBLICADO>`
   - Conservar los valores ya existentes de `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_GRAPH_VERSION`, `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_BOT_ENABLED`, `WHATSAPP_ZERO_COST_MODE` y `WHATSAPP_BOT_SESSION_SECRET`.
6. Guardar variables y reiniciar la app Node.js. El mismo token WhatsApp debe tener permiso `whatsapp_business_messaging`. No añadir secreto ni URL de endpoint de datos: este Flow es **estático con datos iniciales** y notifica completitud mediante el webhook ya firmado.
7. Desde tu número autorizado en Meta, enviar «Menú» → **Reservar Casa Club** → **Abrir calendario**, seleccionar fecha disponible, pulsar **Confirmar fecha** y verificar que el bot responda con **la lista de calles**.
8. Intentar una fecha ocupada (debe figurar bloqueada en el calendario). También probar un caso en el que otra persona ocupa la fecha mientras el Flow sigue abierto: la nueva comprobación debe rechazarla sin mostrar quién la reservó.
9. Probar la opción manual con `20/04/2027` y `20 de abril de 2027`; ambos caminos deben comprobar disponibilidad, NO registrar una reserva hasta después de la autenticación y aceptación del reglamento.
10. Si el calendario no aparece, comprobar que el Flow está **PUBLISHED**, el ID y cuenta de WhatsApp Business coinciden, y revisar el error concreto de Graph API en los logs. Un Flow en borrador no sirve a usuarios de producción.

## Consideraciones
- El calendario **no está dentro de la burbuja normal**. El botón abre una pantalla nativa de WhatsApp.
- Los días ocupados se obtienen al momento de crear el mensaje: si cambian, el usuario podría seguir viendo el estado anterior hasta volver a abrirlo. La segunda consulta de servidor evita confirmar una reserva sobre fecha ocupada.
- Los días ocupados son datos públicos de disponibilidad. Nunca publicar identidad de quien reservó.
- Para cambiar las fechas **mientras el Flow está abierto** sin reenviar el mensaje se necesitaría un Flow dinámico con endpoint cifrado RSA/AES; **no se incluye** en este PR, a fin de mantener simple y segura la integración actual.
- Este PR no crea ni publica por sí solo el Flow en la cuenta de Meta y no puede obtener el ID real sin entrar a la cuenta; esa configuración es manual.
- No fusionar como garantía de producción sin la validación de Meta y un ensayo controlado. La ruta manual se conserva en caso de errores.

## Validación
- Archivo de Flow JSON versionado en GitHub; validar la pantalla en el Flow Builder antes de publicar.
- Pruebas automatizadas del módulo en `backend/test/whatsapp-casa-club-calendario.test.js` para token, selección, fecha ocupada y fallo de verificación.
- Sin dependencias npm adicionales ni tablas SQL nuevas.
