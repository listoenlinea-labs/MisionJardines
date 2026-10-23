# Verificación de pagos con Gmail API y OAuth 2.0

## Qué hace (sin Azure y sin contraseñas de aplicación)

El buzón personal `rocio_bahena65@hotmail.com` continúa recibiendo los avisos de Banco Azteca. Una **regla de redirección selectiva** envía esos mensajes a `misionjardines.gdl@gmail.com`. El backend consulta ese Gmail por la **API oficial con OAuth 2.0**, permiso de solo lectura `gmail.readonly`. No utiliza IMAP, contraseña normal, contraseña de aplicación, ni Microsoft Graph.

Todos los comprobantes entran como `PENDIENTE_VALIDACION` («En revisión»). Para confirmar se requiere un aviso con remitente auténtico y autenticación verificable en Gmail (DKIM + DMARC alineados), coincidencia **exacta** de clave de rastreo, importe, fecha, terminación **4409** y vivienda indicada por calle/número en el concepto. Si falta algún dato o hay más de una coincidencia, se conserva **En revisión**; no se tocan cuotas ni TAGs. No confiar solo en el texto «Banco Azteca» o un correo redirigido.

## Variables privadas del backend en Hostinger

```dotenv
PAGOS_GMAIL_MAILBOX=misionjardines.gdl@gmail.com
PAGOS_GMAIL_CLIENT_ID=CLIENT_ID_OAUTH_GOOGLE
PAGOS_GMAIL_CLIENT_SECRET=CLIENT_SECRET_OAUTH_GOOGLE
PAGOS_GMAIL_REFRESH_TOKEN=REFRESH_TOKEN_OAUTH_GOOGLE
PAGOS_BANK_FROM_ADDRESS=notificaciones@bazdigital.com
PAGOS_BANK_MAIL_SUBJECT=Notificación Banco Azteca
PAGOS_DESTINO_ULTIMOS4=4409
PAGOS_BANK_MAIL_MAX_DIAS=7
PAGOS_BANK_POLL_MS=45000
PAGOS_BANK_AUTO_VALIDATE=false
```

No configures `PAGOS_GMAIL_APP_PASSWORD`, `PAGOS_OUTLOOK_MAILBOX`, `PAGOS_MS_CLIENT_ID` ni `PAGOS_MS_REFRESH_TOKEN`. Nunca copies tokens o secrets a GitHub, el navegador del frontend, capturas o chats. La dirección `notificaciones@bazdigital.com` debe verificarse en «Mostrar original» de una notificación legítima.

## Crear credenciales Google OAuth

1. Con `misionjardines.gdl@gmail.com`, abre https://console.cloud.google.com/ y crea o selecciona un proyecto, por ejemplo **Misión Jardines Banco**. Este paso **no necesita Azure**. La API Gmail tiene una cuota estándar; revisa el estado de facturación y límites aplicables al proyecto.
2. En **APIs y servicios → Biblioteca**, busca **Gmail API** y pulsa **Habilitar**.
3. En **Google Auth Platform / Pantalla de consentimiento OAuth** configura la aplicación **Misión Jardines – Verificación bancaria**, tipo **Externo** si es una cuenta personal, correo de asistencia y contacto del desarrollador.
4. Agrega el permiso **`https://www.googleapis.com/auth/gmail.readonly`**. Es un permiso de lectura **restringido**, no permite enviar ni eliminar mensajes. Acepta solo las políticas aplicables y consulta los requisitos de verificación de Google.
5. En **Clientes / Credenciales → Crear cliente OAuth**, selecciona **Aplicación de escritorio**. Copia el Client ID y Client Secret. **No elijas aplicación web**: el asistente local usa una redirección `127.0.0.1` segura para aplicaciones de escritorio.
6. Si la aplicación permanece en estado **Pruebas**, añade `misionjardines.gdl@gmail.com` como usuario de prueba. Google puede requerir confirmar el acceso a una aplicación no verificada durante la prueba. **Los refresh tokens de apps externas en modo Pruebas caducan aproximadamente a los 7 días**, por lo que así no es apropiado para producción estable.
7. Para usarla regularmente, revisa **Publicación → En producción** y los requisitos de verificación/seguridad de los permisos restringidos, según tu caso de uso. Google puede requerir revisión e incluso evaluación de seguridad si se manejan datos restringidos en servidor. No presentes este permiso como «sin requisitos» ni habilites la automatización si aún no se cumplen.

Documentación de Google:
- https://developers.google.com/workspace/gmail/api/auth/scopes
- https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification
- https://developers.google.com/identity/protocols/oauth2/
- https://developers.google.com/workspace/gmail/api/reference/quota

## Autorizar Gmail desde tu PC Windows (no desde Hostinger)

Con Node.js 18+ y el código de este PR abierto en tu carpeta `MisionJardines`, inicia PowerShell desde esa carpeta:

```powershell
$env:PAGOS_GMAIL_CLIENT_ID="TU_CLIENT_ID"
$env:PAGOS_GMAIL_CLIENT_SECRET="TU_CLIENT_SECRET"
$env:PAGOS_GMAIL_MAILBOX="misionjardines.gdl@gmail.com"
node backend/scripts/autorizar-gmail-oauth.js
```

El script mostrará una URL oficial de Google que debes abrir localmente. Inicia sesión **solo** con `misionjardines.gdl@gmail.com` y acepta el permiso de leer Gmail. Google redirigirá a `127.0.0.1` y el script mostrará **`PAGOS_GMAIL_REFRESH_TOKEN`**. Pega el token directamente en la variable privada de Hostinger, sin espacios adicionales. El script verifica que el token pertenece al Gmail indicado y **no guarda credenciales en archivos**. Si no llega un refresh token, vuelve a autorizar con `prompt=consent` (el script ya lo solicita).

## Activación segura

1. Fusiona el PR de OAuth y despliega con `PAGOS_BANK_AUTO_VALIDATE=false`.
2. Confirma que la regla de Outlook **solo redirige Banco Azteca** y que una notificación auténtica llega a Gmail. En Gmail pulsa «Mostrar original» y verifica `From`, `Authentication-Results`, DKIM y DMARC. Si redireccionar rompe estas verificaciones, los depósitos deberán permanecer en revisión manual.
3. Ejecuta `node --test backend/test/validacion-pagos-gmail.test.js backend/test/gmail-api-oauth.test.js` en un checkout.
4. Comprueba un pago real de prueba: debe permanecer **En revisión** si el correo no existe, si la clave no corresponde, si la cuenta no termina en `4409`, o si el concepto no identifica la vivienda. Antes de activar autoaprobación contrasta también el depósito con el estado de cuenta.
5. **Solo después** de comprobar autorización, correos, reglas y seguridad, cambia `PAGOS_BANK_AUTO_VALIDATE=true` y reinicia el backend. El worker consulta únicamente si hay pagos pendientes y reutiliza exactamente la aprobación transaccional existente de cuotas y TAGs.

Una notificación recibida por correo **no demuestra liquidación bancaria irrevocable**. La validación de fondos definitiva requiere consultar el banco o un proveedor de conciliación oficial, especialmente antes de habilitar accesos físicos. El OAuth permite lectura de los mensajes del buzón autorizado, no exclusivamente de Banco Azteca: por eso debe ser una cuenta dedicada.
