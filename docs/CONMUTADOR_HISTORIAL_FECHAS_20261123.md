# Conmutador: navegación por fechas con llamadas (23-NOV-2026)

## Funcionalidad
- Al abrir **Historial de llamadas** por primera vez, el servidor busca la **última fecha con un intento registrado**, aunque sea anterior a hoy.
- La flecha izquierda va al día registrado inmediatamente anterior; la flecha derecha va al día registrado inmediatamente posterior. No recorre fechas sin llamadas.
- Si no hay fecha anterior o posterior, la flecha correspondiente queda deshabilitada.
- El calendario manual permanece disponible y puede seleccionar días vacíos. Las flechas encuentran las fechas reales más cercanas a ambos lados.
- **Hoy** lleva a la fecha actual; **Actualizar** hace una nueva consulta de la fecha seleccionada. No se pagina: todas las llamadas del día aparecen juntas.

## Implementación y rendimiento
- Un solo GET por navegación: `/api/conmutador/historial?fecha=AAAA-MM-DD` o, sin parámetro, la última fecha registrada.
- `SELECT ... ORDER BY creado_en DESC LIMIT 1` resuelve la fecha inicial con el índice existente `idx_conmutador_historial_fecha`.
- Consultas de anterior y siguiente usan rangos indexables `creado_en < :fecha` y `creado_en >= DATE_ADD(:fecha, INTERVAL 1 DAY)`, orden y `LIMIT 1`. No aplican `DATE(creado_en)` en WHERE ni recorren días vacíos en JavaScript.
- Las llamadas del día se recuperan completas (sin LIMIT) mediante el rango por fecha y se ordenan de la más reciente a la más antigua.
- El navegador conserva un caché de 15 segundos de hasta 5 fechas, cancela consultas obsoletas y deshabilita flechas mientras consulta.
- No se requieren migraciones: se reutiliza el índice de la tabla `conmutador_intentos_llamada`.

## Seguridad
La API sigue requiriendo token y rol autorizado. El historial solo muestra vivienda, fecha y hora, sin exponer teléfonos, nombres ni información del propietario. No se altera el POST que registra llamadas ni los flujos del agente caseta, VoIP, iPhone, Contactos, Pagos, ZKTeco o Casa Club.

## Verificación
Pruebas de backend con fechas 20, 23 y 26 de noviembre, días vacíos, extremos, historial sin registros, fechas inválidas y día con más de 10 llamadas. Prueba simulada del cliente para salto anterior/siguiente y botones inactivos.

Antes del merge se recomienda verificar en Hostinger con los registros reales, incluyendo la zona horaria configurada en MySQL, e introducir un nuevo intento de llamada para confirmar que aparece al actualizar. No hay mediciones reales de latencia de producción ni prueba de marcación en el dispositivo de caseta.
