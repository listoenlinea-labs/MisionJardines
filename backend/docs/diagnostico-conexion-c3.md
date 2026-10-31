# Diagnóstico de conexión del controlador ZKTeco C3-200

## Síntomas
Análisis de cuotas: "No fue posible verificar el inventario físico del C3".
ZKTeco: "No se pudo sincronizar antes de cargar la página".

Estos avisos no implican que se hayan borrado o desactivado TAGs: MySQL conserva su último estado. La vigencia MySQL no confirma el estado físico del C3.

## Antes de modificar redes o TAGs
1. Como administrador, ir a **ZKTeco > Diagnosticar C3**.
2. El diagnóstico se ejecuta **desde Hostinger**, no desde el navegador. Abre un panel de Logs de errores y presenta: configuración (fuente de host/puerto, sin revelar host o contraseña), respuesta TCP, negociación C3 y lectura `user`.
3. Registrar el código y texto exactos de la etapa fallida, más el último error del sondeo automático.
4. No usar **Agregar TAG**, **Bloquear todos**, **Editar vigencia** ni reiniciar manualmente inventarios como método de diagnóstico.

## Interpretación
| Estado/código | Interpretación y siguiente comprobación |
| --- | --- |
| `CONFIGURACION_INVALIDA` | Falta host válido o puerto en las variables de entorno del backend. |
| `ENOTFOUND`, `EAI_AGAIN` | El DDNS no resuelve. Comparar DNS con dirección externa vigente. |
| `ETIMEDOUT` o "Tiempo de espera" | No hay respuesta: IP pública cambió, redirección TCP, firewall, VPN, router o controlador sin red. |
| `ECONNREFUSED` | Destino alcanzable pero puerto cerrado/rechazado. Revisar redirección hacia el puerto LAN del C3. |
| `EHOSTUNREACH`, `ENETUNREACH` | Ruta de red inaccesible. |
| `ERROR_PROTOCOLO` | TCP abre, pero no se completa la sesión ZKTeco; comprobar que se llega realmente al C3 y la contraseña de comunicación. |
| `ERROR_INVENTARIO` | Se conectó al C3 pero falló `GETDATA user`. Examinar firmware, respuesta y logs. |
| `LECTURA_VACIA` | Hubo respuesta pero devolvió cero usuarios. No marcar TAGs ausentes ni modificar la base. |
| `CONECTADO` | TCP, sesión e inventario físico funcionaron; revisar entonces errores de sincronización SQL o autorizaciones `userauthorize`. |

## Hostinger y red local
Verificar **sin publicar sus valores completos**:
- `ZKTECO_DIRECT_HOST`: IP pública actual o DDNS que apunta a ella, NO la IP local 192.168.x.x salvo VPN real.
- `ZKTECO_DIRECT_PORT`: puerto externo del router, indicado como 44370 en `.env.example` (puede variar en producción).
- El router debe reenviar TCP desde ese puerto a la IP LAN fija del C3 y el puerto de dispositivo (habitualmente 4370).
- `ZKTECO_COMM_PASSWORD`: la del protocolo del panel, no la contraseña web ni de MySQL.
- `ZKTECO_TIMEOUT_MS`: timeout del cliente en milisegundos; no soluciona un puerto no encaminado.

En PowerShell, desde un equipo **externo a la misma red** (no prueba desde Hostinger):
```powershell
Test-NetConnection TU_IP_PUBLICA_O_DDNS -Port 44370
```
`TcpTestSucceeded: True` comprueba únicamente que hay puerto TCP; NO confirma protocolo, inventario, permisos ni vigencia. La prueba del panel en la aplicación sí se realiza desde el backend.

## Seguridad
No compartir credenciales, IP completas, tokens, identificadores privados ni capturas completas del archivo .env. El endpoint GET `/api/zkteco/diagnostico/conexion` exige roles administrativos y no admite host o puerto aportados por el cliente para evitar exploración de red. No hay escrituras C3 ni SQL en su ejecución; sí se abren conexiones de prueba y se leen tablas del panel.
