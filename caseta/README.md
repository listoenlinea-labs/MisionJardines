# Conexión de caseta con Misión Jardines

Esta entrega implementa el transporte de órdenes entre el backend y un agente
local, con cola persistente en MySQL y comprobaciones en Seguridad. No incluye
todavía el adaptador del SDK ZKTeco; el modo inicial SIMULACION nunca acciona una
pluma. No es suficiente instalar este agente para abrir las plumas físicamente.

## Backend en Hostinger

1. Desplegar el backend actualizado. Al arrancar crea `agentes_caseta` y
   `ordenes_caseta` mediante `sync()` sin `alter` ni `force`; no modifica las
   tablas de residentes, pagos o permisos de tags. Si falla la creación, la API
   principal sigue disponible y los endpoints de caseta devuelven error.
2. Generar un token aleatorio con al menos 32 caracteres; por ejemplo:
   `python -c "import secrets; print(secrets.token_hex(32))"`.
3. Agregar variables de entorno privadas al backend:

   ```text
   CASETA_AGENT_ID=caseta-principal
   CASETA_AGENT_TOKENS={"caseta-principal":"TOKEN_GENERADO"}
   ```

   Cada agente debe tener un token diferente. No reutilizar la contraseña de
   ZKAccess, la clave JWT ni la contraseña del controlador. No poner tokens en
   Git ni en la página. Para revocar, retirar el token y reiniciar el backend;
   para rotar, reemplazarlo en ambos extremos. No abrir puertos del C3-200 en el
   módem ni publicar el agente en internet.

## Windows de caseta

1. Instalar Python 3.10 o superior para todos los usuarios. No hay dependencias
   Python adicionales. Copiar esta carpeta a `C:\MisionJardines\caseta`.
2. Copiar `config.example.json` a `config.json` y colocar allí el mismo token.
   Confirmar la URL real del backend; debe terminar en `/api/caseta` y usar HTTPS.
   Mantener `CASETA_MODE` en `SIMULACION`.
3. Probar manualmente desde PowerShell:

   ```powershell
   .\start-agent.ps1 -PythonPath "C:\Program Files\Python313\python.exe"
   ```

   Usar la ruta real de Python en ese equipo. En Seguridad debe aparecer
   `Caseta conectada · SIMULACION`. Abrir entrada/salida debe finalizar como
   `SIMULADA`, sin mover las plumas. Detener con Ctrl+C antes de instalar.
4. Para ejecutarlo en segundo plano aunque nadie inicie sesión, abrir PowerShell
   como administrador y ejecutar:

   ```powershell
   .\install-task.ps1 -PythonPath "C:\Program Files\Python313\python.exe"
   ```

   Registra una tarea al iniciar Windows bajo SYSTEM, con reinicio si el proceso
   falla, y restringe acceso a esta carpeta a Administradores/SYSTEM. Es una
   tarea de Windows, no un servicio nativo del Service Control Manager.
   Configuración, código y directorio de datos deben ser locales. No borrar ni
   mover `data/journal.sqlite`: conserva la protección contra repetición tras
   reinicios. No ejecutar más de una copia usando directorios de datos distintos.
5. Consultar o detener:

   ```powershell
   Get-ScheduledTaskInfo -TaskName "MisionJardines-Caseta"
   Stop-ScheduledTask -TaskName "MisionJardines-Caseta"
   ```

## Protocolo y estados

Todas las rutas cuelgan de `/api/caseta`. Usuarios usan su JWT actual; agentes
usan `Authorization: Bearer TOKEN_DEL_AGENTE`. Las credenciales de agente no
permiten crear órdenes ni consultar otras APIs de usuario.

| Ruta | Permiso | Función |
|---|---|---|
| GET `/estado` | Administración/Seguridad | Último contacto y modo del agente principal |
| POST `/ordenes` | Administración/Seguridad | `{solicitudId: UUID, accion: "ABRIR", pluma: "entrada" o "salida"}` |
| GET `/ordenes/:id` | Administración/Seguridad | Consultar resultado |
| POST `/agente/reclamar` | Agente | `{modo: "SIMULACION" o "FISICO"}`; recoge una orden o devuelve null |
| POST `/agente/ordenes/:id/resultado` | Mismo agente | `{reclamoId, estado, resultado}` |

Mapeo confirmado en ZKAccess: entrada = puerta 1, salida = puerta 2, pulso = 3
segundos. El cliente no elige IP, puerto, comandos ni duración. Un usuario tiene
un máximo de 12 solicitudes por minuto. Un identificador repetido no crea otra
orden. No se permite cerrar ni mantener abierta una pluma en esta entrega.

La caseta consulta cada 3 segundos por HTTPS saliente. Sin contacto en los
últimos 15 segundos no se aceptan nuevas aperturas. Las órdenes pendientes
caducan a los 15 segundos; las recogidas sin resultado durante 20 segundos
pasan a DESCONOCIDA y nunca se vuelven a entregar. MySQL bloquea la fila del
agente y de la orden durante el reclamo para evitar entregas concurrentes.
El agente guarda el reclamo antes de tocar hardware. Si falla la red reenvía
solo el resultado, nunca la apertura. Ante un corte durante la ejecución queda
DESCONOCIDA. Revisar físicamente antes de generar otra solicitud.

EJECUTADA confirma únicamente que el adaptador obtuvo éxito del controlador;
no confirma la posición de la pluma. No hay sensor instalado. SIMULADA no
significa apertura física. La página no anima una posición supuestamente real.

## Adaptador físico pendiente

Se requiere Windows/arquitectura del equipo y el SDK compatible del fabricante.
La conexión local identificada es C3-200 `192.168.1.201:4370`, TCP/IP, contraseña
aparentemente deshabilitada. Confirmar conectividad y convivencia con ZKAccess
antes de habilitar operación física.

El punto de extensión es un ejecutable local configurado mediante
`CASETA_DRIVER_COMMAND`, una lista JSON de argumentos. El agente envía un JSON
por stdin con `id`, `accion`, `puerta`, `duracionSegundos` y `venceEn`. El adaptador
debe comprobar vencimiento justo antes de actuar, usar las credenciales locales
del controlador y regresar un JSON por stdout, código de proceso 0:

* `{"estado":"EJECUTADA"}` solo después de éxito del SDK.
* `{"estado":"FALLIDA"}` solo si garantiza que no se accionó el relevador.
* Cualquier resultado ambiguo, timeout o error de proceso es DESCONOCIDA.

No debe usar reintentos internos de apertura ni dejar un proceso en segundo
plano. Tiene un máximo de 8 segundos. El agente no interpreta scripts enviados
por la plataforma ni ejecuta comandos mediante shell. Hasta instalar y probar
ese adaptador, no cambiar a FISICO. La reactivación de tags y la conciliación
bancaria quedan fuera de esta entrega.

## Verificación

```text
node --test backend/test/*.test.js
python -m unittest discover -s caseta -p "test_*.py"
```

Las pruebas de backend usan repositorios en memoria; verificar también en MySQL
de pruebas el arranque, reclamo concurrente, reinicio y envío de resultados. La
prueba del agente utiliza HTTP únicamente en localhost mediante la excepción
de desarrollo `CASETA_ALLOW_LOCAL_HTTP=1`; producción exige HTTPS. Probar un
reinicio de Windows en SIMULACION antes de la puesta en marcha física.
