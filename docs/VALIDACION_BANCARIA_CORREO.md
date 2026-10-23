# Verificación bancaria desde soluciones@listoenlinea.com

## Objetivo

Misión Jardines consulta directamente el buzón **`soluciones@listoenlinea.com`** mediante IMAP cifrado (TLS), en **solo lectura**. La propietaria de `rocio_bahena65@hotmail.com` configura el envío o redirección únicamente de notificaciones de Banco Azteca a la dirección de Listo en Línea. No se utiliza Google, OAuth, Azure, Gmail ni Microsoft Graph.

**Proveedor:** el ejemplo usa Hostinger Email, cuya configuración oficial es IMAP `imap.hostinger.com`, puerto `993`, SSL/TLS. Si el dominio usa otro proveedor, sustituye el hostname por el servidor IMAP real del buzón. Los servidores de alojamiento web y de **correo electrónico** pueden ser distintos.

## Variables privadas en Hostinger, en el BACKEND

```dotenv
PAGOS_IMAP_HOST=imap.hostinger.com
PAGOS_IMAP_PORT=993
PAGOS_IMAP_MAILBOX=soluciones@listoenlinea.com
PAGOS_IMAP_PASSWORD=CONTRASENA_PRIVADA_DEL_BUZON
PAGOS_IMAP_AUTH_SERVER=mx.hostinger.com

PAGOS_BANK_FROM_ADDRESS=notificaciones@bazdigital.com
PAGOS_BANK_MAIL_SUBJECT=Notificación Banco Azteca
PAGOS_DESTINO_ULTIMOS4=4409
PAGOS_BANK_MAIL_MAX_DIAS=7
PAGOS_BANK_POLL_MS=45000
PAGOS_BANK_AUTO_VALIDATE=false
```

`PAGOS_IMAP_PASSWORD` es la contraseña propia del **buzón** y no la de la cuenta Hostinger del propietario. Si la cuenta ya utiliza SMTP en otra parte del negocio no es necesario cambiar SMTP, pero sí almacenar aquí la credencial IMAP de forma privada. Nunca mostrarla en capturas, commits o mensajes.

`PAGOS_IMAP_AUTH_SERVER` indica el servidor que **agrega** las cabeceras de autenticación del destinatario; `mx.hostinger.com` es un valor de ejemplo que **debe confirmarse examinando las cabeceras reales** del proveedor. No inventar este dato ni quitar la validación si no coincide; de lo contrario, el pago queda en revisión. El valor de `PAGOS_BANK_FROM_ADDRESS` también debe verificarse con los correos genuinos; no basta el nombre visible de Banco Azteca.

Eliminar o no crear estas variables obsoletas: `PAGOS_GMAIL_MAILBOX`, `PAGOS_GMAIL_APP_PASSWORD`, `PAGOS_GMAIL_CLIENT_ID`, `PAGOS_GMAIL_CLIENT_SECRET`, `PAGOS_GMAIL_REFRESH_TOKEN`, `PAGOS_OUTLOOK_MAILBOX`, `PAGOS_MS_CLIENT_ID`, `PAGOS_MS_REFRESH_TOKEN`.

## Configurar recepción de notificaciones

En Outlook de la titular conservar la regla **De: notificaciones@bazdigital.com**, acción «Redirigir a»: `soluciones@listoenlinea.com`. Probar manualmente con un mensaje real. Alternativamente, si el banco admite varios correos de notificación, añadir `soluciones@listoenlinea.com` como destinatario directo del banco. No reenviar toda la bandeja privada.

La **redirección** a veces altera los resultados de autenticación SPF/DKIM/DMARC: si los mensajes redirigidos no conservan suficientes pruebas de origen, la autoaprobación los dejará **En revisión** hasta que un administrador confirme contra el movimiento en el banco.

## Flujo de aplicación

- La persona sube su comprobante: OCR lee el campo etiquetado «Clave de rastreo», folio, monto, fecha, hora y destino. Se guarda como `PENDIENTE_VALIDACION` y aparece inmediatamente como **En revisión** en Mis recibos. El PDF provisional es un acuse, **no** un recibo de pago confirmado.
- Worker lee solo los mensajes recientes del buzón configurado en IMAP. Para aprobar, un solo mensaje verificable debe coincidir con **clave de rastreo, fecha, importe exacto, terminación receptora 4409 y concepto que identifique calle y número**. El remitente y asunto deben coincidir con los valores configurados; las cabeceras DMARC y DKIM deben pasar y corresponder al dominio esperado.
- Si falta algún dato o los mensajes son ambiguos, el pago **sigue En revisión**. Ningún error IMAP, credencial o autenticación puede confirmar un pago.
- Al validar se reutiliza la transacción de confirmación que ya existe en el backend, incluidos recargos y vigencias. **No se cambió el algoritmo de TAGs.** Se guarda una huella única del mensaje para impedir reutilizar el mismo correo con otros pagos.
- El frontend consulta periódicamente el estado de los pagos y muestra «Validado» cuando el backend confirma.
- La notificación bancaria por correo no es equivalente a una conciliación bancaria certificada ni garantiza irreversibilidad del depósito. Para acceso físico, se recomienda confrontar también el estado de cuenta o una integración oficial del banco.

## Pruebas antes de habilitar la autoaprobación

1. Fusionar y desplegar este PR **con `PAGOS_BANK_AUTO_VALIDATE=false`**. Confirmar que `soluciones@listoenlinea.com` se puede consultar en webmail y que recibió un aviso real destinado a `4409`.
2. Guardar las variables privadas del backend en Hostinger. Si es Hostinger Email, validar el nombre del servidor en **Emails → Administrar → Conectar aplicaciones y dispositivos**. El servidor necesita conexión saliente a `imap.hostinger.com:993`.
3. Desde el backend, ejecutar `node backend/scripts/probar-buzon-pagos.js`. Este diagnóstico se conecta a IMAP, cuenta avisos con autenticación verificable y **no genera recibos, no aprueba pagos ni cambia TAGs**. Nunca imprime el contenido de los correos ni credenciales.
4. Ejecutar `node --test backend/test/validacion-pagos-correo.test.js` desde la raíz del repositorio.
5. Verificar en la fuente original de una notificación `Authentication-Results`, el servidor receptor, la cuenta y el dominio. Si un mensaje proveniente de Banco Azteca termina en `8844`, no puede acreditar un depósito a `4409`.
6. Registrar un pago de prueba y verificar **En revisión** antes de la confirmación. Probar claves, importes, fechas, números de casa y terminaciones falsos. Todos esos casos deben permanecer en revisión.
7. Solo después de pruebas con depósito real, origen autenticado y aprobación administrativa, cambiar a `PAGOS_BANK_AUTO_VALIDATE=true` y reiniciar el backend. Si alguna validación no pasa, mantenerla desactivada.

No usar la contraseña personal de un correo no dedicado para este proceso si existe una alternativa: el lector puede acceder a la bandeja completa. Limita el acceso a los responsables del proyecto, conserva secretos únicamente en el entorno del backend y no registra cuerpos de mensajes.


## Diagnóstico cuando un pago permanece en revisión

El aviso de arranque «Revisión de notificaciones buzón IMAP iniciada» solo
confirma programación del worker. Sin reportes pendientes no consulta el buzón,
y una notificación que no coincide puede descartarse sin imprimir otro mensaje.
«Estimating resolution as …» pertenece al OCR; no es por sí solo un error IMAP.

Desde la raíz del proyecto, con el entorno correcto del backend:

```sh
NODE_ENV=production node backend/scripts/probar-buzon-pagos.js
```

Para desarrollo sustituir production por development. El script carga
`backend/.env.<NODE_ENV>` igual que el servidor, conservando las variables ya
inyectadas por el alojamiento. La corrección del 22/oct retira la búsqueda
incorrecta de `.env` en la raíz.

Los contadores separan autenticación de datos legibles: mensajes completos sin
autenticación bancaria no autorizan pagos. Un aviso con solo tres dígitos de
cuenta no proporciona la terminación exacta de cuatro exigida; no se completa
por suposición. Un reenvío autenticado como mensaje de otra cuenta no demuestra
el origen bancario de su contenido. Revisar recepción directa del aviso original
si la redirección no conserva evidencia suficiente.

Si ni siquiera aparece el reporte en Mis recibos, revisar la respuesta HTTP de
Reportar pago y su mensaje en pantalla: el OCR precede al guardado, mientras la
conciliación IMAP ocurre después. El diagnóstico de correo no demuestra que la
imagen haya superado las validaciones de extracción/destino.
