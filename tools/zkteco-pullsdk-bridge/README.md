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

El endpoint de alta escribe primero en user, luego en userauthorize, y vuelve a habilitar el dispositivo aunque ocurra un error.