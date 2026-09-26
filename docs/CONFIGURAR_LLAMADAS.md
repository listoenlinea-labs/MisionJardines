# Llamadas desde Conmutador

El botón **Llamar** abre un panel dentro de Misión Jardines. Usa el micrófono y las bocinas de la computadora; ya no abre el selector de aplicaciones del sistema. Las llamadas reales requieren una cuenta de Twilio Programmable Voice con saldo y un identificador de llamada autorizado. Twilio cobra por uso.

## Configuración en Twilio

1. En tu cuenta de Twilio, habilita Programmable Voice y adquiere o verifica un número que pueda usarse como identificador de llamadas salientes en México. Configura los permisos de llamadas a México y confirma las tarifas vigentes en la consola de tu cuenta.
2. Crea una **API Key estándar**. Conserva su SID (`SK...`) y el secreto; el secreto sólo se muestra al crearla.
3. Crea una **TwiML App**. En **Voice Configuration → Request URL** introduce `https://api-misionjardines.listoenlinea.host/api/voz/salida`, con método **HTTP POST**. Conserva el SID (`AP...`).
4. En las variables de entorno del backend en Hostinger, añade:

   | Variable | Valor |
   | --- | --- |
   | `TWILIO_ACCOUNT_SID` | Account SID (`AC...`) |
   | `TWILIO_AUTH_TOKEN` | Auth Token de esa cuenta |
   | `TWILIO_API_KEY` | SID de la API Key (`SK...`) |
   | `TWILIO_API_SECRET` | Secreto de la API Key |
   | `TWILIO_TWIML_APP_SID` | SID de la TwiML App (`AP...`) |
   | `TWILIO_CALLER_ID` | Número emisor autorizado, en formato `+52` y diez dígitos |
   | `APP_BASE_URL` | `https://api-misionjardines.listoenlinea.host` |

5. Publica el backend actualizado en Hostinger y el frontend actualizado en GitHub Pages. Las credenciales van **sólo** en Hostinger: no las escribas en HTML, JavaScript ni GitHub.
6. Inicia sesión con una cuenta de Seguridad o Administración, abre **Conmutador**, localiza un residente con número mexicano válido y pulsa **Llamar**. Acepta el permiso del micrófono. El panel mostrará el estado, **Silenciar** y **Colgar**.

Si faltan variables, el panel indicará que la telefonía aún no está configurada y no intentará abrir otra aplicación. Los números deben estar registrados en el padrón como diez dígitos o `+52` seguido de diez dígitos. Un número inválido o un residente inactivo no se marca. En computadoras de guardia conviene usar audífonos con micrófono y una conexión estable. Las llamadas en segundo plano en navegadores móviles pueden interrumpirse.
