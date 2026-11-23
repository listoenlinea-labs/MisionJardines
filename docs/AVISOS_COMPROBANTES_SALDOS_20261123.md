# Avisos oficiales y comprobantes múltiples — 23-NOV-2026

## Entregado en esta rama

1. «Anuncios» pasa a **Avisos**, tablón de lectura para CONDOMINO y publicación/eliminación exclusivamente por SUPER_ADMIN o ADMINISTRADOR. Los mensajes se guardan en MySQL y se comparten entre dispositivos; ya no dependen de localStorage. No hay comentarios, réplicas, respuestas ni botón de WhatsApp al autor. En backend los permisos se verifican por rol y token.
2. Los **egresos reales de Mantenimiento, Cuotas Extraordinarias y Casa Club** aceptan hasta 12 comprobantes nuevos por concepto, cada uno PDF/JPG/PNG de hasta 1 MB; el histórico de comprobante único se conserva. Los adjuntos se consultan por separado, con autenticación y verificación de cabecera de archivo. Se impide adjuntar exactamente el mismo archivo dos veces al mismo gasto.
3. La carga múltiple de *comprobantes de gasto* es documental: **no crea pagos, no modifica adeudos ni acredita ingresos**. Evita confundir una factura de proveedor con el depósito de un residente.

## Requisito financiero del cliente: pendiente de implementación contable completa

Las operaciones bancarias existentes siguen siendo **un depósito = un folio = un reporte verificado**. No aplicar este cambio solamente en la UI ni sumar importes extraídos de comprobantes como si fueran depósitos acreditados.

### Reglas de aceptación

- Mantenimiento: adeudo $350; pago bancario validado de $100 => saldo $250. Si deposita $400, aplicar $350 al adeudo y dejar $50 para la siguiente mensualidad, respetando recargos antiguos antes de principal. Un pago parcial no debe avanzar la vigencia ZKTeco.
- Cuota extraordinaria: meta restante $500; ingreso bancario validado de $650 => aplicar $500 a ese proyecto, reconocer $150 a favor de esa vivienda en la cuenta de extraordinarias. La persona puede conservarlo en esa cuenta o solicitar transferirlo a mantenimiento del próximo mes.
- Casa Club: obligación de ejemplo $2,000, depósitos bancarios independientes de $1,200 y $800 => reserva cubierta solo cuando **ambos** estén validados. Depósito único de $2,200 => $200 a favor de Casa Club para una reserva futura o transferibles a mantenimiento. Desglosar pago de recuperación, garantía y limpieza; una garantía todavía no reintegrada **no es** saldo libre de crédito.
- Si un comprobante está en revisión o rechazado, no se acredita el ingreso ni un saldo a favor.
- El saldo a favor es por **vivienda (direcciones.id)** y **ámbito**: MANTENIMIENTO, EXTRAORDINARIO o CASA_CLUB. No transferir entre viviendas por similitud de nombres.
- Toda transferencia tiene importe, origen, destino, usuario autorizante, fecha, movimiento origen y destino, estado y motivo; usar transacciones SQL y locks de vivienda, saldo no negativo e idempotencia. No duplicar ingresos en los indicadores ni convertir saldo a favor en un depósito bancario ficticio.
- Invalidar/cancelar un pago debe revertir sus aplicaciones y transferencias en orden verificable, o impedir la cancelación y pedir conciliación hasta revertirlas.
- Abonos bancarios múltiples deben ser **registros independientes**, no varias imágenes sobre el mismo reporte, porque cada depósito puede tener folio, hora y monto distintos. El formulario podría aceptar varios comprobantes en un lote, pero el servidor debe validar cada uno, persistir un movimiento único y mostrar el progreso individualmente.

### Implementación necesaria antes de activar las transferencias

1. Migración versionada para diario de aplicaciones de depósitos y diario de saldo a favor, con unicidad por movimiento bancario / aplicación; los saldos se calculan de entradas menos salidas y nunca desde números editados en frontend.
2. Cambiar la aplicación extraordinaria para separar importe de depósito e importe aplicado a la meta. Hoy el servicio de saldo suma el monto COMPLETO del reporte y el reporte rechaza depósitos mayores al restante.
3. Cambiar Casa Club para sumar reportes VALIDADOS bajo lock de reserva. Hoy exige un reporte exactamente igual al total y bloquea reportar más de uno.
4. API autorizada de consulta, selección de destino y transferencia para vivienda, y UI de historial/confirmación del saldo. Conservar el vínculo exclusivo a fecha/correo en la liga pública de Casa Club.
5. Pruebas sin MySQL de producción para 100/350, 400/350, 650/500, 1200+800/2000 y 2200/2000; cobros concurrentes, folio duplicado, reembolso de garantía, reversiones, y que la cuota de mantenimiento solo avance al completar un mes.

**Importante:** este PR no habilita todavía la transferencia de saldos ni los abonos parciales de Casa Club. No afirmar que el flujo completo quedó implementado ni desplegado. El PR debe permanecer como borrador hasta completar y verificar la contabilidad financiera. No ejecutar SQL contra producción de forma automática.
