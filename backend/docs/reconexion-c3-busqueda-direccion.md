# Recuperación de conexión y búsqueda por dirección en ZKTeco

## Alcance del cambio
El C3-200 **no necesita una conexión TCP permanente**: el cliente abre una sesión para cada lectura o acción y después la cierra. El backend de Node.js programa una lectura automática de inventario (por defecto, cada 60 segundos). Mantener un socket indefinidamente abierto no garantiza mejor disponibilidad y puede agotar sesiones o quedar obsoleto tras reinicios de red.

### Protección y recuperación implementadas
- Si la sesión TCP falla a mitad del handshake o lectura de parámetros, el socket parcial se destruye: evita sockets huérfanos.
- Cada ciclo de inventario automático realiza **como máximo un reintento adicional** tras un error temporal (corte de socket, reinicio momentáneo, timeout, conexión rechazada, etc.) y espera 1.2 segundos antes de repetir.
- Si el error indica contraseña incorrecta, datos físicos incompletos, configuración no disponible o un fallo SQL, no se insiste en un bucle.
- Las lecturas en curso siguen compartiendo una sola promesa para no lanzar múltiples sincronizaciones automáticas simultáneas.
- El worker conserva el último error, número de intentos, fecha de último éxito y fallos consecutivos. Nunca se considera que un TAG fue eliminado por un inventario fallido.
- La vista de ZKTeco obtiene búsquedas y páginas del último reflejo SQL; solo el botón **Sincronizar ZKTeco** solicita una sincronización manual, mientras el worker del backend sigue actualizando por su cuenta. Se reduce el número de aperturas de sesión al panel.

### Qué no puede reparar el software
Estos cambios **no** solucionan IP pública o DDNS desactualizados, falta de port forwarding, firewall que bloquea TCP, CGNAT, falta de Internet o C3 apagado. El equipo y el servicio Node.js deben permanecer encendidos, con red estable. Para evitar cortes prolongados se recomienda monitorear disponibilidad de router/Internet, tener dirección LAN fija, usar DDNS vigente y preferir VPN privada frente a exponer TCP 4370 directamente a Internet cuando sea viable.

**Revisión en Hostinger:** comprobar `ZKTECO_AUTOSYNC_ENABLED=true`, `ZKTECO_AUTOSYNC_MS=60000`, `ZKTECO_DIRECT_HOST`, `ZKTECO_DIRECT_PORT`, `ZKTECO_COMM_PASSWORD` y ejecución de Node.js continua. No publicar valores sensibles. El botón **Diagnosticar C3** del PR #320 permite diferenciar problemas TCP, handshake e inventario.

### Búsqueda unificada
El campo **Calle y número** acepta:
- `Gardenias`: todas las viviendas visibles de esa calle.
- `Gardenias 5`: solo la vivienda Gardenias 5.
- `Av. Guadalajara 707`: la casa oficial de esa avenida.
- `Av. Valle de México 3614`: la vivienda correspondiente.
- `Rosas 27`: la vivienda Rosas 27.

El parser separa calle y último número, y envía los mismos filtros `calle` y `numero` del backend. No hay migración ni cambios de datos. Los enlaces `casaId` desde Análisis siguen funcionando.

## Verificación manual
1. Publicar backend y frontend juntos y refrescar sin caché.
2. Buscar `Gardenias 5`, luego `Gardenias` y `Av. Guadalajara 707`.
3. Pasar páginas y usar filtros: no debe sincronizar físicamente el C3 por cada acción.
4. Pulsar **Sincronizar ZKTeco** para realizar una lectura física explícita.
5. Ante falla temporal, comprobar que el backend realiza como máximo dos intentos por ciclo y vuelve a probar en el próximo período.
6. Si persiste, ejecutar **Diagnosticar C3** y revisar red/host/puerto. No activar ni modificar TAGs basándose en un error de red.
