# Navegación rápida y segura — 23 noviembre 2026

## Diagnóstico confirmado en el código
La versión anterior de docs/assets/js/app-shell.js limpiaba el src del iframe anterior a los 250 ms. Cada regreso a una sección obligaba a crear todo su DOM, volver a ejecutar JavaScript, esperar verificaciones y volver a solicitar datos. Esto ocurre aun cuando la persona acaba de visitar la pantalla.

## Solución de navegación
- Caché LRU **solo en memoria** de secciones frecuentes: Inicio, Análisis de cuotas, Casa Club, Avisos, Calendario y Directorio. Volver a una sección conservada reutiliza exactamente su iframe, sin cargar la página de nuevo.
- Máximo **tres iframes en celular**, **cuatro en computadora**, incluido el activo. Expiran tras **cuatro minutos desde su carga**; al necesitar espacio se descarta el menos recientemente usado.
- **Excluidos deliberadamente** de reutilización: Pagos, ZKTeco, Conmutador, Visitas, Cuotas con autoguardado y otros módulos con dispositivos o tareas sensibles. Sus scripts, reglas, websocket/bridge, OCR, validación Titan, bloqueos TAG y lógica de llamadas permanecen intactos.
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
