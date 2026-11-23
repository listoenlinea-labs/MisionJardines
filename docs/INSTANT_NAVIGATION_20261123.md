# Navegación rápida y segura — 23 noviembre 2026

## Diagnóstico confirmado en el código
La versión anterior de docs/assets/js/app-shell.js limpiaba el src del iframe anterior a los 250 ms. Cada regreso a una sección obligaba a crear todo su DOM, volver a ejecutar JavaScript, esperar verificaciones y volver a solicitar datos. Esto ocurre aun cuando la persona acaba de visitar la pantalla.

## Solución de navegación
- Caché LRU **solo en memoria** de secciones frecuentes: Inicio, Análisis de cuotas, Casa Club, Avisos, Calendario y Directorio. Volver a una sección conservada reutiliza exactamente su iframe, sin cargar la página de nuevo.
- Máximo **tres iframes en celular**, **cuatro en computadora**, incluido el activo. Expiran tras **cuatro minutos desde su carga**; al necesitar espacio se descarta el menos recientemente usado.
- **Excluidos deliberadamente de caché**: Pagos, ZKTeco, Conmutador, Visitas, Cuotas con autoguardado y otros módulos con dispositivos o tareas sensibles. Se conserva su ciclo de vida y no se mantienen conexiones de telefonía ni hardware en segundo plano.
- No se guarda ningún iframe de URL con query o fragmentos, evitando conservar enlaces privados de recibos o reservas.
- Token de sesión diferente o vivienda seleccionada diferente invalidan todos los marcos cacheados antes de volver a navegar. La autenticación y los permisos continúan en servidor.
- La autorización del DOM ya no obliga a esperar el evento "load" (que espera recursos extra como imágenes); el iframe puede notificar que la página fue autorizada y está lista.
- El observador de permisos de page-access.js solo revisa enlaces nuevos, no todos los enlaces del documento tras cada actualización de tablas.
- El selector de vivienda del menú se rellena de forma asíncrona sin congelar el menú lateral mientras responde /viviendas/mias.

## Frescura de datos
- Al volver a Análisis, se verifica la revisión financiera y solo se recalcula cuando hay cambios o el resumen se ha quedado antiguo. El intervalo de comprobación se pausa mientras su iframe está oculto.
- Casa Club vuelve a comprobar el calendario con el backend al reactivar la sección. El botón para reservar se deshabilita mientras se valida disponibilidad.
- Avisos y Calendario consultan sus datos al regresar a la pantalla.
- Las solicitudes API de escritura siguen exigiendo autenticación y validaciones del backend.

## Verificación
El test de navegación con iframe simulado comprueba: regreso a Inicio sin recarga, retorno a Pagos, ZKTeco y Conmutador con su carga original, cambio de vivienda que invalida caché, y cambio de token. El test adicional protege exclusiones de secciones sensibles y los listeners de actualización.

**Antes de fusionar**: comprobar flujo real en Android, iOS y escritorio; cambiar de casa; entrar y salir durante una validación de pagos; comprobar Casa Club con Google Sheets disponible/no disponible, calendario, avisos, diseño de modales y el recorrido guiado. Comparar DevTools Performance usando `performance.getEntriesByName('mj-section-navigation')` y logs de Hostinger. No inventar mejoras porcentuales sin benchmarks reales. Las secciones visitadas por primera vez siguen dependiendo de red y del backend; la experiencia casi instantánea aplica principalmente al regreso a páginas ya abiertas.

## Extensión actual: historial completo filtrado por fecha
- La pestaña **Historial de llamadas** ahora ofrece un selector de día, **Hoy** y **Actualizar**, sin paginación. Muestra todos los intentos registrados durante la fecha seleccionada, en una sola vista tanto en computadora como en móvil.
- El endpoint protegido GET `/api/conmutador/historial?fecha=AAAA-MM-DD` usa el índice de `creado_en` mediante rango `>= fecha` y `< fecha + 1 día`, sin `LIMIT`, `OFFSET` ni consulta adicional de conteo.
- Se validan las fechas del cliente; los resultados únicamente contienen calle, vivienda, fecha y hora. No se transmiten números telefónicos.
- Las consultas recientes de cada día se conservan 15 segundos (máximo cinco días); **Actualizar** omite ese caché. Al cambiar de fecha se cancela una petición anterior para evitar resultados mezclados.
- El POST del historial, el motor de telefonía, las llamadas por iPhone/WhatsApp y el agente de caseta no cambian. El iframe del Conmutador **sigue excluido de la caché de páginas**.

## Optimización adicional de pestañas, modales y contadores
- Casa Club reutiliza durante 12 segundos una consulta reciente de Administración/Aprobación al alternar entre esas pestañas y comparte solicitudes concurrentes. Después de aprobar/rechazar/liberar/eliminar, solicita datos nuevos sin forzar una sincronización Google innecesaria.
- Al volver a consultar el calendario del mismo mes, conserva visibles los días anteriores hasta recibir una respuesta; deshabilita interacción y envío de la reserva hasta tener confirmación del backend. Evita parpadeos sin permitir reservas sobre datos antiguos.
- Los iframes embebidos ya no consultan individualmente adeudos y solicitudes pendientes para los indicadores del menú: lo hace el shell padre una sola vez, con un pequeño intervalo antirrebote y ambas APIs en paralelo.
- Los mensajes de actualización de Pagos se aceptan también desde los marcos dinámicos que usa la nueva caché, preservando la actualización del indicador sin afectar OCR, comprobantes ni pagos validados.
- El observador de modales del shell continúa agrupando cambios en un único fotograma; no se altera la lógica de los formularios.

## Pruebas obligatorias antes de fusionar
1. Abrir el historial de Conmutador en PC y celular, elegir una fecha con varios intentos y verificar que aparecen todos en una sola vista; cambiar entre días y usar Hoy/Actualizar.
2. Comprobar generación de un intento al iniciar llamada, acceso del agente de caseta, permisos y ausencia de números telefónicos en la respuesta del historial.
3. Alternar Administración/Aprobación de Casa Club: abrir inmediatamente sin repetir la consulta al instante; después de una aprobación, cancelación o eliminación debe actualizarse la tabla y la ocupación real.
4. Probar calendario de Casa Club en la misma fecha y al cambiar mes, con conexión lenta y sin Google Sheets. Reservar no puede habilitarse hasta obtener verificación.
5. Regresar a secciones habituales, entrar y salir de modales, cambiar vivienda, abrir Pagos y subir JPG/PDF; verificar OCR, recargos, conciliación, ZKTeco y las llamadas del Conmutador.
6. Medir tiempos en DevTools/Hostinger antes y después. No se afirman mejoras porcentuales sin mediciones reales.

Estas optimizaciones no requieren cambios de estructura SQL ni ejecutan migraciones en producción.
