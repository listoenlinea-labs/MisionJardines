# Integración de cámaras Dahua en Seguridad

## Estado y limitación de red

Las capturas del 13 de octubre de 2026 muestran un grabador Dahua
en 192.168.1.101, con al menos 11 cámaras: Jardines 1, Portón 1,
Magnolias, Rosas, Portón 2, Cancha, Jardines 2, Gardenias,
Lirios, Peatonal 1 y Peatonal 2.

Su selector TCP y su página web con complemento NO son un
stream de video HTML5. Tampoco Hostinger puede llegar directamente a
192.168.1.101, porque esa IP solo existe dentro de la LAN de caseta.
**Un PR no conecta físicamente la red local.**

## Pluma

Seguridad ya utiliza la ruta autenticada POST /api/zkteco/pluma del C3-200,
con exactamente los mismos comandos ABRIR y CERRAR que ZKTeco. El PR
conserva el servicio y los roles existentes; solo mejora la interfaz
y la confirmación de la orden. La animación no es una lectura de sensor.

## Arquitectura del puente seguro

1. En una PC/mini-PC administrada de la caseta, crear un usuario Dahua
   dedicado de SOLO VISUALIZACIÓN. No usar admin para transmisiones.
2. Verificar que cada canal H.264 funcione primero en VLC mediante RTSP.
3. Configurar MediaMTX (u otro restreamer) dentro de la red local.
4. Exponer solamente HLS por un proxy HTTPS privado, con autenticación
   Bearer obligatoria y acceso limitado al backend de Misión Jardines.
   Nunca exponer sin protección el RTSP 554, la interfaz Dahua ni MediaMTX.
5. En Hostinger configurar el proxy HLS con variables de entorno.
6. En Seguridad, el personal con rol autorizado puede seleccionar un
   canal: el backend obtiene el video desde el gateway y envía listas
   y segmentos mediante enlaces firmados de 15 minutos. Ninguna
   contraseña Dahua ni ruta RTSP llega al navegador.

## RTSP Dahua (referencia)

Formato del substream:

    rtsp://USUARIO_VISOR:CLAVE_PRIVADA@192.168.1.101:554/cam/realmonitor?channel=1&subtype=1

Ajustar channel=1 a 2, 3, etc. según la asignación REAL del NVR.
El subtipo 1 normalmente usa el substream, recomendable para internet
si está configurado como H.264. Las claves del dispositivo solo van
en la configuración privada de MediaMTX, NUNCA en GitHub/HTML/MySQL.

Un ejemplo de configuración PRIVADA de MediaMTX, fuera del repo:

    hlsVariant: mpegts
    paths:
      jardines-1:
        source: rtsp://USUARIO_VISOR:CLAVE_PRIVADA@192.168.1.101:554/cam/realmonitor?channel=1&subtype=1
      porton-1:
        source: rtsp://USUARIO_VISOR:CLAVE_PRIVADA@192.168.1.101:554/cam/realmonitor?channel=2&subtype=1

Configurar HLS MPEG-TS inicialmente (hlsVariant: mpegts) para evitar dependencias de funciones Low-Latency que requieren parámetros adicionales en el proxy.

Comprobar en la máquina local:
    http://127.0.0.1:8888/jardines-1/index.m3u8

Ese puerto **no se debe abrir a Internet**. El proxy HTTPS debe
validar el token Bearer recibido desde el backend, no limitarse a CORS.

## Variables exclusivamente en backend Hostinger

    CAMERAS_HLS_GATEWAY_URL=https://gateway-privado.example/
    CAMERAS_STREAM_SIGNING_KEY=<cadena-aleatoria-de-al-menos-32-caracteres>
    CAMERAS_UPSTREAM_BEARER_TOKEN=<token-secreto-del-reverse-proxy>
    CAMERAS_CHANNELS_JSON=[{"id":"jardines-1","name":"Jardines 1","path":"jardines-1"},{"id":"porton-1","name":"Portón 1","path":"porton-1"},{"id":"magnolias","name":"Magnolias","path":"magnolias"},{"id":"rosas","name":"Rosas","path":"rosas"}]

Pueden añadirse hasta 16 canales a CAMERAS_CHANNELS_JSON.
Los campos id y path solo deben contener letras, números, guiones
y guion bajo. El path corresponde al nombre de la fuente en MediaMTX.

El servicio rechaza un gateway remoto si no es HTTPS o si no
hay token secreto. Únicamente admite HTTP para loopback en el mismo
servidor. El proxy siempre requiere autorización desde backend.

El backend devuelve configured=false mientras falte configuración.
Esto es intencional: jamás debe mostrar una cámara como en vivo cuando
no hay acceso real. Un canal configurado puede fallar por RTSP, códec,
red o firewall. El indicador verde aparece al dispararse el evento
real playing en el elemento de video.

## Seguridad de enlaces y funcionamiento

- Roles de la lista de cámaras: SUPER_ADMIN, ADMINISTRADOR, SEGURIDAD.
- Tickets de video firmados de corta duración: 15 minutos.
  Cualquier usuario que copie un ticket podría verlo hasta que expire.
  No compartir URLs; evitar registrar las querystrings en accesos del proxy.
- Video bajo demanda; no arrancar 11 streams simultáneamente.
- Verificar H.264; H.265 no funciona en todos los navegadores.
- El video HLS tiene más latencia que WebRTC.
- El navegador requiere HLS nativo o la biblioteca hls.js de versión fija.
- Si la cámara permanece abierta, la pantalla intenta renovar automáticamente el ticket unos minutos antes del vencimiento. Si la renovación falla, pulsar Actualizar.
- No se ha probado contra la red ni el NVR real: instalación y
  credenciales deben configurarse en el entorno de Administración.
- Para probar plumas físicas, coordinar una ventana segura en caseta;
  no ejecutar aperturas o cierres de prueba automáticamente en el PR.

Documentación de formatos:
- Dahua RTSP: https://www.dahuawiki.com/index.php?curid=732&title=Remote_Access%2FRTSP_via_VLC
- MediaMTX HLS: https://mediamtx.org/docs/read/web-browsers

## Configuración real verificada el 13 de octubre de 2026

- NVR: Dahua en `192.168.1.101`, puerto RTSP `554`.
- La cámara 1, JARDINES-1, se reprodujo realmente en VLC con `subtype=1`.
- Se creó un usuario de integración `misionjardines` en grupo `user`, con visualización de los canales 1–11, que también reprodujo la cámara en VLC. **No guardar ni pegar la contraseña en GitHub, HTML, capturas o mensajes.**
- La IP `192.168.1.101` es LOCAL: Hostinger NO puede acceder a ella por la IP pública del módem sin un enlace establecido. El P2P Dahua no es una URL de streaming para servidores propios.
- El alojamiento actual es Hostinger **sitio web Node.js administrado**; el panel indica recursos asignados, no permiso para instalar daemon MediaMTX ni VPN.
- El router Telmex HG8145V5V3 presenta port forwarding, port trigger y DMZ; **no se debe habilitar ninguno para 554, 80, 37777 ni para la interfaz del grabador**. Conservar intacta la regla del ZKTeco.

### Pasos reales de despliegue (no basta configurar variables en Hostinger)

1. Proveer pasarela HLS **permanente** que tenga acceso al RTSP local: por ejemplo MediaMTX en una mini-PC en caseta, con salida a un túnel HTTPS autenticado y sin exposición pública del NVR; alternativamente, solución de pasarela remota con enlace privado desde caseta.
2. En la configuración PRIVADA de esa pasarela, guardar usuario Dahua `misionjardines` y su contraseña, y registrar `channel=1` a `channel=11` con `subtype=1`. Evitar contraseñas con caracteres especiales en URL sin percent-encoding; preferir secret manager. H.264 recomendado.
3. Proteger el gateway HTTPS con autenticación Bearer **real en el gateway** (la variable de Hostinger por sí sola no activa ese control). Solo permitir solicitudes autorizadas del backend.
4. En Hostinger → Sitios web → `api-misionjardines.listoenlinea.host` → **Variables de entorno**, añadir:

   - `CAMERAS_HLS_GATEWAY_URL`: URL HTTPS base de la pasarela, terminada en `/` (ej. `https://video-gateway.example/`).
   - `CAMERAS_UPSTREAM_BEARER_TOKEN`: token acordado con el proxy del gateway.
   - `CAMERAS_STREAM_SIGNING_KEY`: valor aleatorio criptográficamente fuerte de al menos 32 caracteres, distinto del token.
   - `CAMERAS_CHANNELS_JSON`: pegar en una sola línea el siguiente JSON, sin credenciales:

```json
[{"id":"jardines-1","name":"JARDINES-1","path":"jardines-1"},{"id":"porton-1","name":"PORTON-1","path":"porton-1"},{"id":"magnolias","name":"MAGNOLIAS","path":"magnolias"},{"id":"rosas","name":"ROSAS","path":"rosas"},{"id":"porton-2","name":"PORTON-2","path":"porton-2"},{"id":"cancha","name":"CANCHA","path":"cancha"},{"id":"jardines-2","name":"JARDINES-2","path":"jardines-2"},{"id":"gardenias","name":"GARDENIAS","path":"gardenias"},{"id":"lirios","name":"LIRIOS","path":"lirios"},{"id":"peatonal-1","name":"PEATONAL 1","path":"peatonal-1"},{"id":"peatonal-2","name":"PEATONAL 2","path":"peatonal-2"}]
```

5. Redesplegar backend y abrir `Seguridad → Cámaras` como usuario autorizado. El endpoint autenticado `GET /api/camaras/diagnostico` responde:
   - `configured: false`: falta alguna variable obligatoria.
   - `configured: true, reachable: false`: las variables están, pero la pasarela aún no entrega playlist.
   - `configured: true, reachable: true`: la pasarela responde al primer canal; validar segmentos y reproducción en la UI para confirmar.
6. Verificar `JARDINES-1` en la aplicación desde datos móviles, después los demás canales.

**No configurar `CAMERAS_DAHUA_PASSWORD` en Hostinger suponiendo que abrirá el video:** la autenticación RTSP debe ser utilizada por la pasarela que realmente llegue al grabador. Un mero par usuario/contraseña en el backend web no establece red privada ni transcodifica RTSP.
