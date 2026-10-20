# Inicio por roles y navegación persistente

## Inicio / API

- `SUPER_ADMIN` y `ADMINISTRADOR` conservan el tablero financiero que ya existía.
- `SEGURIDAD` ve visitas y accesos de todo el fraccionamiento, sin importes ni saldos.
- `CONDOMINO` ve únicamente visitas y accesos de viviendas activas en `usuarios_casas`; `usuarios.casa_id` no concede permisos.
- Si la tabla de visitas o accesos no está disponible, la otra fuente sigue funcionando. Los datos ausentes se muestran como **No disponible**, nunca como `0` confirmado.
- Si falla la consulta de viviendas autorizadas, el backend devuelve una vista operativa sin datos ajenos (nunca elimina el filtro para intentar recuperar resultados).
- Las excepciones de MySQL quedan registradas en logs de backend; no se publican consultas ni mensajes internos al usuario.

## Navegación

- `app.html?page=index.html` es el nuevo punto de entrada autenticado. El menú compartido queda montado en el documento principal.
- Cada módulo mantiene su documento, estilos, scripts y ciclo de vida dentro de un iframe **del mismo origen**. Al navegar se reemplaza únicamente el panel de contenido; el documento principal, menú y buscador no se recargan.
- La transición conserva la sección anterior hasta que carga la nueva. Admite **Atrás/Adelante** y deja el enlace activo resaltado.
- Los enlaces internos y la búsqueda global usan la misma política de permisos (`MJPermissions`) y el backend sigue autorizando todas las APIs. No se trata al `iframe` como control de seguridad.
- Enlaces externos y descargas no se enrutan dentro de la aplicación. Las redirecciones a `login.html` cierran el marco y llevan al login principal.
- Los accesos guardados a archivos HTML anteriores siguen abriendo; al usar su navegación se pasa a la estructura persistente.

## Pruebas manuales sugeridas tras el despliegue

1. Entrar como administrador y visitar **Inicio**, **Análisis de cuotas**, **Pagos**, **Casa club**, **Calendario**; probar modales y descargas.
2. Entrar como seguridad: **Inicio** debe mostrar indicadores operativos y nunca gráficas financieras; alternar **Visitas**, **Mapa** y **Reportes**.
3. Entrar como condómino con dos viviendas activas, comprobar que solo ve registros autorizados; cambiar la vivienda y verificar la recarga **solo del panel**.
4. Probar **Atrás/Adelante**, búsqueda global, enlaces externos, cierre de sesión y móvil.
5. Simular ausencia de una fuente operativa y confirmar que se muestra **No disponible** sin dejar en blanco Inicio.

No hay migraciones de base de datos ni modificaciones de pagos, cuotas o TAGs asociadas a este PR.
