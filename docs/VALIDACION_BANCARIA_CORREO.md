# Verificación de pagos por reenvío del administrador

## Origen: solo remitente, sin autenticación

Por petición explícita del usuario del 23/oct/2026, se acepta únicamente el From
exterior exacto configurado en PAGOS_BANK_FORWARD_FROM_ADDRESS y el asunto bancario
configurado (admite prefijos RV:/Fwd:). Se ignoran DKIM, DMARC, ARC y
Authentication-Results. No se requiere PAGOS_IMAP_AUTH_SERVER.
PAGOS_BANK_FROM_ADDRESS ya no autoriza correos directos del banco.

Esta comprobación NO autentica al administrador: el From puede falsificarse y
podría utilizarse para provocar una acreditación indebida. Los contadores API
legados avisosAutenticados y el estado SIN_AUTENTICACION se conservan por
compatibilidad, pero significan avisos con remitente/asunto autorizados.
La interfaz y el diagnóstico ya no anuncian autenticación criptográfica.

Se conservan IMAP TLS, monto, referencia/clave del mismo tipo, fecha bancaria,
cuenta destino, vivienda, coincidencia única y hash consumido una vez.
Sin correo configurado o con From distinto no se autoriza. Una mención de Rocío
o del banco dentro del cuerpo, Resent-From o Return-Path no sustituye From.

## Configuración

```dotenv
PAGOS_IMAP_HOST=servidor-imap-del-proveedor
PAGOS_IMAP_PORT=993
PAGOS_IMAP_MAILBOX=buzon@ejemplo.test
PAGOS_IMAP_PASSWORD=CONTRASENA_PRIVADA
PAGOS_BANK_FORWARD_FROM_ADDRESS=administrador@ejemplo.test
PAGOS_BANK_MAIL_SUBJECT=Notificación Banco Azteca
PAGOS_DESTINO_ULTIMOS4=1234
PAGOS_BANK_MAIL_MAX_DIAS=7
PAGOS_BANK_POLL_MS=45000
PAGOS_BANK_AUTO_VALIDATE=false
```

Conservar la configuración real en hPanel, nunca en commits. Reiniciar/desplegar
backend para aplicar variables; export en SSH no cambia la aplicación en marcha.
El worker exige flag true. El diagnóstico de solo lectura no lo requiere:
`NODE_ENV=production node scripts/probar-buzon-pagos.js` desde backend.

La regla de Outlook debe Reenviar a, con el administrador como From. Desactivar
redirecciones duplicadas; dos avisos coincidentes detienen la conciliación.
La fecha se extrae del bloque entre Recibiste de otro banco/otra cuenta y A tu
cuenta, no del encabezado Enviado del reenvío. Sin fecha válida/única no acredita.
El importe recibido no procede de Comisión o Saldo. La cuenta enmascarada admite
3 o 4 dígitos; si hay 4 se comparan completos.

No requiere SQL. Requiere backend y frontend para mostrar el nuevo diagnóstico.
La validación directa DKIM propuesta se canceló antes de integrar dependencias.
Esta entrega sustituye el enfoque de lista de servidores del PR #283 y conserva
su corrección de fecha; no es necesario fusionar aquel PR para usar esta entrega.
