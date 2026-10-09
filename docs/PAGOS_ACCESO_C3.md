# Pagos e incrementos de acceso en el C3-200

El C3 es la fuente de la fecha final. Cada nuevo importe confirmado de mantenimiento, después de descontar el recargo registrado, compra meses completos de $300. El remanente inferior a $300 queda registrado para el siguiente pago. No se suman los ingresos de toda la vida de la vivienda ni se calcula desde `fecha_base`.

Para cada TAG asociado a la vivienda se lee su fecha real, se agregan los meses comprados y se fija el día 10 del mes resultante. Por ejemplo, una fecha física del 11 de septiembre y $600 netos producen el 10 de noviembre. Si luego un administrador cambia la fecha física, el siguiente pago parte de esa nueva fecha. No hay mes de gracia ni cómputo desde la fecha del pago.

El recargo ya no depende del día del depósito por sí solo. Se lee la fecha final física de todos los TAGs de la vivienda y se enumeran los cortes del día 10 vencidos antes de la fecha bancaria. Cada corte pendiente genera $50 una sola vez. Una fecha física histórica de día 11 se interpreta con corte de cobro del día 10 de ese mes. Pagar adelantado después del día 10 no genera recargo.

La cotización exige cubrir los recargos pendientes y principal suficiente para una mensualidad, considerando el saldo a favor. No exige múltiplos de $350. Por ejemplo, $1,500 con un recargo de $50 compran cuatro meses y dejan $250. Se conserva el máximo de 36 meses por movimiento y la fecha bancaria válida desde octubre de 2026.

`GET /api/pagos/cotizacion?fechaOperacion=YYYY-MM-DD` consulta solo la vivienda activa del usuario autenticado. El formulario solicita esta estimación al seleccionar la fecha y el backend vuelve a consultar al registrar el comprobante. No utiliza fechas locales como sustituto cuando falla el C3. Se detiene la cotización si faltan TAGs/fechas, sus fechas difieren, existe un comprobante pendiente o un incremento anterior sin terminar. Resolver esos casos antes de registrar otro pago de mantenimiento. Las cuotas extraordinarias no consultan el C3 ni llevan este recargo.

Al arrancar se agrega `pagos_reportados.cortes_recargo` (JSON nullable) y se crea `recargos_mantenimiento`, con clave única por `casa_id` y `corte`. Los cortes del comprobante se registran como pagados en la misma transacción que su validación y el diario de acceso. Rechazar un comprobante no paga sus recargos. Si el primer abono deja acceso vencido, el siguiente no vuelve a cobrar cortes ya cubiertos.

Los comprobantes antiguos sin `cortes_recargo` y los recargos capturados manualmente en Cuotas no se reinterpretan ni asignan automáticamente a meses. Si una vivienda sigue vencida y esos pagos históricos ya cubrieron recargos, Administración debe conciliar los cortes correspondientes antes de utilizar la cotización automática; no se puede inferir el periodo a partir del importe solo.

## Diario de aplicación

El arranque del backend crea, mediante `sync()` sin `alter` ni borrado, estas tablas:

| Tabla | Contenido |
| --- | --- |
| `pagos_acceso_c3` | Movimiento confirmado, origen, importe, recargo, principal nuevo reconocido, meses comprados, remanente y estado del envío. |
| `pagos_acceso_tags_c3` | TAG destinatario, Pin, autorizaciones observadas, fecha física anterior, fecha posterior y resultado. |

El intento por TAG se confirma en SQL **antes** de enviar TCP. Sirve para auditoría y recuperación; no es una fecha financiera que se copie periódicamente al equipo. Si TCP funcionó y falló el registro posterior en SQL, el reintento reconoce la fecha ya aplicada y no vuelve a sumar meses. Los bloqueos por vivienda serializan pagos y trabajadores del backend.

Un movimiento con la misma referencia bancaria en Pagos y Cuotas se reconoce una sola vez dentro de la vivienda. Cada pago distinto necesita una referencia propia. En cuotas editadas se considera solo el principal positivo adicional; una reducción, rechazo o eliminación no retrocede automáticamente fechas físicas. La conciliación de esos casos corresponde a Administración.

`vigencias_mantenimiento` se conserva como referencia heredada. Su fecha base, fecha final y pendientes antiguos no se reenvían al C3. Los pagos ya confirmados antes de esta entrega tampoco se reproducen automáticamente. Dar de alta, reasignar o inventariar un TAG no aplica pagos históricos ni hereda una fecha de SQL: el alta exige una fecha explícita del administrador.

## Fallos y operación

- `PENDIENTE` / `PREPARADO`: incremento nuevo esperando envío o confirmación.
- `ERROR`: fallo de conexión/registro; el backend reintenta con espera creciente. El barrido predeterminado es cada cinco minutos, con mínimo de un minuto; solo consulta este diario, no pendientes heredados de vigencias.
- `CONFLICTO`: cambió la fecha, el Pin, las autorizaciones o la asociación a vivienda después de preparar el intento. Se detiene la cola de esa vivienda para no sobrescribir cambios ajenos. Revisar el diario y el C3 antes de intervenir; no borrar las fechas del intento para forzar un nuevo cálculo.
- `SIN_TAGS`: pago registrado sin destinatarios. Requiere conciliación manual; el alta posterior de un TAG no consume ese pago automáticamente.
- `SIMULACION`: `ZKTECO_DRY_RUN=true`; no se lee ni escribe el C3. Para aplicar pagos reales, usar `ZKTECO_DRY_RUN=false`. Los envíos de este flujo usan TCP `DIRECT` y no recurren al bridge.
- `COMPLETADO`: no se vuelve a enviar el incremento.

La aprobación financiera se confirma antes del envío al equipo: un C3 desconectado no elimina el pago aprobado. La página muestra la última fecha observada en SQL para consulta; el cálculo siempre vuelve a leer el equipo. Los pagos solo cambian fechas, no asignan puertas ni eliminan un bloqueo explícito.

El C3 no ofrece una transacción compartida con MySQL ni una operación condicional atómica de fecha. Se verifica el estado antes de escribir, pero no se puede excluir una escritura externa simultánea desde ZKAccess entre esa verificación y el envío. Evitar operaciones simultáneas sobre el mismo TAG durante una prueba o conciliación.

## Consulta de aclaraciones

Estas consultas son de lectura. Sustituir el identificador por la vivienda que se quiera revisar:

```sql
SET @casa_revision = 702;
SELECT * FROM pagos_acceso_c3
WHERE casa_id = @casa_revision ORDER BY id DESC;

SELECT p.id AS movimiento, p.origen, p.origen_id, p.referencia,
       p.monto_origen, p.recargo_origen, p.meses,
       p.estado AS estado_movimiento, p.error AS error_movimiento,
       t.numero_tarjeta, t.pin, t.fecha_antes, t.fecha_despues,
       t.estado AS estado_tag
FROM pagos_acceso_c3 p
LEFT JOIN pagos_acceso_tags_c3 t ON t.pago_acceso_id = p.id
WHERE p.casa_id = @casa_revision ORDER BY p.id DESC, t.id;
```

## Prueba después del despliegue

1. Usar una vivienda y un TAG de prueba, asociados correctamente y con autorizaciones físicas que ya permitan acceso. Leer y guardar la fecha actual del C3.
2. Confirmar un pago nuevo con referencia única y $300 netos. Comprobar que el C3 termina el día 10 del mes siguiente al de su fecha anterior, incluso si esta no era día 10.
3. Repetir la consulta o aprobación del mismo movimiento: no debe agregar otro mes.
4. Cambiar manualmente la fecha real del TAG después de completar el primer pago. Confirmar otro pago distinto de $600 netos: debe avanzar dos meses desde esa fecha física.
5. Probar una desconexión temporal con otro movimiento. Al recuperar conexión, comprobar que el diario completa el intento sin duplicar meses.

Las pruebas automatizadas usan modelos y TCP simulados. Esta entrega no ha escrito al controlador de producción ni ejecutado migraciones contra su MySQL.

## Consulta de recargos confirmados

```sql
SELECT casa_id, corte, pago_id, monto, createdAt
FROM recargos_mantenimiento
WHERE casa_id = @casa_revision ORDER BY corte;

SELECT id, folio_operacion, fecha_operacion, monto, recargo, cortes_recargo, estatus
FROM pagos_reportados
WHERE casa_id = @casa_revision ORDER BY id DESC;
```

Prueba específica: con fecha real 10 de octubre, pagar $300 el 8 de octubre avanza a noviembre. Un nuevo pago de $300 el 12 de octubre no genera recargo y avanza a diciembre. Con fecha real 10 de septiembre, pagar $400 el 12 de octubre cubre $100 de recargos y un mes; otro pago de $300 ese mismo día no vuelve a cobrar esos recargos. Utilizar fechas bancarias reales en producción y referencias distintas.
