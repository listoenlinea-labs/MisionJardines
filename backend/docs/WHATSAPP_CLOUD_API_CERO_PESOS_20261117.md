# WhatsApp Cloud API — objetivo de $0 MXN en mensajería de servicio
Fecha de referencia: 17 de noviembre de 2026.

## Alcance y limitaciones
- Desde el **1 de octubre de 2026** Meta ofrece **1,000 mensajes de servicio gratuitos por número de WhatsApp Business Platform cada mes**. Mensajes adicionales, plantillas u otros servicios pueden cobrar según la tarifa vigente. Validar en la consola de Meta antes de uso real: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing
- **Este PR limita el bot a 900 intentos de respuestas de servicio en cualquier ventana móvil de 31 días**. Suprime los envíos adicionales, no ejecuta plantillas de WhatsApp y rechaza respuestas fuera de la ventana iniciada por el usuario (23 h 45 min de margen).
- Cuando el contador llega a **875**, el bot envía un aviso de continuación por el **portal web**, máximo una vez por conversación, mientras queda cupo. A partir de 900 se mantiene sin respuesta: no puede mandar otro aviso sin consumir otra respuesta. El portal web sigue accesible.
- Cuenta cada intento antes del POST a Meta, **incluso si falla**. No descuenta los reintentos ni intenta compensaciones porque Meta pudo recibir el mensaje aunque el cliente haya perdido conexión.
- **No es un control de facturación de Meta**: no ve mensajes enviados desde Meta Manager, otras apps, proveedores externos o usuarios del mismo número, ni tarifas futuras. Si existen, podrían generar cargos. Revisar en WhatsApp Manager → Insights / Message pricing.
- Los mensajes proactivos fuera de la ventana de 24h, plantillas de marketing/utilidad/autenticación y envíos masivos están deshabilitados en este modo. Las confirmaciones de pagos pueden enviarse por correo y el residente puede consultar su estado en el portal.
- No hay costos de Twilio ni ManyChat; sí puede haber costos de infraestructura existente, datos móviles, SIM y otros servicios contratados.

## 1. Después de fusionar el PR
1. Dejar **WHATSAPP_BOT_ENABLED=false** mientras se prepara todo y desplegar **backend/main** en Hostinger.
2. En phpMyAdmin de la base Misión Jardines ejecutar, en este orden, ambas consultas del repositorio:
   - `backend/sql/2026-11-17-whatsapp-bot.sql`
   - `backend/sql/2026-11-17-whatsapp-presupuesto-cero.sql`
3. Verificar que existen `whatsapp_bot_sesiones`, `whatsapp_bot_eventos`, `whatsapp_bot_presupuesto_lock` y `whatsapp_bot_presupuesto_dias`. No modifica cuotas ni reservas históricas.

## 2. Crear número de prueba gratis en Meta
1. Abrir https://developers.facebook.com/apps/ e iniciar sesión. Crear aplicación empresarial con el caso de uso WhatsApp. Meta puede pedir un portafolio empresarial.
2. Ir a **WhatsApp → API Setup / Configuración de API** (puede estar bajo el caso de uso).
3. Usar el **Test phone number** que facilita Meta; no comprar SIM para esta primera fase. Registrar el WhatsApp personal como destinatario de prueba (en modo desarrollo hay un número limitado de destinatarios).
4. Copiar `Phone number ID`, `Access token`, `API version` y, en **App settings → Basic**, obtener `App secret`. El access token temporal es solo para probar; más adelante crear un System User token de larga duración.
5. NO pegar secretos en GitHub ni compartir capturas con el token visible.

## 3. Variables de Hostinger
Agregar o completar lo siguiente en Environment Variables del backend Node.js (no en los archivos públicos):
```dotenv
WHATSAPP_BOT_ENABLED=false
WHATSAPP_ZERO_COST_MODE=true
WHATSAPP_COMPROBANTES_ENABLED=false
WHATSAPP_PHONE_NUMBER_ID=EL_ID_NUMERICO_META
WHATSAPP_GRAPH_VERSION=vXX.X
WHATSAPP_ACCESS_TOKEN=TOKEN_PRIVADO_META
WHATSAPP_APP_SECRET=APP_SECRET_META
WHATSAPP_VERIFY_TOKEN=CADENA_ALEATORIA_ELEGIDA_POR_TI
WHATSAPP_BOT_SESSION_SECRET=SECRETO_ALEATORIO_DE_AL_MENOS_32_CARACTERES
APP_BASE_URL=https://api-misionjardines.listoenlinea.host
```
Usar exactamente la versión de Graph API que muestra Meta; `vXX.X` es un ejemplo, **no** un valor válido. Para el secreto de sesión, generar en terminal local: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.

## 4. Preparar y verificar el webhook
1. Ya desplegado el nuevo backend, cambiar **WHATSAPP_BOT_ENABLED=true** en Hostinger y reiniciar Node.js.
2. En **WhatsApp → Configuration → Webhooks**, establecer:
   - **Callback URL:** `https://api-misionjardines.listoenlinea.host/api/webhooks/whatsapp-comprobantes`
   - **Verify token:** el valor exacto de `WHATSAPP_VERIFY_TOKEN` elegido en Hostinger.
3. Elegir **Verify and Save** y suscribir el campo **messages**. El webhook verifica `X-Hub-Signature-256` con `WHATSAPP_APP_SECRET`.
4. Desde tu WhatsApp personal autorizado, escribir **Hola** al test phone number de Meta. Esperar menú (el worker puede procesar la cola en segundo plano).
5. Enviar **1**, pedir una fecha **futura**, revisar un día libre y regresar con **MENÚ**. No hacer apartados reales para probar si afectarían al calendario de producción.
6. Probar una reservación de Casa Club en fecha controlada y vivienda válida *solo cuando la administración autorice la prueba*. No se confirma pagada hasta que Titan concilie el depósito.

## 5. Comprobar consumo y evitar cargos
- En el panel de Misión Jardines entrar como administrador y consultar `GET /api/pagos/whatsapp-comprobantes/presupuesto` con el JWT administrativo: devuelve **used, remaining, limit=900, softCap=875**.
- En MySQL ejecutar:
```sql
SELECT numero_meta, SUM(intentos_reservados) AS intentos_de_respuesta,
  MIN(dia) AS primera_fecha, MAX(dia) AS ultima_fecha
FROM whatsapp_bot_presupuesto_dias
WHERE dia >= DATE_SUB(CURDATE(), INTERVAL 31 DAY)
GROUP BY numero_meta;
```
- Consultar **Meta → WhatsApp Manager → Insights → Message pricing** para comprobar el número real de mensajes facturados/gratuitos. El contador local puede ser mayor porque incluye intentos fallidos.
- Mantener **ningún otro emisor** activo para el mismo número, sin plantillas. Si el panel Meta indica cobros, poner inmediatamente `WHATSAPP_BOT_ENABLED=false` y revisar la cuenta.
- Como control externo, valorar no añadir método de pago si Meta permite completar las pruebas sin él; algunas funciones de producción pueden exigirlo. Nunca confiar solo en el límite de este código para evitar cobros.

## 6. Qué está implementado y qué no
- **Implementado en el piloto previo:** menú, disponibilidad y solicitud de Casa Club sin contraseña, subida de imagen y estado por OCR/Titan; el reglamento, nombre y correo siguen siendo obligatorios por la API.
- **Solo accesos al portal (no directos desde el chat):** PDF de adeudos, selección de deuda personal y registro de visitas; requieren vincular la sesión de residente por HTTPS y desarrollo adicional.
- En el modo gratis, cuando el cupo esté bajo, el bot remite al portal sin realizar nuevas operaciones de Casa Club por WhatsApp.
- **Rollback:** desactivar `WHATSAPP_BOT_ENABLED` en Hostinger y reiniciar; el portal, la BD financiera y el historial de Casa Club siguen funcionando.

## Nota importante sobre precio
Este es un mecanismo preventivo diseñado para **no sobrepasar el nivel gratuito de mensajes de servicio** con este bot. No puede garantizar una factura total de Meta de $0 ni sustituye la revisión de tarifas en su cuenta. El bot no debe usarse en producción sin confirmar que la asignación gratuita y las condiciones de facturación siguen vigentes.
