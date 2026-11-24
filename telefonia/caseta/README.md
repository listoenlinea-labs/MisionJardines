# Conmutador con teléfono fijo de caseta

El botón web envía la vivienda y el contacto A/B a Hostinger. El agente de
Ubuntu recoge la solicitud por HTTPS, timbra el FXS del HT813 (extensión
`6001`) y, al contestar caseta, marca por el FXO registrado como `6002`.
Se conserva la configuración SIP y el contexto manual `prueba-conmutador`.

## Hostinger

1. Desplegar el backend y ambas copias del frontend de la misma revisión.
2. Ejecutar [la migración de MySQL](../../backend/sql/2026-11-19-conmutador-caseta.sql).
3. Generar una clave aleatoria con `openssl rand -hex 32`, guardarla en
   `CONMUTADOR_CASETA_TOKEN` en el entorno privado de Hostinger y usar la misma
   en la VM. Mantener `CONMUTADOR_CASETA_HABILITADO=false` hasta instalar el agente.
4. Al activar el modo en Hostinger, reiniciar el backend y recargar el iPhone.
   El interruptor `TELEFONIA_HABILITADA` del modo WebRTC puede quedarse en `false`.

## Instalar en la VM Ubuntu

Con acceso SSH o desde la terminal de Ubuntu, entra a `telefonia/caseta` en el
checkout de la revisión que incluye estos archivos. Estos comandos presuponen
Asterisk instalado como servicio systemd, con su usuario `asterisk` y el spool
predeterminado de Ubuntu.

```bash
sudo asterisk -rx 'pjsip show contacts'
sudo asterisk -rx 'module show like pbx_spool'
sudo -u asterisk test -w /var/spool/asterisk
sudo -u asterisk test -w /var/spool/asterisk/outgoing
sudo install -d -m 0755 /opt/misionjardines-caseta
sudo install -m 0644 agente.py /opt/misionjardines-caseta/agente.py
sudo install -m 0644 misionjardines-caseta.service /etc/systemd/system/
sudo install -o root -g asterisk -m 0640 extensions-conmutador.conf /etc/asterisk/
sudo install -m 0600 caseta.env.example /etc/misionjardines-caseta.env
sudoedit /etc/misionjardines-caseta.env
```

En `/etc/misionjardines-caseta.env`, sustituye el marcador por la clave de
Hostinger. Para reinstalar conservando la clave, omite el comando que copia
`caseta.env.example`. Si Asterisk usa otro spool, configura
`ASTERISK_SPOOL_DIR` y verifica que su usuario pueda escribir ahí y en
`outgoing`.

Agrega una vez esta línea al comienzo de `/etc/asterisk/extensions.conf`
con `sudoedit /etc/asterisk/extensions.conf`:

```text
#include extensions-conmutador.conf
```

Recarga y comprueba ambos contextos:

```bash
sudo asterisk -rx 'dialplan reload'
sudo asterisk -rx 'dialplan show conmutador-caseta-entrada'
sudo asterisk -rx 'dialplan show conmutador-caseta'
sudo systemctl daemon-reload
sudo systemctl enable --now misionjardines-caseta
sudo journalctl -u misionjardines-caseta -n 30 --no-pager
```

Activa `CONMUTADOR_CASETA_HABILITADO=true` en Hostinger cuando estén listas
la VM y la migración. El agente solo necesita salida HTTPS. Asterisk recoge los
archivos completos mediante su spool local.

## Prueba de integración

Usa una vivienda de prueba con un número autorizado. Comprueba que caseta
timbre primero, que dejarla sonar no marque al destino, y que al contestar
se escuche el audio en ambos sentidos. Revisa que los endpoints de
contactos y estado no entreguen teléfonos a una cuenta de Seguridad
y que el endpoint anterior de números rechace esa cuenta.

El agente libera la solicitud cuando Asterisk termina el intento. Si no puede
reportar el cierre, la reserva vence a los 30 segundos. El dialplan limita el
uso simultáneo de la extensión de caseta. Una entrega reclamada
no se reintenta automáticamente para evitar llamadas duplicadas. «Solicitud
enviada» indica que se entregó al spool, no que caseta o el residente contestaron.
El historial conserva los intentos sin el número de destino.

## Diagnóstico opcional de llamadas

El modal del historial permite ver las etapas observadas en Asterisk sin
cambiar la marcación. Por seguridad, el observador AMI está deshabilitado por
defecto y funciona como servicio systemd **independiente** del agente principal.
Ver las instrucciones completas en [Diagnóstico pasivo](../../docs/CONMUTADOR_DIAGNOSTICO_ASTERISK.md).
