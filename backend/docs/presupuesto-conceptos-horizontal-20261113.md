# Presupuesto, gastos reales y visualización móvil — 13-nov-2026

## Definiciones contables (no mezclar ámbitos)

- **Presupuesto base**: importe informativo de `cuotas_extraordinarias.monto_total`. No es una salida de efectivo. En registros anteriores donde sea NULL se consulta la suma de sus cargos como respaldo.
- **Gastos reales**: suma de los egresos vinculados por `egresos_fraccionamiento.proyecto_id`. Los históricos que todavía no tengan proyecto asignado siguen pendientes de conciliación; no se imputan arbitrariamente.
- **Incluido en presupuesto**, marcado por defecto al crear concepto: su importe se reconoce como gasto real, pero no incrementa el presupuesto comprometido.
- **Adicional fuera del presupuesto**, cuando se desmarca: su importe es gasto real y se suma al costo comprometido.
- **Costo comprometido** = presupuesto base + suma de gastos adicionales.
- **Diferencia presupuestaria** = aportaciones acumuladas - costo comprometido. No equivale al saldo bancario ni al saldo efectivo después de desembolsos; las salidas efectivamente registradas se presentan por separado.
- **Por comprobar** = máximo(0, presupuesto base - gastos incluidos). Puede haber sobrecostos incluidos; no se ocultan importes registrados.
- **Mantenimiento** mantiene su balance independiente basado en las cuotas cubiertas del mes y sus gastos del mes; Casa Club permanece independiente.

### Ejemplo

Presupuesto inicial $100,000; pintura $8,000 incluida; soldadura $5,000 adicional:

- Gasto realmente registrado: $13,000.
- Costo comprometido: $105,000 (nunca $113,000).
- De la base presupuestaria hay $92,000 todavía sin justificar con conceptos incluidos.

## Editar importes

- **Doble clic** en una fila de egreso (tabla de mantenimiento/proyecto) edita solamente ese egreso, con validación del importe anterior y confirmación. No se editan automáticamente ajustes contables ni movimientos históricos que generaron cuotas.
- **Doble clic** en costo presupuestado o total de Egresos del proyecto (incluida la tarjeta central) edita `monto_total`; **no** cambia los 231 cargos ni metas individuales. Para cambiar cuotas, usar Importes por vivienda.
- **Doble clic** en el total mensual de mantenimiento registra un asiento compensatorio en OTROS con signo positivo o negativo. No reescribe movimientos anteriores.
- Todas las ediciones se validan en servidor, en transacción, y se anotan en `finanzas_edicion_auditoria` con monto anterior, nuevo y administrador.

## Migración y despliegue

Al iniciar el backend, `asegurarFinanzas()` agrega idempotentemente
`egresos_fraccionamiento.incluido_presupuesto TINYINT(1) NOT NULL DEFAULT 1`
y crea `finanzas_edicion_auditoria` si no existe. Revisar permisos de ALTER/CREATE y hacer respaldo de la BD antes de desplegar.
Los movimientos antiguos pasan a `incluido_presupuesto = 1`, sin modificar montos.
La interfaz y backend deben desplegarse juntos.

## iPhone horizontal

En orientación horizontal, ancho al menos 600px y altura máxima 550px,
Ingresos, Diferencia y Egresos aparecen en una fila (tres columnas). La vista
vertical mantiene su carrusel deslizable. No se modifica la paginación de viviendas ni de egresos.

## Comprobaciones

Validar en staging con datos reales: proyecto con presupuesto sin gastos, gastos incluidos, adicionales, comprobante, cambios concurrentes, edición de un gasto normal, edición de total de mantenimiento, rechazo de edición de ajuste automático, giro a horizontal/retrato y diferenciación Mantenimiento/Casa Club.
No ejecutar altas o cambios en producción hasta probar la migración y preparar respaldo.
