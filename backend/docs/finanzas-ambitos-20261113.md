# Finanzas separadas por ámbito — 13 de noviembre de 2026

Se distinguen Mantenimiento, Casa Club y Cuotas extraordinarias (cada proyecto por ID).
No se alteran cuotas, pagos, aportaciones ni los TAGs del sistema ZKTeco.

## Balances

- Mantenimiento: mensualidades cubiertas en el mes menos egresos de mantenimiento
  del mismo período, sin sumar gastos de proyectos ni Casa Club.
- Casa Club: cuotas de recuperación y limpieza cobradas menos gastos propios del
  mes. No contabilizar garantías reembolsables como ingresos.
- Proyecto: aportaciones acumuladas de las viviendas participantes menos gastos
  REALES asociados a ese proyecto. El presupuesto o costo estimado del proyecto
  solo sirve de referencia, y NO es automáticamente dinero gastado.
- Las viviendas con meta alcanzada y las que no la han alcanzado son grupos
  mutuamente excluyentes. Los pagos parciales se muestran en las métricas de detalle.

## Crear un proyecto y registrar gastos

- Tanto Nuevo proyecto como Registro de egresos con categoría PROYECTO llaman al
  servicio existente de creación de proyectos extraordinarios. El monto del alta
  representa el presupuesto, distribuido entre viviendas según las reglas actuales.
- Al seleccionar un proyecto, se agregan conceptos de gasto real, fecha y monto;
  se admite PDF/JPG/PNG opcional de hasta 1 MB. Cada registro real queda vinculado
  por proyecto_id y puede consultarse con autorización de administración.
- Para gastos ordinarios, Registro de egresos permite asignar MANTENIMIENTO o CASA_CLUB.
- La opción CUOTA_EXTRAORDINARIA se retira de formularios de nuevas altas, pero se
  preservan sus movimientos previos.

## Conciliación histórica

Las categorías antiguas PROYECTO, PROYECTOS y CUOTA_EXTRAORDINARIA pasan al ámbito
EXTRAORDINARIO, sin alterar sus importes. Los egresos históricos sin proyecto_id
permanecen SIN ASIGNAR: no se imputan por similitud de descripción o fecha ni se
incluyen en el balance de ningún proyecto seleccionado. Se necesita una
conciliación administrativa posterior, sin duplicar presupuestos como gastos.

## Despliegue

1. Desplegar backend y sus nuevas columnas de egresos_fraccionamiento (ambito,
   proyecto_id, comprobante_archivo). La API corre la migración idempotente al iniciar.
   El SQL de ejemplo es MANUAL; no ejecutarlo dos veces sobre columnas existentes.
2. Desplegar la interfaz docs/ y backend desde la misma revisión; el frontend nuevo
   requiere el nuevo contrato de la API.
3. La carpeta storage/comprobantes-egresos/ debe ser persistente, estar respaldada
   y NO estar en backend/public/. Revisar permisos y retención de evidencias.
4. Conciliar primero los gastos históricos de PROYECTO sin proyecto_id y confirmar
   el padrón oficial de 231 casas antes de atribuir gastos a un proyecto.
5. Validar en un entorno de pruebas creación de proyectos, comprobantes, saldo
   por ámbito, paginación de egresos de 10/3 y filtros.

Los balances son informativos y no equivalen a un estado de cuenta bancario.
