# Pagos e incrementos de acceso en el C3-200

El C3 es la fuente de la fecha final. Cada nuevo importe confirmado de mantenimiento, después de descontar el recargo registrado, compra meses completos de $300. El remanente inferior a $300 queda registrado para el siguiente pago. No se suman los ingresos de toda la vida de la vivienda ni se calcula desde `fecha_base`.

Para cada TAG asociado a la vivienda se lee su fecha real, se agregan los meses comprados y se fija el día 10 del mes resultante. Por ejemplo, una fecha física del 11 de septiembre y $600 netos producen el 10 de noviembre. Si luego un administrador cambia la fecha física, el siguiente pago parte de esa nueva fecha. No hay mes de gracia ni cómputo desde la fecha del pago.

El cálculo utiliza el recargo guardado por el módulo de pagos/cuotas; no vuelve a deducirlo. Las reglas existentes del formulario de pagos siguen cotizando mensualidades de $300 o $350 con recargo, hasta 36 meses y con sus validaciones de importe. Este cambio no modifica esa política de captura.

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
