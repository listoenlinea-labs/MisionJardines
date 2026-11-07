# Piloto de recepción de comprobantes por WhatsApp

1. Ejecutar `backend/sql/whatsapp_comprobantes.sql` en la base de pruebas.
2. Configurar las variables `WHATSAPP_*` de `backend/.env.example` en el servidor de pruebas. Usar el ID y token del número de prueba de Meta, el secreto de la aplicación y una versión vigente de Graph API. Elegir un token de verificación propio.
3. Registrar la URL HTTPS `/api/webhooks/whatsapp-comprobantes` como callback de la aplicación y suscribirse a `messages`.
4. Enviar una imagen JPEG, PNG o WebP o un PDF de hasta 2 MiB. Consultar `GET /api/pagos/whatsapp-comprobantes` con sesión de administración y descargar con `GET /api/pagos/whatsapp-comprobantes/:id`. Para paginar, pasar `?antes=ID` con el último ID recibido.

El buzón conserva el remitente y el archivo. La API está reservada a ADMINISTRADOR y SUPER_ADMIN. La recepción no acredita dinero, asigna viviendas ni actualiza TAGs. Los archivos de un mismo mensaje se registran una sola vez; la detección de un depósito reenviado en mensajes distintos corresponde al flujo de pagos. En este piloto, los adjuntos fuera de formato o tamaño se omiten sin respuesta al residente.

Antes de producción quedan pendientes la vinculación de números y viviendas, la conexión con OCR y registro de pagos, el acuse por WhatsApp, la bandeja en el panel y la política de retención de los adjuntos.
