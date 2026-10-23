# Validación de depósitos con Outlook (Banco Azteca)

## Principio de seguridad

El OCR de una captura de pantalla no acredita el depósito. El aviso de correo tampoco es un estado de cuenta bancario certificado: es una **evidencia adicional**, que se concilia únicamente si llegó al buzón mediante Microsoft Graph con autenticación DMARC acreditada, desde la dirección esperada, con **clave de rastreo**, **monto**, **fecha**, **terminación de cuenta** y **concepto que identifique calle y número**. Si falta algún dato, el pago permanece `PENDIENTE_VALIDACION` («En revisión») para resolución humana. El sistema no marca un pago como validado por el simple hecho de que alguien suba una imagen.

**Especialmente importante:** en las capturas proporcionadas existen avisos bancarios que identifican cuentas con diferentes terminaciones. Los depósitos notificados a una cuenta terminada en `8844` nunca se validarán para la cuenta configurada con `4409`. No se habilitan TAGs por una coincidencia parcial. Para una validación bancaria con mayor valor probatorio, el siguiente paso será integrar una API/transacción confirmada del banco o proveedor financiero.

## Variables privadas de Hostinger (backend)

```dotenv
PAGOS_OUTLOOK_MAILBOX=rocio_bahena65@hotmail.com
PAGOS_MS_CLIENT_ID=ID_DE_TU_APLICACION_MICROSOFT
PAGOS_MS_REFRESH_TOKEN=TOKEN_OBTENIDO_CON_AUTORIZACION_OAUTH
PAGOS_BANK_FROM_ADDRESS=DIRECCION_EXACTA_DEL_REMITENTE_BANCARIO
PAGOS_BANK_MAIL_SUBJECT=Notificación Banco Azteca
PAGOS_DESTINO_ULTIMOS4=4409
PAGOS_BANK_MAIL_MAX_DIAS=7
PAGOS_BANK_POLL_MS=45000
PAGOS_BANK_AUTO_VALIDATE=false
```

No coloques la contraseña Hotmail, variables del buzón ni tokens en el frontend ni el repositorio. Confirma `PAGOS_BANK_FROM_ADDRESS` abriendo las propiedades del correo legítimo: **no uses el nombre visible del remitente**. El valor debe ser la dirección exacta comprobada. La app consulta el correo configurado, sin direcciones fijadas en el código.

**Activación por fases:** mantener `PAGOS_BANK_AUTO_VALIDATE=false` durante la configuración y pruebas. Cuando hayas revisado avisos auténticos a `4409`, sus encabezados de autenticación y el nombre de calle/número en el concepto, cambiar a `true` y reiniciar el backend. Si el buzón falla o una coincidencia es ambigua, se conserva «En revisión» y no se llama a la rutina de TAGs. La rutina previa de confirmación (recargos + vigencias) se reutiliza sin cambiar sus cálculos.

## Microsoft: autorización con OAuth2

1. En [Microsoft Entra admin center](https://entra.microsoft.com/) registra una aplicación que acepte **Cuentas personales de Microsoft**. Habilita *Allow public client flows* porque se utilizará el flujo seguro **Device Code**, sin capturar contraseñas.
2. En *API permissions* agrega permisos **delegados** `Mail.Read` y `User.Read`; `offline_access` se solicitará en la autorización. No solicites `Mail.ReadWrite`, `Mail.Send` ni acceso a otros buzones.
3. Copia el **Application (client) ID** a `PAGOS_MS_CLIENT_ID`.
4. En tu PC con Node.js 18 o posterior (no en el servidor público), ejecuta:
   ```powershell
   $env:PAGOS_MS_CLIENT_ID="TU_CLIENT_ID"
   node backend/scripts/autorizar-buzon-azteca.js
   ```
5. El script indicará la página de Microsoft y un código temporal. Inicia sesión con la cuenta receptora del banco y acepta los permisos delegados. Copia el `PAGOS_MS_REFRESH_TOKEN` generado **directamente a Hostinger** y elimina cualquier historial de terminal que lo exponga. No lo compartas en un chat.
6. Configura las variables de entorno del **backend** en Hostinger, vuelve a desplegar y reinicia. Nunca publiques archivos `.env` ni captures los tokens en logs.
7. Prueba con un abono real a la cuenta terminada `4409`: al reportar debe aparecer **En revisión**; después de una coincidencia estricta, **Validado**. Prueba también un aviso con terminación `8844`, monto distinto, clave ausente o concepto de otra vivienda: debe permanecer en revisión.

El servicio renueva el token de acceso OAuth en memoria. La credencial de actualización de Microsoft puede caducar o ser revocada: de ocurrir, repite la autorización Device Code y reemplaza el token de Hostinger. No utiliza contraseñas ni acceso IMAP básico.

## Qué se modifica

- OCR en navegador y servidor: reconoce una clave de rastreo **etiquetada explícitamente**, incluso en una línea posterior, y la prioriza como identificador del reporte. Nunca adivina la clave a partir de otras cifras sueltas.
- Los reportes se guardan primero en `PENDIENTE_VALIDACION`. La bandeja **MIS RECIBOS** refleja la revisión y actualización posterior sin volver a subir la captura.
- Cada revisión compara `clave + importe exacto en centavos + fecha bancaria + terminación + emisor autenticado + concepto asociado a vivienda`. No es suficiente el asunto genérico «Notificación Banco Azteca».
- La consulta es de solo lectura, del **Inbox** de la cuenta expresamente autorizada. No guarda el cuerpo de los correos. Un hash único del identificador del mensaje queda asociado al pago validado para evitar doble acreditación.
- La operación reutiliza la transacción existente de aprobación administrativa. Los cambios financieros y los TAGs siguen siendo ejecutados **solo después** del resultado `VALIDADO`. No modificar las reglas de deuda extraordinaria ni Casa club relativas a TAGs.
- La cuenta debe disponer de permiso del titular para su consulta por el backend. Restringe y audita quién puede leer la configuración en Hostinger.

## Limitaciones y revisión adicional

Las notificaciones bancarias suelen tener asunto genérico; **la clave se busca en el contenido**, no se exige al asunto. Outlook puede no suministrar los encabezados necesarios en todos los correos, por lo que esas notificaciones se quedarán en revisión. Algunos conceptos bancarios no incluyen calle y número; también requerirán revisión humana. Tampoco se da por acreditado un correo antes de que el banco haya confirmado de forma irreversible la transacción. Para los casos de mayor riesgo, concilia con el estado de cuenta o con una integración bancaria autenticada.

En producción, valida primero la migración no destructiva de `correo_bancario_hash`, la compatibilidad del proveedor de Hostinger con conexiones salientes a Graph y la interpretación real de los correos del banco; no se han leído correos privados durante la preparación de este PR.
