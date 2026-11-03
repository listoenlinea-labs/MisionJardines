# Anulación auditada de aportaciones extraordinarias (03-nov-2026)

## Objetivo
Desde Análisis de cuotas → Cuotas extraordinarias → Historial de vivienda, cada aportación identificable de origen administrativo o importada del Excel muestra **Borrar** al lado de **Generar recibo**.

La anulación es intencional, no una eliminación silenciosa:
1. El administrador selecciona el proyecto y la vivienda, pulsa **Borrar** en un movimiento.
2. La API consulta exclusivamente esa aportación por proyecto, vivienda, fuente e ID. Confirma que no está asociada con un comprobante bancario y devuelve una vista previa con fecha, importe y referencia.
3. Se muestra la primera confirmación, detallando importe, proyecto y advertencia sobre PDFs ya descargados o guardados en Drive.
4. El administrador debe escribir exactamente **ANULAR**.
5. Una transacción SERIALIZABLE bloquea el cargo y la aportación, coteja de nuevo referencia e importe, inserta la fila **original** en \`proyectos_aportaciones_anulaciones\` con usuario y fecha y retira únicamente el movimiento confirmado. Si algo falla, se revierte todo.
6. Se recarga Análisis de cuotas y el historial para actualizar saldo pendiente, acumulado, estado y avance sin modificar ni C3/TAGs, ni cuotas ordinarias, ni otros aportes.

### Reglas de seguridad
- Se admiten aportaciones de \`aportaciones_extraordinarias\` (incluidos \`ADMIN\` y \`EXCEL_HISTORICO\`) y pagos manuales legados \`pagos_manuales_concepto\` del concepto EXTRAORDINARIO vinculados al cargo.
- Los comprobantes de \`pagos_reportados\` bancarios, tanto validados como pendientes, **NO** se anulan aquí: requieren un proceso específico de conciliación bancaria.
- Las operaciones usan rol SUPER_ADMIN/ADMINISTRADOR en la API. La opción no concede permisos a residentes ni al rol Seguridad.
- La referencia, importe, vivienda, proyecto, ID y origen deben coincidir al guardar. Una aportación anulada no se puede anular otra vez; el índice único de auditoría impide duplicados.
- PDFs de recibos emitidos antes de la anulación no se eliminan automáticamente del equipo del usuario ni de Google Drive. Requieren gestión documental aparte.

### Base de datos
La tabla \`proyectos_aportaciones_anulaciones\` se crea al iniciar el backend mediante \`asegurarProyectosExtraordinarios()\` y no requiere ejecutar un SQL manualmente si el usuario de MySQL dispone de permisos para crear tablas. Si el usuario no cuenta con ellos, el despliegue debe realizarse después de preparar la tabla con una migración administrativa; el servidor no debe intentar anulaciones sin su registro de auditoría.

### Pruebas
En \`backend\`: \`node --test test/anulacion-aportaciones-extraordinarias.test.js\`.

Verificar en clon de MySQL: registro de un abono de $200 para cuota de $600; anular el abono y comprobar saldo de $600, sin afectar otras viviendas/proyectos ni el histórico de mantenimiento. Reintentar la misma anulación y comprobar conflicto 409. Verificar importaciones históricas, pagos manuales legados y conciliación bancaria bloqueada. No probar directamente con cobros reales.
