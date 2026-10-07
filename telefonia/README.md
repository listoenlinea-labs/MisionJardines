# Motor de telefonía de Misión Jardines

Estado inicial: **deshabilitado**. El único interruptor es
`backend/src/config/telefonia.js`:

```js
const TELEFONIA_HABILITADA = false;
```

Con `false`, el conmutador conserva el agente de WhatsApp para Windows.
No carga JsSIP, no se registra en SIP y no pide permiso al micrófono.
Con `true`, el navegador usa SIP sobre WSS y WebRTC; Asterisk enruta
la llamada hacia el puerto FXO del gateway, conectado a la salida TEL del módem.
Un fallo de telefonía muestra el error; no cambia silenciosamente a WhatsApp.

## Alcance implementado

Llamadas salientes nacionales desde el padrón, audio en el navegador,
estado de registro/llamada, colgar y silenciar micrófono. Asterisk limita
el FXO a una llamada y un máximo de 10 minutos por conversación. No incluye
transferencias, grabaciones, recepción de llamadas ni menú IVR.
El límite de 10 minutos se cambia en `Dial(...,L(600000))`.
Las consultas SIP requieren sesión de personal autorizada; un condómino no
puede obtener las credenciales. La extensión web es compartida y admite
un solo navegador registrado. No expone las credenciales del gateway.

## Preparación del servidor de voz

Asterisk es un proceso independiente del backend Express: necesita un VPS
Linux/Docker con UDP/RTP, certificados y acceso a la red del gateway. El
hosting web convencional de Node no sustituye ese servidor. Puede alojarse
fuera de la caseta; no requiere una PC local permanentemente encendida.

1. En el VPS, instalar Docker y Compose. Crear `telefonia/config` y
   `telefonia/certs`. Copiar los cuatro `.conf.example` de `asterisk/`
   a `config/` quitando `.example`.
2. Reemplazar **todos** los `REEMPLAZAR_...` de `pjsip.conf` por la IP
   pública del VPS, su IP VPN y dos contraseñas distintas aleatorias.
   El gateway y el VPS deben tener conectividad por VPN; `transport-gateway`
   se enlaza exclusivamente a la IP VPN del VPS. El transporte WSS usa el
   dominio público del VPS. Si está detrás de NAT, configurar también
   `external_media_address`, `external_signaling_address` y `local_net`
   de sus transportes, y verificar candidatos ICE según la topología.
3. Colocar certificado público válido y clave para ese dominio como
   `certs/fullchain.pem` y `certs/privkey.pem`. Permitir su lectura al usuario
   `asterisk` del contenedor; no publicar la clave. Renovarlos y reiniciar
   el PBX al renovar. No usar un certificado autofirmado en producción.
4. Permitir TCP 8089 (WSS) y UDP 10000–10100 (RTP/ICE) al servidor.
   Permitir SIP UDP 5060 **solo por la VPN**. No publicar AMI/ARI ni el
   puerto HTTP 8088. No se necesitan reenvíos públicos SIP al módem.
5. Ejecutar en esta carpeta:

   ```sh
   docker compose build
   docker compose up -d
   docker compose exec pbx asterisk -rx 'pjsip show endpoints'
   docker compose exec pbx asterisk -rx 'http show status'
   ```

El contenedor instala Asterisk desde Ubuntu 24.04. Comprobar que estén
cargados `res_http_websocket`, `res_pjsip_transport_websocket` y los módulos
de DTLS/SRTP. El certificado HTTPS de WSS es independiente del certificado
DTLS autogenerado para audio. Este despliegue debe probarse antes de activar.

## Configuración del HT813 (o un FXO equivalente)

- Conectar **TEL del módem → FXO del gateway**. El FXS es para el teléfono.
- Configurar en la cuenta **FXO**: SIP Server = IP VPN del VPS, puerto 5060,
  SIP User ID y Authenticate ID = `fxo-gateway`; contraseña = la de
  `fxo-gateway-auth`. SIP Registration = Yes.
- Usar G.711 PCMU/PCMA, marcado de una etapa (One Stage Dialing) y permitir
  llamadas VoIP → PSTN. Ajustar los parámetros regionales de México,
  detección de desconexión y tono de ocupado según la línea.
- Verificar `pjsip show contacts`: `fxo-gateway` debe tener un contacto
  disponible. Una llamada saliente envía los diez dígitos como usuario
  de la solicitud SIP al gateway.
- La conectividad VPN puede proporcionarla el router o un router pequeño
  dedicado si el gateway no tiene VPN. Ninguna plantilla supone que el
  HT813 tenga cliente VPN integrado.

No se ha comprobado el marcado real ni los tonos de la línea Telmex: falta
el hardware. Consultar el manual del firmware adquirido para estos ajustes.

## Configuración del backend y activación

En el entorno privado del backend:

```dotenv
TELEFONIA_WSS_URL=wss://voz.tu-dominio.com:8089/ws
TELEFONIA_SIP_DOMAIN=voz.tu-dominio.com
TELEFONIA_SIP_USER=caseta-web
TELEFONIA_SIP_PASSWORD=misma_clave_de_caseta_web_auth
```

STUN es opcional. Si la red exige relay, configurar un TURN real mediante
`TELEFONIA_TURN_URL`, `TELEFONIA_TURN_USER` y `TELEFONIA_TURN_PASSWORD`.
No se usan servidores públicos de terceros por defecto. Estas credenciales
se entregan únicamente a personal autorizado, sin caché, y no se guardan
en localStorage. El PBX restringe la extensión a números nacionales; no
es una credencial con privilegios administrativos. Como cualquier extensión,
un usuario autorizado puede usarla fuera de la interfaz: para exigir destinos
exclusivos del padrón también en el PBX hará falta un dialplan con lista de
destinos sincronizada o autorización por llamada.

Una vez preparado lo anterior, cambiar **solo** `TELEFONIA_HABILITADA` a
`true`, desplegar el backend y las dos versiones del frontend y reiniciar
el backend. No hay interruptor duplicado en el navegador. El JavaScript
del conmutador está en archivos externos. JsSIP 3.10.1 está empaquetado
localmente en `backend/public/vendor`; no se descarga de un CDN al llamar.
Para reproducir el bundle: `cd telefonia/client`, `npm ci` y `npm run build`.

Comprobar con un teléfono de prueba: timbrado, audio en ambos sentidos,
colgar desde ambos extremos, rechazo/ocupado, permisos de micrófono,
caída de VPN y un segundo intento mientras la línea está ocupada.
No llamar a residentes como prueba sin acordarlo previamente.

Para volver a WhatsApp: cambiar la misma constante a `false`, reiniciar
backend y recargar el conmutador. El agente de WhatsApp debe seguir instalado.

## Fuentes técnicas

- https://docs.asterisk.org/Configuration/WebRTC/Configuring-Asterisk-for-WebRTC-Clients/
- https://jssip.net/documentation/3.10.x/api/ua/
- https://www.grandstream.com/products/gateways-and-atas/analog-telephone-adaptors/product/ht813
