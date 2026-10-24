# Pagos, cuotas y ZKTeco: fuente común por vivienda

Cambio solicitado el 23/oct/2026; reemplaza la regla anterior que cotizaba desde el C3.
El código se preparó sobre main `c5e044e1e0008ea21d7f99a51a6dd8e391c3d4f9`.
No acredita despliegue ni pruebas en MySQL, buzón o C3 reales.

## Fuente y cálculo

La deuda se obtiene de `cuotas`, vinculada por `casa_id` a `direcciones`.
La tarifa es `direcciones.cuota_por_cobrar` (predeterminada $300).
`cuotas-mantenimiento-calculo.js` comparte el cálculo por periodo con
`adeudo-vivienda-analisis.service.js`. Se respeta el inicio de septiembre de 2026
que usa Análisis: un mes sin fila también se considera pendiente.

La cotización usa la fecha bancaria comprobada (o hoy si la fecha operativa SPEI
es posterior), cobra $50 por mes pendiente después del día 10 y considera abonos,
condonaciones, cancelaciones y mensualidades pagadas. Análisis puede consultar otro
mes; ambos coinciden cuando usan el mismo corte. Se conserva la excepción existente
de la cuota de laboratorio de $10 identificada por `PRUEBA_10_PESOS` en octubre.
No hay una autorización financiera especial por correo o por tener TAG.

El depósito cubre primero los recargos pendientes y después los meses más antiguos,
con anticipos de hasta 36 mensualidades completas. Un abono insuficiente para un
mes queda en ese renglón de cuotas; no se cobra de nuevo el recargo ya cubierto.
`recargo_pagado` nullable distingue el reparto nuevo de los registros históricos,
cuyo cálculo anterior se conserva. Los centavos se asignan sin redondear meses.

## Reporte y validación

1. El OCR y las comprobaciones bancarias existentes siguen siendo obligatorios.
2. Reportar guarda `PENDIENTE_VALIDACION` y un reparto propuesto en
   `pagos_reportados.aplicacion_cuotas`; todavía no acredita cuotas ni acceso.
3. Una confirmación bancaria toma el lock de la vivienda y verifica que tarifa y
   cuotas no cambiaron respecto del reporte. Si cambiaron, exige conciliación y
   revierte toda la confirmación; no decide silenciosamente otro reparto.
4. La misma transacción marca el pago validado, crea/actualiza los meses de cuotas,
   conserva el desglose por depósito y registra el diario `PAGO_CUOTAS`.
5. Análisis, adeudos y el historial consultan esas cuotas. Los complementos conservan
   su propio folio y no duplican el total acumulado de una cuota en el historial.

Solo se permite un comprobante pendiente de mantenimiento por vivienda. Dos cuentas
de la misma vivienda comparten deuda. El folio de operación no se reutiliza y una
referencia ya acreditada en cuotas exige conciliación antes de aplicarse otra vez.
La captura administrativa de cuotas también entrega fechas absolutas (`CUOTA_SQL`);
los pagos manuales de Análisis conservan su confirmación explícita existente.

## C3 como destinatario

Pagar no necesita TAG, fecha física ni conexión TCP. La cobertura se obtiene de los
meses consecutivos cubiertos desde septiembre de 2026: octubre cubierto, sin huecos,
produce el 10 de noviembre. Un anticipo posterior a un hueco no concede cobertura
sobre el mes impago. Un abono parcial no extiende fechas.

Después del commit, los TAGs asociados reciben ese objetivo absoluto guardado en
`pagos_acceso_c3.fecha_objetivo`, respaldado por el pago validado y las cuotas.
El worker no suma meses a la fecha física para los eventos nuevos. Guarda la fecha
anterior por TAG antes de escribir, preserva PIN, StartTime y autorizaciones y
verifica la escritura. Reintentar no vuelve a ampliar la fecha.

Sin TAGs queda `SIN_TAGS`, con el pago acreditado en cuotas. No reproduce pagos
históricos cuando se agrega un TAG más tarde: ese alta requiere fecha explícita.
Fallo TCP deja el acceso pendiente de reintento sin deshacer el abono. Si la fecha
física ya es posterior al objetivo, o cambia la vivienda, el PIN o los permisos,
queda `CONFLICTO` para revisión; no se acorta automáticamente el acceso ni se deja
que el C3 cambie la deuda. La corrección manual explícita conserva su flujo anterior.

## Despliegue y datos anteriores

Respaldar y usar `backend/sql/2026-10-24-pagos-cuotas-unificados.sql`, o verificar
que el arranque del backend pudo agregar sus tres columnas. Desplegar backend y
frontend juntos. La migración es aditiva: no elimina tablas, pagos, TAGs ni columnas.

Los pagos ya validados no se vuelven a acreditar ni se reproducen contra el C3.
Antes de operar, conciliar los que anteriormente solo se reflejaron en acceso y
no en cuotas: ahora cuotas es la fuente, por petición del administrador. El SQL
incluye consultas de comprobantes pendientes sin reparto y entregas de acceso
anteriores aún abiertas. No borrar esos registros para forzar la validación.

Un comprobante pendiente anterior al cambio no tiene un reparto financiero fiable
con la fuente nueva: la confirmación responde 409 y pide conciliación administrativa.
Tampoco se reconstruye un reparto histórico a partir del importe o del C3.
Los eventos antiguos de acceso conservan su intención y auditoría; revisarlos antes
del despliegue. Borrar pagos no deshace los abonos en cuotas ni revoca TAGs.

## Validación local

Desde `backend/`, con dependencias instaladas:

```sh
DB_PORT=3306 node --test test/cuotas-mantenimiento-calculo.test.js test/cuotas-mantenimiento-integracion.test.js test/pagos-cuotas-reporte.test.js
```

Son pruebas de cálculo y persistencia/TCP simulados: sin TAG, pendiente sin crédito,
confirmación atómica, rollback, complementos, recargos, cambio de tarifa, duplicados,
respaldo del objetivo, fecha absoluta, reintento tras fallo SQL y conflicto C3.
También se ejecutan los checks de pagos/C3 de AGENTS y los de historial, tarifa,
registro manual y permisos; comparar sus fallos heredados con el mismo SHA de main.
La prueba real pendiente debe confirmar una casa con TAG y otra sin TAG, comparar
cuotas/Análisis antes y después de validar y verificar el registro físico del TAG.

Resultado local de la selección de 15 archivos de pruebas: **119 casos, 112 aprobados,
7 fallos heredados**. Las **20 pruebas nuevas** pasan. La misma selección sin archivos
nuevos sobre la base da 99 casos, 92 aprobados y los mismos siete fallos: dos referencias
al endpoint retirado `revisarPago`, dos expectativas de edición física de TAGs, dos
expectativas estáticas de UI y un mock de frontend sin `window`. No se cambiaron esas
reglas para ocultar fallos. Sintaxis de todos los JS cambiados y `git diff --check`
correctos. La suite histórica `pagos-pruebas.test.js` también conserva siete rechazos
422 por fixtures sin identificadores bancarios tanto en main como aquí; los nuevos
reportes se prueban con referencia sintética verificable. No es una suite global verde.
