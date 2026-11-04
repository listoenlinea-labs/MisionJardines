# Rosas 10 — cuota noviembre bloqueada por movimiento C3 anulado

## Evidencia del diagnóstico (capturas MySQL Workbench aportadas)

- Casa: Rosas 10, `casa_id=542`.
- Cuota octubre 2026: `id=2740`, **PAGADO**, `monto_pagado=300`, saldo $0.
- Cuota noviembre 2026: `id=2815`, **PENDIENTE**, `monto_cuota=300`, `monto_pagado=0`, saldo $300; sin folio ni referencia confirmados.
- `pagos_reportados` para Mantenimiento: ninguna fila.
- `pagos_acceso_c3`: movimiento `id=46`, origen `CUOTA`, `origen_id=2815`, `estado=ANULADO`, movimiento histórico de $600.
- Ningún movimiento bancario vinculado a noviembre, y el único movimiento C3 mostrado se encuentra anulado.

## Causa y corrección

`comprobarReferenciasVinculadas()` estaba considerando cualquier movimiento encontrado, incluso con estado `ANULADO`, como impedimento para registrar el pago. Esto afecta tanto la cotización como la confirmación.

Se agrega `vinculosC3Bloqueantes()` para **ignorar únicamente movimientos ANULADO** al decidir bloqueo, manteniendo en la BD esos movimientos como historial intacto. Todo evento con otro estado continúa impidiendo cobros duplicados y las referencias de `pagos_reportados` siguen protegidas. El frontend no cambia; no hay migración SQL.

## Validación después del despliegue

1. Revisar que el evento `46` sigue `ANULADO` y que la cuota `2815` continúa `PENDIENTE`.
2. En `Análisis de cuotas → Mantenimiento → Rosas 10 → Registrar pago`, elegir noviembre 2026.
3. El cotizador debe mostrar una mensualidad pendiente de $300 antes del 10-nov (o el recargo correspondiente si se liquida después del 10), **salvo** que aparezca otro registro vinculado de estado activo o pendiente.
4. Revisar monto, fecha y operación antes de confirmar; este PR no crea cobros ni ajusta TAGs por sí solo.
5. Al confirmar un pago **realmente recibido**, verificar que noviembre quede PAGADO y que el nuevo evento C3 se genere con su propia referencia, sin reutilizar ni borrar el movimiento 46.

**No ejecutar DELETE/UPDATE directo sobre cuotas ni pagos_acceso_c3.** El movimiento anulado debe permanecer como evidencia histórica.