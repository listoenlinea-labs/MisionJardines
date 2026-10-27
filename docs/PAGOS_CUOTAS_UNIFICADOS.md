# Pagos, cuotas y ZKTeco: último corte cubierto

**Regla vigente del 24/oct/2026.** Sustituye la reconstrucción de huecos mensuales
introducida en #288. El código se preparó sobre main `88cde5f`.
No acredita despliegue ni pruebas sobre MySQL, buzón o C3 reales.

## Fórmula del adeudo

La vivienda es la unidad de cobro. `cuotas` conserva el último periodo completo,
los abonos y el historial. La tarifa viene de `direcciones.cuota_por_cobrar`.

**Principal pendiente = máximo(0, meses entre corte actual y último corte cubierto
× tarifa − principal ya abonado).** A ese importe se agregan recargos pendientes,
descontando los que ya se cubrieron. Se trabaja en centavos y meses calendario,
nunca días divididos entre 30.

No se calcula la deuda revisando la presencia/ausencia de cada mes desde septiembre
ni desde el último pago. El último mes completo fija la cobertura; cualquier hueco
anterior del histórico se considera anterior a ese corte y no se cobra nuevamente.
La base es septiembre de 2026 SOLO cuando no existe cobertura registrada.
Las condonaciones/cancelaciones administrativas explícitas se descuentan del importe,
sin inventar depósitos ni redefinir el último mes pagado.

Pagos consulta primero el último corte y los abonos posteriores. La revisión de
referencias históricas para impedir reutilizar un depósito es independiente del
cálculo financiero. Análisis conserva su consulta histórica para tablas/recibos,
pero el importe usa la misma fórmula. Su resumen no genera el desglose mensual;
solo se enumera cuando se solicita el detalle de adeudos o se acredita el historial.

Se conserva la regla de recargo de $50 por corte pendiente después del día 10,
la tarifa por vivienda, los recargos ya cubiertos y la excepción existente de
laboratorio `PRUEBA_10_PESOS` en octubre de 2026. Un anticipo lleva el corte al futuro;
la diferencia negativa se limita a cero. `monto_cuota` o `saldo_pendiente` antiguos
no se suman de nuevo para reconstruir deuda anterior al último corte.

## Mes cubierto y fecha del depósito

Cada mensualidad completa acredita el mes siguiente al último cubierto. No se puede
omitir uno para marcar otro posterior pagado. Por ejemplo, con octubre de 2026 como
último mes cubierto, un depósito de octubre de 2027 que alcanza para recargos y una
mensualidad acredita NOVIEMBRE DE 2026, conserva la fecha bancaria de OCTUBRE DE 2027
y deja once mensualidades pendientes. No compra octubre de 2027 por ser el mes del depósito.

Los campos `anio`/`mes` identifican el periodo cubierto. `fecha_pago` conserva la
fecha bancaria de su abono/terminación y `fecha_confirmacion` la de acreditación.
`pagos_reportados` conserva cada depósito y su reparto individual, incluidos los
complementos; una cuota acumula esos abonos sin duplicar ingresos en el historial.

El corte final se conserva el día 10 del siguiente mes: octubre cubierto produce
el 10 de noviembre. La resta de esos cortes equivale a la diferencia entre periodos
cubiertos y periodo consultado. La fecha del depósito nunca sustituye el mes cubierto.
Un abono parcial no avanza el corte; el complemento termina ese mes antes de avanzar.

La API de captura administrativa rechaza un periodo que salte el siguiente y no
permite mover el periodo de una cuota ya pagada. Los lotes se procesan cronológicamente.
Los registros históricos permanecen intactos: su último corte implica cobertura
anterior sin insertar pagos ni cambiar fechas de depósitos antiguos.

## Confirmación y acceso

El OCR y los cotejos bancarios existentes siguen siendo obligatorios. Reportar solo
guarda `PENDIENTE_VALIDACION` y el reparto propuesto, ahora versión 2. Al confirmar,
el backend bloquea la vivienda y verifica el corte, tarifa y reparto. La misma
transacción valida el depósito, acredita las mensualidades y registra el diario.

Si un reporte previo de versión 1 coincide exactamente en datos y reparto, se puede
validar; si ya no coincide por la nueva regla o cambió su historial, requiere
conciliación y la confirmación se revierte. No atribuir meses antiguos por el importe,
no borrar evidencia para forzar la validación y no acreditar automáticamente pagos
ya validados. Referencias repetidas y comprobantes simultáneos pendientes se bloquean.

Sin TAG se puede pagar y el diario queda `SIN_TAGS`. C3 recibe después del commit el
objetivo absoluto respaldado por cuotas. Una falla TCP no elimina el abono; los
reintentos conservan el mismo objetivo, PIN, StartTime y autorizaciones. Si la fecha
física es posterior o cambia el vínculo/seguridad, se requiere revisar el conflicto.
No se reproducen pagos históricos cuando se agrega un TAG posteriormente.

## Esquema y despliegue

Este ajuste NO añade columnas ni borra registros. Si aún no se aplicó #288, sigue
siendo necesaria su migración aditiva `backend/sql/2026-10-24-pagos-cuotas-unificados.sql`
(o el aseguramiento de esas columnas al arrancar). Desplegar backend/frontend juntos.

El estado financiero no es de una cuenta: dos usuarios de la misma vivienda ven el
mismo corte. Para una prueba sin historial, limpiar exclusivamente los datos
sintéticos de esa vivienda, incluidos cuotas, reportes y sus diarios; conservar
cuenta y relaciones. Sin cuotas comenzará en septiembre de 2026. No borrar cuotas
reales: eliminarlas cambia la base del cálculo y no revoca fechas físicas del C3.

## Validación local

Desde la raíz del repositorio:

```sh
DB_PORT=3306 node --test backend/test/cuotas-mantenimiento-calculo.test.js backend/test/cuotas-mantenimiento-integracion.test.js backend/test/pagos-cuotas-reporte.test.js backend/test/pagos-manuales-analisis.test.js
```

45/45 casos dirigidos aprobados. Incluyen pago un año tarde, separación depósito/mes,
conservación exacta de importes, anticipos, cambio de año, abonos, recargos ya pagados,
base sin historial, carga del último corte, captura sin saltos y resumen sin desglose.
Persistencia y TCP simulados; sin operaciones externas ni dinero real.

La selección ampliada de 15 archivos da **130 casos, 123 aprobados y siete fallos**.
La misma selección sobre main da **119 casos, 112 aprobados y los mismos siete fallos**
(expectativas estáticas de UI, mock sin window, endpoint retirado revisarPago y
edición física de TAGs). Se actualizan las expectativas que exigían buscar
huecos o imponer septiembre aun con historial porque el usuario sustituyó esa regla.
No se afirma una suite global verde ni validación de producción.


## Abonos inferiores a recargos (27/oct/2026)

Todo depósito positivo de mantenimiento desde $0.01 se puede reportar y acreditar
tras la coincidencia bancaria. No se exige cubrir todos los recargos. Se abona primero
a los recargos, en orden de antigüedad, hasta agotar el dinero recibido. Solo si todos
quedan cubiertos, el restante se asigna al principal más antiguo. También aplica a
cada porción de un depósito repartido entre viviendas. La cuota guarda cuánto recargo
se ha pagado y cuánto dinero acumula; el complemento no vuelve a cobrar ese recargo.

Ejemplo: principal pendiente $300 y recargo $50; un depósito de $20 deja recargo $30
y principal $300, adeudo $330. Otro de $30 termina de pagar recargos; aún debe $300.
Al cubrir después esos $300 se completa la mensualidad y se avanza un corte. Los abonos
a recargos no avanzan TAGs. La operación conserva conciliación única, transacción y
cálculo compartido con Análisis; no afecta las tarifas ni condona deuda.

La cotización diferencia `recargo` (importe de este depósito destinado a recargos)
y `recargoPendienteDespues` (saldo de recargos). `minimoReporte` es $0.01; `minimo`
conserva el importe necesario para completar una mensualidad, no un mínimo obligatorio
de depósito. Los planes antiguos que cubrían todos los recargos conservan su reparto.
Sin SQL ni variables nuevas; desplegar backend/frontend juntos.
