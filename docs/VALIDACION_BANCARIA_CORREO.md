# Verificación de pagos por correo bancario o reenvío del administrador

## Origen autorizado

El backend consulta el buzón dedicado de Listo en Línea por IMAP cifrado, en solo
lectura. La conexión SMTP de invitaciones es independiente. El correo puede ser:

1. Un aviso directo del banco configurado en `PAGOS_BANK_FROM_ADDRESS`.
2. Un aviso reenviado por el correo exacto del administrador configurado en
   `PAGOS_BANK_FORWARD_FROM_ADDRESS`, según la petición del usuario del 22/oct.

Para el segundo caso el encabezado exterior se autentica como del administrador:
no se exige que `From` ni la firma exterior pertenezcan al banco original. La fuente
confiada es el administrador que reenvía el contenido; no se afirma que la firma
bancaria original haya sobrevivido. Se exige coincidencia exacta de su dirección,
DKIM y DMARC aprobados para su dominio en el resultado del receptor configurado.
Otro correo del mismo dominio no está autorizado. Un texto «De: …» dentro del
cuerpo o la mera apariencia del remitente no autoriza el mensaje.

Sin configurar el nuevo remitente, se conserva exclusivamente el banco directo.
Ambos modos exigen el asunto bancario configurado (acepta prefijos RV:/Fwd:),
clave de rastreo, importe en centavos, fecha bancaria y concepto con calle/número
coincidentes. El aviso debe ser reciente y la coincidencia única. El hash del
correo se sigue consumiendo una vez en la transacción de confirmación existente.

## Monto en las tablas del aviso

El encabezado «Recibiste de otro banco» puede estar en una fila y el importe en
la siguiente. El lector admite los espacios y saltos producidos por esas filas,
tanto en texto como en HTML. El importe tiene que seguir directamente al
encabezado, antes de cualquier otro campo: no se usa una cantidad encontrada en
Comisión, Saldo o Concepto cuando falta el monto recibido.

Se admiten importes enteros o con dos decimales y separadores de miles válidos.
Si aparecen varios importes recibidos distintos en el mensaje, no se elige uno
arbitrariamente. Las copias HTML/texto del mismo importe no se suman.

## Cuenta receptora en el aviso

`PAGOS_DESTINO_ULTIMOS4` conserva cuatro dígitos. El lector admite el formato de
aviso «A tu cuenta ***234» o «A tu cuenta ****1234», usando 1234 como ejemplo:

- Si se muestran 3, deben ser los últimos tres de los cuatro configurados.
- Si se muestran 4, se comparan los cuatro: 9234 no coincide con 1234.
- Sin terminación, con menos de tres dígitos o con destinos ambiguos, no coincide.

No se completan dígitos ausentes. Esta compatibilidad solo afecta al aviso de
correo; el OCR del comprobante del residente conserva la validación de destino,
folio/rastreo, fecha, hora y monto del servidor.

## Variables privadas del backend

```dotenv
PAGOS_IMAP_HOST=servidor-imap-del-proveedor
PAGOS_IMAP_PORT=993
PAGOS_IMAP_MAILBOX=buzon-dedicado@ejemplo.test
PAGOS_IMAP_PASSWORD=CONTRASENA_PRIVADA_DEL_BUZON
PAGOS_IMAP_AUTH_SERVER=

PAGOS_BANK_FROM_ADDRESS=
PAGOS_BANK_FORWARD_FROM_ADDRESS=
PAGOS_BANK_MAIL_SUBJECT=Notificación Banco Azteca
PAGOS_DESTINO_ULTIMOS4=1234
PAGOS_BANK_MAIL_MAX_DIAS=7
PAGOS_BANK_POLL_MS=45000
PAGOS_BANK_AUTO_VALIDATE=false
```

Los valores son ejemplos. Mantener la configuración real de IMAP, datos bancarios
y remitente directo ya existentes. Agregar `PAGOS_BANK_FORWARD_FROM_ADDRESS` con el
correo real desde el que el administrador reenvía las notificaciones. No configurar
un dominio completo ni un nombre visible; la dirección tiene que coincidir con
el `From` exterior del mensaje recibido en el buzón dedicado.

`PAGOS_IMAP_AUTH_SERVER` es el nombre que agrega el resultado Authentication-Results
del receptor; no equivale necesariamente al host IMAP. Confirmarlo con el mensaje
recibido. Acepta uno o varios nombres exactos separados por comas, por ejemplo
`mx1.proveedor.example,mx2.proveedor.example`. Agregar solo servidores del receptor
confirmados en los encabezados originales; no usar comodines ni servidores
intermedios. DKIM/DMARC deben pasar juntos en un mismo resultado autorizado; no
se combinan resultados de distintos servidores. El OR banco/administrador y sus
remitentes exactos permanecen vigentes. Una firma Hotmail válida no autoriza por
sí sola un mensaje cuyo From siga siendo el banco y cuyo DMARC falle.
Las credenciales del buzón son privadas y no se incluyen en el código.
Basta uno de los dos remitentes autorizados para configurar el worker, además de
IMAP, receptor de autenticación, cuenta destino y flag de autovalidación.

Configurar las variables en el alojamiento del backend y volver a desplegar o
reiniciar. Un `export` en una sesión SSH solo modifica esa sesión; no actualiza
las variables de la aplicación que Hostinger ya ejecuta.

## Diagnóstico y pruebas

El log «Revisión de notificaciones buzón IMAP iniciada» confirma programación,
no conexión ni coincidencia. El worker solo consulta el buzón si hay pagos pendientes.
El mensaje «Estimating resolution as …» pertenece al OCR, no a IMAP.

Con Node y dependencias disponibles, desde la raíz del repositorio:

```sh
NODE_ENV=production node backend/scripts/probar-buzon-pagos.js
```

Si el despliegue tiene `scripts/` y `src/` directamente en su raíz:

```sh
NODE_ENV=production node scripts/probar-buzon-pagos.js
```

El script carga el entorno en la misma ubicación relativa que el servidor, sin
sobrescribir variables ya inyectadas. Si el alojamiento separa SSH y la aplicación,
proporcionar las mismas variables al proceso de diagnóstico sin publicar secretos.
Usar el ejecutable Node de la versión del servidor cuando no esté en PATH.

El diagnóstico es de solo lectura. Informa reenvíos autenticados del administrador,
datos completos y campos faltantes por separado, sin imprimir contenidos ni
credenciales. El flag no necesita activarse para ejecutar el diagnóstico manual.
La configuración del receptor y el remitente sí debe estar disponible para clasificar
la autenticación. No aprueba pagos ni modifica TAGs o mensajes.

Pruebas simuladas desde la raíz:

```sh
PAGOS_IMAP_AUTH_SERVER=mx.hostinger.com node --test backend/test/banco-correo-monto-tablas.test.js backend/test/validacion-pagos-reenvio-admin.test.js backend/test/diagnostico-buzon-pagos.test.js backend/test/validacion-pagos-correo.test.js
```

El servidor de autenticación de ese comando es solo el fixture de las pruebas;
no reemplaza el valor real del proveedor. Después de desplegar y configurar el
remitente, comprobar el diagnóstico y un depósito real contra su aviso reenviado.
La presencia del código o una prueba simulada no acredita esa conciliación real.

## Fecha del depósito en reenvíos

La fecha se extrae del bloque entre «Recibiste de otro banco/otra cuenta» y
«A tu cuenta», después de convertir HTML a texto. Las fechas de «Enviado», Date
y otras cabeceras del reenvío no sustituyen la fecha bancaria. Sin bloque/fecha
válida o con fechas distintas entre las copias del aviso, se deja vacía y no
se confirma. Se mantiene la equivalencia SPEI existente al cotejar el pago.
