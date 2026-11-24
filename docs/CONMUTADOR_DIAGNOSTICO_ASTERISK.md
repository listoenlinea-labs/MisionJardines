# Diagnóstico de llamadas con eventos de Asterisk (opcional)

## Principio de seguridad
Este cambio **NO modifica** el flujo activo de las llamadas, los contextos
`conmutador-caseta-entrada` / `conmutador-caseta`, las extensiones 6001/6002,
el gateway HT813, los destinos, los tiempos, el spool ni los reintentos.
El observador es un proceso separado que recibe eventos en el AMI local de
Asterisk. No origina, contesta, cuelga ni transfiere llamadas; su usuario AMI
tiene **solo permiso de lectura de eventos**.

**Por defecto está deshabilitado**. Con la variable
`MJ_CONMUTADOR_TELEMETRIA` ausente o distinta de `true`, `agente.py`
genera exactamente las mismas instrucciones de llamada anteriores.

Cuando se habilita, únicamente añade una variable de correlación
`Setvar: __MJ_SOLICITUD=<UUID>` al archivo `.call` ya generado. Esa
variable no cambia el destino ni las aplicaciones `Dial`; se utiliza para
correlacionar eventos de Asterisk con el UUID que ya tiene Hostinger.

## Interfaz
Al pulsar «Orden enviada a central» (o «Orden procesada por central») en el
historial, aparece un modal con:
- Solicitud registrada.
- Orden enviada a Asterisk, con la fecha que confirmó el agente.
- Eventos adicionales observados: Timbrando, Contestada, No contestó,
  Ocupado, Fallida (con causa) y Finalizada, con duración cuando exista
  una confirmación de respuesta y un evento de fin.
- Si no hay telemetría, se informa explícitamente que Asterisk no reportó
  información verificable. **No se dibujan estados hipotéticos.**

En este flujo el primer `Dial(PJSIP/6001)` llama al teléfono de **caseta**.
El observador ignora ese tramo para no presentarlo como timbrado al
residente. Solo sigue la llamada hacia `@6002` (gateway FXO).
«Contestada según Asterisk» puede significar que el gateway SIP respondió;
**no es prueba inequívoca de que una persona haya contestado la línea PSTN**.
La duración es la observada entre respuesta SIP/puente y fin de canal
cuando el observador recibió ambos eventos. No se crean grabaciones.

## Despliegue en dos etapas (recomendado)

### Etapa A: desplegar sin riesgo el modal y la API
1. Fusionar la PR y desplegar backend y GitHub Pages normalmente.
2. **No modificar** aún `/etc/misionjardines-caseta.env` ni reiniciar
   el servicio de llamadas.
3. Pulsar un estado en el historial. Debe verse la solicitud y el envío
   ya conocido; los eventos restantes aparecerán como «no disponibles».
4. Verificar que el iPhone del guardia y las llamadas de caseta funcionan igual.

### Etapa B: activar observador solo después de preparar una prueba controlada
1. En la VM de Ubuntu, comprobar que la misma revisión del repositorio está
   disponible en `telefonia/caseta`.
2. **No reemplazar** `/etc/asterisk/manager.conf`. Abrir el archivo
   existente y agregar el usuario de
   `telefonia/caseta/manager-observador.conf.example`, con una clave
   **distinta** de la clave de caseta, de al menos 32 caracteres. Confirmar
   que AMI esté habilitado y ligado exclusivamente a `127.0.0.1:5038`
   (si ya lo utilizan otros servicios, revisar compatibilidad antes).
   Mantener `read=call`, `write=` vacío y ACL solo localhost.
3. Aplicar **solo** `manager reload` y comprobar la cuenta de lectura;
   no ejecutar `dialplan reload` ni alterar `extensions-conmutador.conf`.
4. Agregar estas variables a `/etc/misionjardines-caseta.env`:
   ```dotenv
   MJ_CONMUTADOR_TELEMETRIA=true
   MJ_AMI_USER=mj-diagnostico
   MJ_AMI_PASSWORD=CLAVE_AMI_PRIVADA
   ```
   Conservar sin cambios `MJ_CASETA_API` y
   `CONMUTADOR_CASETA_TOKEN`.
5. Ejecutar las pruebas sin telefonía real:
   ```bash
   python3 -m unittest telefonia/caseta/test_observador_ami.py
   cd backend && node --test test/conmutador-asterisk-diagnostico-20261124.test.js
   ```
6. Copiar el agente con metadato opcional y el observador:
   ```bash
   sudo install -m 0644 telefonia/caseta/agente.py /opt/misionjardines-caseta/agente.py
   sudo install -m 0644 telefonia/caseta/observador_ami.py /opt/misionjardines-caseta/observador_ami.py
   sudo install -m 0644 telefonia/caseta/misionjardines-observador-ami.service /etc/systemd/system/
   sudo systemctl daemon-reload
   ```
   Reiniciar `misionjardines-caseta` **solo en una ventana sin llamadas
   activas** para que incorpore el metadato. Esta es la única acción de
   despliegue que afecta temporalmente al proceso principal.
7. Activar el proceso secundario:
   ```bash
   sudo systemctl enable --now misionjardines-observador-ami
   sudo journalctl -u misionjardines-observador-ami -n 40 --no-pager
   ```
   No exponer el puerto 5038 a internet. El observador solo se conecta
   a `127.0.0.1` y realiza POST HTTPS al backend con el token privado ya
   utilizado por el agente.

### Prueba controlada
- Con un destino de prueba autorizado, validar timbrado, respuesta,
  finalización y duración. Verificar que no se registre como contestada
  la llamada **solamente al teléfono fijo de caseta 6001**.
- Probar un caso no contestado/ocupado cuando sea posible, sin llamar a
  residentes sin aviso.
- Verificar que el modal únicamente muestre eventos emitidos por Asterisk.
  El tiempo indicado procede del reloj de recepción del backend y de la
  duración medida por el observador en la VM.
- Desconectar **solo el observador** y confirmar que el Conmutador sigue
  marcando igual. El modal debe informar que faltan eventos, sin inventarlos.

### Reversión inmediata
```bash
sudo systemctl disable --now misionjardines-observador-ami
```
El sistema de llamadas continúa normalmente con el agente existente. Para
retirar también la variable de correlación, cambiar
`MJ_CONMUTADOR_TELEMETRIA=false` y reiniciar
`misionjardines-caseta` en una ventana sin llamadas activas.

## Límites importantes
- Ninguna parte del histórico previo puede reconstruirse automáticamente
  con precisión: faltaban eventos AMI asociados a UUID.
- Si el observador pierde conexión, se reinicia o Asterisk no publica
  un evento, el estado **queda sin verificar**, nunca se supone exitoso.
- Las observaciones pueden perderse si el backend está caído durante el
  evento; no hay cola persistente de telemetría en disco. Eso NO afecta la llamada.
- Algunos gateways FXO contestan SIP antes de que alguien atienda por PSTN.
  Para **respuesta humana inequívoca** se necesitarían registros CDR/CEL y
  validación con el gateway y línea física.
- La API nueva admite solo eventos predefinidos y duración entre 0 y 7200 s;
  requiere autenticación del agente. La lectura del modal usa JWT y roles
  existentes del historial. **No se guarda ni devuelve el número del residente.**

## Referencias técnicas
- https://docs.asterisk.org/Configuration/Interfaces/Asterisk-Call-Files/
- https://docs.asterisk.org/Configuration/Interfaces/Asterisk-Manager-Interface-AMI/AMI-v2-Specification/
- https://docs.asterisk.org/Configuration/Dialplan/Variables/Channel-Variables/Variable-Inheritance/
