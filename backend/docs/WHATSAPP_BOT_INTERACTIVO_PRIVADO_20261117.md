# WhatsApp interactivo y privado — Misión Jardines
Fecha: 17 de noviembre de 2026

## Cambios
- Menú de cuatro opciones mediante lista interactiva de Meta (límite de tres botones rápidos).
- Calles mediante lista táctil; fechas con DD/MM/AAAA, AAAA-MM-DD, 20 de abril de 2027 o diciembre 13 de 2026.
- Reglamento con aceptación por botón, sin capturar nombre ni correo manualmente.
- Inicio de sesión solo mediante página HTTPS para vincular la vivienda autorizada; jamás solicitar contraseñas dentro de WhatsApp. El correo no distingue mayúsculas y la contraseña sí.
- La vinculación comprueba usuario activo, rol, sesión no revocada y relación activa del usuario con la vivienda. Expira en 24 horas.
- PDF privado de adeudos; pagos de mantenimiento/proyectos/Casa Club recibidos por OCR y registrados en el controlador real; visita registrada en controlador real.
- El recibo PDF se intenta enviar únicamente después de validar el banco. Preferir recibos de Análisis de cuotas; recurrir al recibo de pago reportado validado si el histórico impide regenerar el primero.
- Comando y botones de Menú, recuperación tras reinicio con solicitud de nueva autenticación si expiró.

## Instrucciones Hostinger
1. Deben existir las tablas del piloto, las creadas por 2026-11-17-whatsapp-bot.sql y 2026-11-17-whatsapp-presupuesto-cero.sql.
2. ANTES del deploy, ejecutar una sola vez en la base correcta: backend/sql/2026-11-17-whatsapp-bot-vinculacion.sql.
3. Confirmar APP_BASE_URL=https://api-misionjardines.listoenlinea.host y las variables Meta ya configuradas, WHATSAPP_BOT_ENABLED=true, WHATSAPP_ZERO_COST_MODE=true, WHATSAPP_BOT_SESSION_SECRET >=32 caracteres.
4. Desplegar y reiniciar Node. Verificar que la ruta /whatsapp-vincular.html cargue desde el dominio HTTPS del backend.
5. Probar con una cuenta de residente ACTIVA y vinculada a una vivienda real. Desde el chat: Menú, Reservar, fecha libre, calle, casa, enlace de autenticación, seleccionar vivienda, Ya ingresé. Una reserva de prueba crea registros reales; usar fecha autorizada por Administración.
6. Probar PDF de adeudos y registrar visita controlada, revisando su registro en Seguridad.
7. Solo con autorización de Administración, probar reporte bancario real y consultar el log del worker, estado VALIDADO y envío de recibo. OCR por sí solo no acredita dinero.
8. Confirmar límites/cargos en Meta Manager. El límite de 900 intentos sigue siendo preventivo, no una garantía de factura cero.

## Restricciones honestas
- La carga directa de WhatsApp admite fotos JPG/PNG/WEBP de hasta 900 KB. Los PDF entrantes deben cargarse por el portal; el bot sí envía PDFs.
- Meta no permite enviar mensajes de servicio fuera de las 24 horas sin plantillas. El modo preventivo no manda plantillas; si el banco valida tarde, el residente debe volver a escribir y renovar la vinculación para recibir el recibo.
- El enlace de autenticación es de un uso y 10 minutos. La contraseña se escribe exclusivamente en HTTPS, nunca en el historial de WhatsApp.
- La acción interactiva Subir comprobante da instrucciones; el residente debe adjuntar la foto mediante el clip/cámara de WhatsApp (la Cloud API no abre el selector del teléfono).
- Las fechas disponibles son públicas, pero no se revela qué vivienda reservó una fecha ni su información financiera sin autenticación.
- No se ha ejecutado una prueba real end-to-end desde esta rama en Hostinger, Meta o Titan; antes de ofrecer a las 231 viviendas, validar operaciones y conciliar al menos un pago real.
- Para revertir, desactivar WHATSAPP_BOT_ENABLED y reiniciar Node; los registros reales generados permanecen en MySQL.
