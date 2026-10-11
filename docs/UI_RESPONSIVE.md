# Misión Jardines · revisión de interfaz responsive

Este PR cubre las vistas autenticadas con `site-sidebar.js` y los accesos públicos
de inicio de sesión, registro e invitación. No modifica permisos, endpoints,
consultas MySQL ni comandos TCP hacia ZKTeco.

## Objetivo visual y operativo

- **Pantallas grandes:** encabezados de una línea o dos y tarjetas compactas; el contenido útil aparece antes sin scroll decorativo.
- **Tabletas:** columnas fluidas; no se pierde el menú ni quedan acciones fuera de la pantalla.
- **Teléfonos:** menú lateral cerrable tocando fuera, buscador visible, KPIs en dos columnas y formularios agrupados en filas comprensibles.
- **Tablas:** análisis financiero usa fichas de lectura en móvil (sin editar datos). Las tablas editables u operativas conservan todas sus columnas y acciones con desplazamiento **dentro del contenedor**, nunca recortándolas.
- **Análisis:** cuatro KPIs prioritarios, ocho secundarios desplegables y listado de viviendas paginado en bloques de 12. La búsqueda y los filtros vuelven a la primera página.

## Comprobación manual antes del merge

Usar al menos **360 × 800**, **390 × 844**, **768 × 1024**, **1366 × 768** y **1920 × 1080** en un navegador moderno. Probar con roles permitidos, datos reales y estados vacíos.

| Vista | Revisar especialmente |
| --- | --- |
| Inicio | Tarjetas y acciones; búsqueda superior; mapa y actividad sin desbordamiento |
| Cuotas | KPIs, filtro, tabla editable, autoguardado, navegación de páginas |
| Análisis de cuotas | KPIs secundarios desplegables, 12 filas/página, filtros, alta de egreso |
| Pagos | Reportar comprobante, validación, pendientes, modales y recibos |
| Casa Club | Calendario, formulario, reservas, tablas |
| Residentes | Búsqueda, filtros, información de tabla y botones |
| Mapa | Mapa interactivo, detalles, controles y leyenda |
| Conmutador | Calles desplazables y botones grandes para casas |
| Seguridad | Tarjetas de acceso, formularios y tablas |
| Visitas | Registro, filtros, QR, listado y modales |
| ZKTeco | Búsqueda, paginación, acciones de TAG y modales |
| Reportes | Filtros, tabla, nueva incidencia y estado |
| Calendario | Cambiar mes, detalle del día y eventos |
| Directorio | Búsqueda y tarjetas |
| Conexión | Formularios y secciones de canales |
| Anuncios, cuenta, Mis viviendas, verificación | Campos, botones, estados vacíos y permisos |
| Inicio de sesión, registro, invitación | Tamaño del formulario, validaciones, teclado del teléfono y botones accesibles |

### Criterios de aceptación

1. No hay desplazamiento horizontal **de toda la página** a 360 px; si una tabla necesita más ancho, el scroll es solo interno.
2. Ninguna función, columna editable, confirmación, aviso de error ni botón desaparece por una regla visual.
3. El menú se abre/cierra con el botón, con el fondo y con Escape; la navegación oculta no recibe foco.
4. Las métricas grandes no rompen las tarjetas, ni los campos de formulario se montan entre sí.
5. Las ventanas modales caben en altura de pantalla y permiten desplazarse hasta sus botones.
6. Las tablas de Análisis mantienen 12 métricas totales y muestran como máximo 12 viviendas por página.
7. Los permisos por rol continúan siendo los mismos y los estados no cambian por un ajuste visual.
8. Probar específicamente pago, bloqueo y alta de TAG **solo en el entorno autorizado**, separando comprobación visual de integración real.

## Pruebas estáticas

Desde la raíz del repositorio:

```bash
node --test tests/ui-responsive.test.cjs
```

Estas comprobaciones validan presencia de rutas, enlace a la hoja responsive, estructura del menú y del Análisis, y sintaxis de scripts. **No equivalen a pruebas visuales ni a pruebas en hardware.**
