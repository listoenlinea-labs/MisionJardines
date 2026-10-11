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

## Homologación visual adicional · 11/oct/2026

A partir de la sección **Cuotas** como referencia, todos los encabezados de vistas
autenticadas pasan a una cabecera compacta, y los indicadores de estado/cantidad
adoptan tarjetas pastel de altura reducida. La hoja de estilos compartida
`assets/css/ui-unificada.css` se carga tras `product-ui.css`.

### Cambios de contenido solicitados

- Conexión: retirado el aviso extenso sobre port forwarding / gateway local.
- Verificación de cuentas: retirado el bloque informativo repetido; formularios y
  permisos de aprobación permanecen.
- Pagos: retirado el resumen superior de vigencia, **sin retirar** la consulta
  `/pagos/vigencia` ni sus datos para vista previa de pago.
- Directorio: cabecera debajo de la búsqueda, igual que el resto de vistas;
  miembros ilustrativos de la mesa directiva en un panel cerrado por defecto.
  No se presentan esos nombres como datos oficiales.
- Análisis de cuotas: Pendientes muestra número de viviendas y porcentaje, con
  denominador protegido si el padrón está vacío.
- Residentes, Reportes y ZKTeco: textos decorativos y explicaciones repetidas
  acortadas. Visitas: vista de prueba en desplegable.
- Las métricas `good` y `bad` conservan colores de éxito/advertencia por
  encima de los colores decorativos pastel.

### Comprobaciones antes del merge

1. Comparar **Inicio, Residentes, ZKTeco, Reportes, Seguridad, Visitas, Cuotas,
   Calendario y Análisis** lado a lado a 390, 768 y 1440 px: tarjetas delgadas,
   etiquetas y valores visibles, sin elementos superpuestos.
2. Directorio: el título no debe quedar debajo del buscador; contactos y mesa
   directiva permanecen accesibles en escritorio y celular.
3. Pagos: abrir, cotizar y revisar un pago de mantenimiento; la consulta de
   vigencia no debe buscar nodos inexistentes ni cambiar recargos o fechas.
4. Verificación de cuentas: buscar, filtrar y abrir diálogo de aprobación;
   mantener validación de identidad y permisos.
5. Confirmar que Seguridad sigue mostrando el monitoreo de cámaras y que
   ZKTeco mantiene sus controles, aunque la pantalla Conexión ya no esté disponible.
6. Análisis: `Pendientes` debe mostrar `31 · 13%` para 31 de 231,
   `239 · 100%` para 239 de 239 y `0 · 0%` con padrón vacío.
7. Confirmar que advertencias de TAGs y acceso no se reinterpretan como éxito
   solo por el nuevo tono pastel.

Prueba estructural opcional: `node --test tests/ui-unificada.test.cjs`.
La comprobación estática y el merge **no son evidencia** de validación visual
en un dispositivo real ni de pruebas financieras o TCP.

## Ajuste del portal · Inicio sin iconos / Conexión retirada

- Inicio: cuatro KPI con colores pastel, títulos y valores, **sin iconos**.
- Conexión: eliminadas la página `docs/conexion.html`, su opción del menú y
  el botón de acceso desde Seguridad. Los enlaces a la pantalla retirada no
  deben aparecer tampoco en la búsqueda global.
- Se mantienen los servicios existentes de cámaras, controlador C3-200 y
  telefonía; **la configuración previamente guardada no se elimina**.
  Sin la página Conexión ya no existe un formulario para editar esos parámetros
  desde el portal; cualquier reconfiguración futura requerirá otra interfaz
  autorizada o una implementación posterior.
- Los tests `ui-responsive`, `ui-unificada` y `ui-inicio-kpis-reportes`
  se adaptaron a esta eliminación. Pruebas de HTML/CSS no validan hardware.

## KPIs horizontales y Directorio recuperado (octubre 2026)

- **Alcance:** los indicadores numéricos de Inicio, Residentes, Cuotas,
  Análisis, ZKTeco, Reportes, Seguridad, Visitas, Calendario y resúmenes de
  envío de recibos comparten el mismo formato **etiqueta | valor**.
  Se oculta el texto explicativo terciario de esas tarjetas, pero no el
  título, la cifra, los estados de control, los mensajes de error ni las
  acciones del sistema.
- **Estilo:** `docs/assets/css/kpi-compact.css`, cargado después de
  `ui-unificada.css` en todas las vistas internas. La tarjeta se hace más
  baja y mantiene la paleta pastel original.
- **Móvil:** en dos columnas los valores no deben quedar cortados. Si una
  etiqueta extremadamente larga no cabe, se permite un salto de línea
  interno; no se oculta el importe ni se desborda la pantalla.
- **Directorio:** se retiró la clase genérica `hero` de la cabecera para
  evitar que herede un grid de portada; permanece el buscador, categorías,
  mesa directiva desplegable y las tarjetas de contacto con acciones.

### Revisión previa al merge

1. Verificar a 360, 390, 768 y 1440 px que las etiquetas y cifras de
   las tarjetas numéricas están en el mismo renglón cuando cabe.
2. Confirmar que Alertas, Sin conexión, TAG bloqueado, Comprobantes
   rechazados y otras advertencias funcionales **no** desaparecen.
3. En Directorio, comprobar sin hacer scroll que se ve el buscador debajo
   del encabezado, y que la lista responde a sus filtros.
4. En Calendario y Análisis, comprobar que los indicadores aún cambian al
   recibir datos y al seleccionar otro mes.
5. Las tarjetas de contactos, registros y formularios conservan sus
   descripciones; no forman parte del diseño KPI de una sola fila.

Prueba estática: `node --test tests/ui-kpi-compact.test.cjs`.
