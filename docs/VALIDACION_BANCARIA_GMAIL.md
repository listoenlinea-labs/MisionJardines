# Conciliación de depósitos con Gmail (sin Microsoft Azure)

## Arquitectura

Los avisos de Banco Azteca recibidos por la propietaria del buzón de Outlook deben **redirigirse de manera selectiva** a `misionjardines.gdl@gmail.com`, conservando el remitente original cuando Outlook lo permita. Gmail se consulta mediante IMAP sobre TLS 993 y contraseña de aplicación, en modo de **solo lectura** (EXAMINE, UID SEARCH, BODY.PEEK). No usa Microsoft Entra, Graph, Azure, ni guarda contraseñas en el repositorio.

El OCR bancario extrae la **clave de rastreo** del comprobante, pero la foto no acredita un depósito. Los pagos ingresan siempre en **En revisión**. El conciliador lee mensajes, valida remitente, encabezados de autenticación aportados por Gmail (DMARC+DKIM), concepto con calle y vivienda, importe exacto, fecha de operación, rastreo y cuenta destino **4409**. No basta el asunto genérico. Si hay ambigüedad, campos faltantes o fallo IMAP, el pago sigue en revisión; los TAGs no cambian.

## Configuración Hostinger (variables privadas del backend)

```dotenv
PAGOS_GMAIL_MAILBOX=misionjardines.gdl@gmail.com
PAGOS_GMAIL_APP_PASSWORD=TU_CONTRASENA_DE_APLICACION_DE_GMAIL
PAGOS_BANK_FROM_ADDRESS=notificaciones@bazdigital.com
PAGOS_BANK_MAIL_SUBJECT=Notificación Banco Azteca
PAGOS_DESTINO_ULTIMOS4=4409
PAGOS_BANK_MAIL_MAX_DIAS=7
PAGOS_BANK_POLL_MS=45000
PAGOS_BANK_AUTO_VALIDATE=false
```

`PAGOS_BANK_FROM_ADDRESS` debe contrastarse con **Mostrar original** en un mensaje real. La dirección anterior es una candidata derivada de los ejemplos; nunca confiar únicamente en el nombre visible del remitente. `PAGOS_GMAIL_APP_PASSWORD` es la contraseña específica de aplicación generada por Google y **no** la contraseña habitual de Gmail. En caso de que Google no permita contraseñas de aplicación, no se debe intentar iniciar sesión con la contraseña real: el acceso deberá cambiar a OAuth de Google.

No agregar variables `PAGOS_OUTLOOK_MAILBOX`, `PAGOS_MS_CLIENT_ID` ni `PAGOS_MS_REFRESH_TOKEN`. El PR anterior #257 se fusionó y sus módulos exclusivos se retiran con #258; **no se reescribe el historial de Git**.

## Preparar Gmail

1. Entrar a [Seguridad de la cuenta Google](https://myaccount.google.com/security) con la cuenta de Misión Jardines.
2. Activar **Verificación en dos pasos**.
3. Abrir [Contraseñas de aplicación](https://myaccount.google.com/apppasswords) y generar una para el backend (si esta función está disponible).
4. Guardar el valor de 16 caracteres **directamente** en la variable privada `PAGOS_GMAIL_APP_PASSWORD` en Hostinger. No usarlo en el frontend, capturas, correos ni GitHub.
5. Probar conexión saliente del servidor Hostinger a `imap.gmail.com:993`. Si Hostinger bloquea el puerto, el worker permanece sin servicio hasta resolver esa conectividad.

## Redirigir exclusivamente las notificaciones bancarias en Outlook

Con autorización de la titular de Hotmail: abrir Outlook web → Configuración → Correo → Reglas. Crear una regla desde el **remitente bancario auténtico** con acción **Redirigir a** `misionjardines.gdl@gmail.com`; si la redirección no está disponible, probar reenvío y revisar sus efectos en autenticación. No enviar la totalidad del correo personal. Evitar bucles, conservar el correo original y probar manualmente que llega a Gmail.

En Gmail abrir una notificación reenviada → menú → **Mostrar original**. Deben verse cabeceras de autenticación firmadas por Gmail y un remitente original verificable. Una redirección a veces hace fallar SPF o DKIM. **Si DMARC/DKIM no pasan o el remitente cambia a la cuenta personal**, este diseño falla cerrado y exige conciliación manual con información del banco; no eliminar estas verificaciones para forzar aprobación.

## Pruebas antes de encender aprobación automática

1. Fusionar y desplegar backend/frontend del PR #258 con `PAGOS_BANK_AUTO_VALIDATE=false`.
2. Conectarse a Gmail y asegurarse de que recibe un aviso real de depósito a `****4409`, no a `****8844`.
3. Crear un reporte de pago de prueba con su propia clave de rastreo y validar que aparezca de inmediato **En revisión** en Mis recibos y que el PDF inicial se marque como acuse no confirmado.
4. Verificar los encabezados del correo, el concepto con calle y número, la clave, la fecha y el monto. Probar explícitamente fechas erróneas, avisos de otra vivienda, claves inexistentes y cuentas ajenas; ninguno debe aprobarse.
5. Solo cuando pase la prueba con datos reales y permiso de los administradores, cambiar `PAGOS_BANK_AUTO_VALIDATE=true` y **reiniciar backend**. El worker revisa cada 45 segundos (o el intervalo configurado), y también se agenda después de recibir un nuevo reporte. Los residentes verán el cambio en Mis recibos tras su actualización periódica.
6. Revisar que las vigencias se actualicen por el mismo mecanismo de confirmación preexistente y que no se activen TAGs por notificaciones de cuentas distintas.

## Limitaciones

Una notificación de correo **no es confirmación irrevocable del banco**. Recomendamos confrontar con el estado de cuenta o una integración bancaria certificada antes de automatizar accesos físicos a gran escala. Los mensajes ambiguos siempre quedan en revisión manual. El lector IMAP limita cantidad y tamaño de mensajes, y no procesa archivos adjuntos. Su autenticación es por credencial de aplicación, sin privilegios específicos por remitente, así que el buzón Gmail dedicado debe usarse **solo para depósitos** y acceso administrado. Nunca se exponen credenciales por endpoints.

Ejecución de pruebas del proyecto: `node --test backend/test/validacion-pagos-gmail.test.js` desde la raíz.
