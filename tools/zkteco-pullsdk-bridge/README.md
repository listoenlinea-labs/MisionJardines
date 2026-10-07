# ZKTeco PullSDK Bridge

Este servicio pequeño existe porque el C3-200 de Misión Jardines acepta lectura y control de relés por TCP directo, pero en las pruebas reales no confirmó altas de usuarios mediante el intento de escritura socket-native.

Para altas y cambios de vigencia se usa el Pull SDK oficial (plcommpro.dll) desde Windows.

## Dónde puede correr

No necesita estar en la oficina. Puede ejecutarse en un Windows VPS/VM que tenga salida a Internet hacia la IP pública/puerto del C3-200.

El backend de Hostinger llama a este bridge por HTTPS y después relee directamente el C3 para verificar que el CardNo exista de verdad.

## Requisitos

- Windows x86/x64 con runtime .NET 8.
- El proyecto se compila para win-x86.
- plcommpro.dll y sus dependencias del Pull SDK/ZKAccess deben estar junto al ejecutable o disponibles en PATH.
- No subir DLLs propietarias al repositorio.

## Variables

ZKTECO_HOST=<IP publica o DDNS>
ZKTECO_PORT=44370
ZKTECO_COMM_PASSWORD=
BRIDGE_TOKEN=<token largo y aleatorio>
ASPNETCORE_URLS=http://0.0.0.0:5098

En Hostinger:

ZKTECO_PULLSDK_BRIDGE_URL=https://tu-bridge.example.com
ZKTECO_PULLSDK_BRIDGE_TOKEN=<mismo token>
ZKTECO_PULLSDK_BRIDGE_TIMEOUT_MS=15000

## Ejecutar

dotnet restore
dotnet run

Para producción conviene publicarlo detrás de HTTPS (IIS, Caddy, nginx en la VM o un proxy administrado).

## Endpoints

- GET /health
- POST /api/users
- POST /api/users/validity
- POST /api/users/access (revoca/restaura `userauthorize` para bloqueo físico)

El endpoint de alta escribe primero en user, luego en userauthorize, y vuelve a habilitar el dispositivo aunque ocurra un error.

El bloqueo físico no depende únicamente de EndTime: `/api/users/access` elimina la fila `userauthorize` del Pin al bloquear y la restaura con `AuthorizeTimezoneId` + `AuthorizeDoorId` al activar. El backend relee el C3 antes de confirmar el estado.

## Administrador automático (Windows)

Para no repetir manualmente git pull, dotnet publish, copiado de DLLs, reinicio del bridge, Quick Tunnel de Cloudflare y actualización de Hostinger, usa:

    tools\zkteco-pullsdk-bridge\ACTUALIZAR-BRIDGE.cmd

También puedes ejecutar directamente:

    py -3 tools\zkteco-pullsdk-bridge\bridge_manager.py

### Primera ejecución

La primera vez el asistente:

1. Pide un Hostinger API token y el usuario de hosting u....
2. Valida la app Node.js de Hostinger.
3. Genera un BRIDGE_TOKEN nuevo una sola vez y lo imprime únicamente en esa primera ejecución.
4. Localiza plcommpro.dll en las carpetas habituales de ZKAccess NewSDK.
5. Localiza cloudflared o descarga el binario oficial si falta.
6. Obtiene las claves actuales de variables de entorno de Hostinger.
7. Crea una caché local cifrada con DPAPI del usuario de Windows para poder hacer actualizaciones posteriores sin volver a pedir secretos.

> La API de Hostinger reemplaza el conjunto completo de variables de entorno al actualizarlas. Por eso el asistente nunca copia valores enmascarados y se detiene si detecta que el conjunto de claves cambió desde la configuración inicial.

Si existe backend/.env, el asistente puede usarlo como base solo después de que el usuario confirme que contiene valores de producción. Para cualquier clave que falte, el valor se solicita oculto.

### Ejecuciones posteriores

En ejecuciones normales el administrador hace automáticamente:

1. git switch main + git pull --ff-only origin main.
2. dotnet publish -c Release -r win-x86.
3. Copia las DLL de NewSDK, incluida plcommpro.dll.
4. Detiene solamente el bridge anterior y el Quick Tunnel que apunta a 127.0.0.1:5098.
5. Publica el nuevo bridge.
6. Arranca ZktecoPullSdkBridge.exe con BRIDGE_TOKEN, IP 192.168.1.201, puerto 4370 y ASPNETCORE_URLS=http://0.0.0.0:5098.
7. Espera a que /health/controller confirme conexión con el C3-200.
8. Arranca un Cloudflare Quick Tunnel nuevo.
9. Captura automáticamente la nueva URL https://....trycloudflare.com.
10. Actualiza en Hostinger ZKTECO_PULLSDK_BRIDGE_URL, ZKTECO_PULLSDK_BRIDGE_TOKEN y ZKTECO_PULLSDK_BRIDGE_TIMEOUT_MS.
11. Reinicia el proceso Node.js en Hostinger.
12. Valida la ruta pública Quick Tunnel -> Bridge -> C3-200.

Al terminar imprime la nueva URL. En ejecuciones posteriores no vuelve a imprimir el token.

Los procesos quedan corriendo en segundo plano y los logs se guardan en:

    tools\zkteco-pullsdk-bridge\.bridge-manager\logs\

### Si cambias variables de Hostinger manualmente

Hostinger no permite leer de vuelta los valores reales mediante la API; solamente entrega los nombres y valores enmascarados. Si cambias variables de producción en hPanel, refresca la caché segura antes de volver a usar el modo automático:

    ACTUALIZAR-BRIDGE.cmd --reconfigure-hostinger

### Archivos locales que no se suben a Git

El .gitignore del bridge excluye .bridge-manager/, publish/, publish-next/, publish-backup/ y cloudflared.exe. No se suben tokens, credenciales, DLLs propietarias ni archivos compilados.
