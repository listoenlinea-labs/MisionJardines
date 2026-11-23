# Diagnóstico y corrección del Conmutador para iPhone 7 — 23 de noviembre de 2026

## Problema observado por el cliente
La cuenta del guardia, desde un iPhone 7, llega a "Enviando solicitud a caseta" y después muestra "La caseta aún no confirma el envío". Desde otro iPhone, la marcación funciona.

## Causa comprobada en el código
El navegador esperaba **solo 10 segundos** después de que Hostinger aceptara el POST, aunque la solicitud del servidor permanece activa **30 segundos**. El agente de caseta consulta la API con intervalos y depende de la red; el celular antiguo puede tener latencia adicional. Por eso el mensaje de 10 s puede ser falso. **No confirma que sea la única causa del fallo real del guardia**: también puede fallar el agente, su conexión con Hostinger o Asterisk.

## Correcciones
- La espera del cliente cubre hasta 38 segundos, respetando los estados reales PENDIENTE, RECLAMADA, ENVIADA, FINALIZADA, ERROR y VENCIDA. Se amplía el timeout por consulta a 10 s y el envío inicial a 15 s.
- Si un GET falla temporalmente por red, el cliente intenta recuperar **el mismo identificador de solicitud**, sin publicar otro POST ni iniciar una segunda llamada.
- Si Safari suspende temporizadores al bloquearse la pantalla, se realiza una última lectura del estado real de la solicitud antes de presentar un error.
- Los mensajes explican el estado detectado:
  - PENDIENTE/VENCIDA: la computadora no recogió la solicitud dentro de su vigencia.
  - RECLAMADA/VENCIDA: la computadora la recibió, pero el agente no confirmó el envío.
  - ERROR: el agente no pudo preparar la llamada (consultar registros de Asterisk).
  - Problema de red después de POST: la llamada podría seguir en curso, **no se reintenta automáticamente**.
  - ENVIADA: la central recibió la orden de envío; no implica que alguien contestó.
- Modal ligero de "Llamando…" al pulsar una casa y después de escoger A/B, con estados, botón Cerrar y un error visible sin requerir leer la barra inferior.
- Se actualizan versiones de scripts para evitar que Safari reutilice el código anterior de 10 segundos.

## Compatibilidad con los dos accesos del Conmutador
La corrección se aplicó en `docs/conmutador.html` (portal GitHub Pages) y en `backend/public/conmutador.html` (Conmutador independiente de Hostinger). Ambos utilizan exactamente el mismo módulo actualizado de caseta, con versiones nuevas de JavaScript para evitar que Safari recupere el código antiguo. El modal y la protección contra dobles pulsaciones también están presentes en ambas pantallas.

## Sin cambios
No hay cambios SQL, cambios de números personales, controles de acceso, integración HT813/Asterisk, agente.py, POST de llamadas, registros del historial, pagos, OCR, ZKTeco ni otras partes financieras.

## Pruebas
Se agregan pruebas simuladas de confirmación tardía, error del agente, expiración, WiFi/datos móviles intermitentes, POST ambiguo y protección contra doble llamada. No se ha probado en el iPhone físico del guardia ni en Hostinger, por lo que se requiere una prueba real después del despliegue.

## Prueba en el iPhone 7
1. Abrir **Safari**, mantenerlo en primer plano y entrar a la aplicación. Tras desplegar, cerrar la pestaña anterior y abrir de nuevo para que descargue los archivos con versión actualizada.
2. Seleccionar una vivienda con contacto autorizado. Ver el modal desde "Enviando solicitud" hasta "computadora recibió" y "ENVIADA"/"FINALIZADA".
3. Si caseta timbra, contestar el teléfono fijo; el mensaje del sistema no confirma que el residente contestó.
4. Si el modal indica **no recogida**, revisar si el servicio `misionjardines-caseta` sigue corriendo en la PC y llega a Hostinger.
5. Si indica **recibida, pero sin confirmación**, revisar los registros del agente y Asterisk en la PC. No duplicar llamadas hasta comprobar que no está sonando.
6. Si indica red inestable, probar Safari con WiFi y datos móviles por separado, sin modo de ahorro de datos ni pantalla bloqueada, y verificar fecha/hora del dispositivo.
