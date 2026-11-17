# Piloto conversacional de WhatsApp · Misión Jardines

## Estado
**Código integrado, deshabilitado por defecto.** No se pueden entregar mensajes reales hasta configurar un número de WhatsApp Cloud API, el secreto de firma y el webhook de Meta. No se ha comprobado contra Titan ni contra la base de producción.

El piloto reutiliza `POST/GET /api/casa-club/publico/*` de Misión Jardines. **MySQL sigue siendo la fuente de verdad** para reservas, Google se coteja antes de ofrecer disponibilidad y Titan es la única vía de confirmación bancaria. La aplicación web no se sustituye.

## Qué funciona en este PR
1. **Cualquier texto** enviado al número muestra el menú: reservar Casa Club, consultar deudas, reportar pago, registrar visita.
2. **Casa Club sin usuario ni contraseña:** pregunta fecha (DD/MM/AAAA); consulta disponibilidades reales; lista las calles de `/publico/domicilios`; pide número de vivienda; pregunta nombre, correo y la aceptación explícita del reglamento. Estos últimos campos son obligatorios en la API actual y no pueden omitirse.
3. Envía la solicitud por la misma API pública, con bloqueo atómico de fecha, reglas de elegibilidad, correo de enlace privado y plazo de pago. Responde **Apartada provisionalmente / En revisión**; nunca confirma antes del pago.
4. Recibe una foto JPG/PNG/WebP menor a **900 KB** en el chat. El servidor descarga el medio desde Meta con token y revisa tamaño/origen, extrae monto, fecha, hora e identificador con OCR y llama a `/publico/comprobante`, que registra un **pago pendiente** para el worker bancario. Si falla la lectura o se envía PDF, indica el enlace único del correo, sin acreditar la operación.
5. Responde a **ESTADO** cotejando la reserva real y el pago. Cuando Titan la pone **APROBADA + pagado**, el worker avisa automáticamente si el residente escribió dentro de las últimas 23 horas (margen frente a la ventana de servicio de Meta). Fuera de esa ventana exige una plantilla de utilidad autorizada o un mensaje entrante nuevo.
6. Eventos entrantes persistidos por `wamid` para deduplicar, sesión cifrada con AES-256-GCM y reintentos de worker. No guarda contraseñas ni tokens en claro.

## Lo que falta para completar las cuatro opciones solicitadas
- **Consultar deudas y enviar PDF en el chat:** implementar vinculación segura WhatsApp ↔ usuario del portal y generación de un PDF de mantenimiento, proyectos y Casa Club. Por ahora ofrece el portal de Pagos, sin revelar datos personales.
- **Reportar pagos personales:** con la misma vinculación, ofrecer solo obligaciones reales y subir imagen al registro existente de Pagos. Hasta entonces el bot remite al portal.
- **Registrar visitas:** con sesión segura, utilizar `visitas_programadas` para crear el registro y hacerlo visible en Historial de visitas de Seguridad. Por ahora se remite al portal autenticado.
- **Documentos PDF enviados en chat:** requieren procesamiento adicional; el piloto de Casa Club acepta fotos directamente y deriva archivos PDF al enlace privado del correo.
- **Plantillas Meta:** configurar confirmaciones fuera de la ventana de atención de WhatsApp y avisos de errores. La plataforma de Meta puede cobrar mensajes según categoría y país.
- **Auditoría/operación:** trazas sin PII, eliminación periódica de sesiones y documentos, verificación de cuenta receptora y carga del sistema en Hostinger.

No es aconsejable solicitar la contraseña del portal dentro del historial de WhatsApp. Para conseguir el mismo resultado se propone un **enlace de autenticación HTTPS temporal**, con credenciales solo en el sitio y vinculación limitada al usuario y vivienda.

## Activación controlada en Hostinger (después de merge)
1. Ejecutar `backend/sql/2026-11-17-whatsapp-bot.sql` en MySQL (además de `whatsapp_comprobantes.sql` únicamente si se mantiene ese piloto).
2. Crear/seleccionar el número de WhatsApp Business Platform y la aplicación en Meta for Developers; suscribir `messages`.
3. Configurar el callback **HTTPS**: `https://api-misionjardines.listoenlinea.host/api/webhooks/whatsapp-comprobantes`.
4. Configurar estas variables en Hostinger, **nunca en GitHub**:
   - `WHATSAPP_VERIFY_TOKEN`: secreto elegido por ustedes (también se registra en Meta).
   - `WHATSAPP_APP_SECRET`: secreto de la app de Meta, necesario para verificar `X-Hub-Signature-256`.
   - `WHATSAPP_PHONE_NUMBER_ID`: identificador del número de Meta.
   - `WHATSAPP_ACCESS_TOKEN`: token duradero, almacenado solo en Hostinger.
   - `WHATSAPP_GRAPH_VERSION`: versión vigente indicada por Meta, p.ej. `vXX.X`.
   - `WHATSAPP_BOT_SESSION_SECRET`: secreto aleatorio independiente de al menos 32 caracteres.
   - `APP_BASE_URL`: URL HTTPS canónica de la API existente.
   - `WHATSAPP_BOT_ENABLED=true`.
5. Conservar `WHATSAPP_COMPROBANTES_ENABLED=false` si **solo** desean usar el bot y no la bandeja antigua de adjuntos; se permite cualquiera de las dos funciones con el mismo webhook.
6. Enviar un «Hola» desde un número autorizado de prueba. Verificar menú y disponibilidad. Luego probar una reserva de ensayo **con una vivienda habilitada y una fecha libre** antes de dar acceso al resto del fraccionamiento.
7. Verificar el correo de la solicitud y el registro de Casa Club y esperar el cotejo real de Titan; la foto sola NO acredita el pago.

## No hacer
- No asumir que una fecha está libre si Google no terminó de sincronizar.
- No aprobar ni marcar `pagado` por un OCR, por un número de WhatsApp o por un correo sin coincidencia bancaria.
- No registrar visitas ni enviar saldos de una vivienda sin autenticación asociada a su dueño.
- No activar el bot sin SQL y credenciales de Meta: viene **apagado por defecto**.

## Regla de soporte
Enviar **MENÚ** vuelve a las opciones principales. **ESTADO** consulta la solicitud de Casa Club que continúa vinculada temporalmente al chat. Si falla la imagen, usar el enlace privado recibido por correo sin crear otra reserva.
