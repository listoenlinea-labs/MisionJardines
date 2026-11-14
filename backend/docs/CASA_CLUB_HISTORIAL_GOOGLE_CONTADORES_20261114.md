# Casa Club: historial completo de Google y contadores

## Por qué el administrador veía 5 y Google tenía 19
- **Aprobación** muestra solo reservas con estado `PENDIENTE` en MySQL (5 en las capturas).
- **Administración** conserva todas las reservas MySQL, incluso aprobadas y rechazadas (8 en las capturas).
- En el Sheet había **13 folios MJ-** de formulario antiguo y **6 folios CC-** exportados por el backend, que son espejos de reservas existentes, no 19 reservas adicionales.
- El sincronizador inicial omitía los folios antiguos cuya **fecha de evento era anterior al día actual**. Con este PR se mantienen en la tabla histórica **en modo solo lectura**, sin inventar estado de pago ni alterar el calendario.

## Comportamiento
- **MySQL manda** en todas las fechas ocupadas y conserva su color y estado. Los folios antiguos para un mismo día y vivienda local no se vuelven a contar.
- La nueva tabla administrativa muestra registros adicionales de Google, incluso eventos ya pasados y filas con domicilio pendiente de conciliación. Aparecen como **Histórica · Google**, **En revisión · Google** o **Conflicto · Google** y con etiqueta **Solo consulta · Google**, sin acciones de modificar, cancelar ni registrar pago.
- El panel de Aprobación conserva únicamente pendientes de MySQL, con sus filtros y paginación actuales. Añade cuatro estadísticas: **Solicitudes únicas**, **Personas distintas (estimación)**, **En revisión** y **Reservadas**.
- La sección Administración conserva sus métricas financieras basadas exclusivamente en pagos validados de MySQL y añade solicitudes/personas consolidadas. Los históricos Google no generan ingresos ni egresos.
- La pestaña **RESERVACIONES** ORIGINAL de Google incorpora cifras en **K1:L5**, a la derecha de A:J, manteniendo intactas las columnas que utiliza Apps Script:
  - Solicitudes únicas (ambos sistemas).
  - Personas distintas (estimación).
  - En revisión.
  - Reservadas.
- Si K1:L5 contiene datos ajenos a nuestro encabezado automático, se **omite** la escritura y se registra advertencia; no sobrescribe datos del cliente.
- La cuenta de personas es una **estimación**, calculada a partir de correo, teléfono o nombre y vivienda. No equivale al número de filas, y puede no coincidir con el número de personas físicas si las familias comparten datos.
- **No hay migración MySQL**: el historial se consulta del Google Sheet original y se combina en la respuesta del administrador. Si Google está inaccesible, siguen apareciendo las reservas MySQL; el frontend indica que el resumen podría estar incompleto.

## Pruebas
Tests de historia antigua, folios CC espejo, coincidencia por fecha y vivienda, conflictos, resumen por persona y restricción de solo lectura. Sintaxis JS comprobada. Hace falta validación integrada en Hostinger con el Sheet original y en móvil/escritorio.

## Activación
No se requiere variable nueva. Tras fusionar y desplegar el PR, mantener `CASA_CLUB_GOOGLE_SYNC_ENABLED=true` si ya está funcionando. En Google Sheets, desplázate horizontalmente hasta las columnas **K y L** para ver el resumen.
