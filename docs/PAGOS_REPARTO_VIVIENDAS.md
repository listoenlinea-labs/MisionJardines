# Repartir un depósito de mantenimiento entre viviendas

La sección de reparto aparece en Pagos únicamente cuando el usuario tiene
**dos o más viviendas activas** en `usuarios_casas`. Una sola vivienda conserva
el flujo anterior. Los cuadros duplicados de Calle/Número se retiraron del formulario
el 27/oct/2026; el domicilio sigue identificado en el reparto y el resumen del residente. Se limita a mantenimiento; extraordinarias y casa club mantienen
sus cargos específicos. Cada domicilio muestra su adeudo contable a la fecha de
consulta y un importe editable. Cero significa no asignar. Una casa con comprobante
pendiente no recibe otro pago. La cotización muestra recargos, meses y corte objetivo
por vivienda; no promete ponerla al corriente si la asignación es insuficiente.

El monto bancario conserva el valor leído por OCR. La suma debe coincidir exactamente
en centavos; no se redondean asignaciones con más de dos decimales. Reportar queda
bloqueado hasta tener lectura completa y cotización válida. Cambiar importes, fecha o
comprobante invalida la cotización. El servidor vuelve a leer la imagen, exige monto
extraído incluso a Administración, comprueba vínculos y recalcula los planes.

El umbral se corrigió de tres a dos viviendas el 27/oct/2026; el frontend existente
respeta la bandera `habilitado` recibida del servidor. Requiere desplegar el backend
para que las cuentas con exactamente dos viviendas vean el reparto.

## Persistencia y acreditación

No hay tablas ni columnas nuevas. Se usa el JSON `pagos_reportados.aplicacion_cuotas`
ya existente, con `version:3`, `tipo:REPARTO_MANTENIMIENTO`, `aplicado` y
`distribuciones:[{casaId,monto,calle,numero,plan}]`. Cada plan es el mismo plan vigente
de cuotas (versiones 1/2). El padre conserva monto total, folio e identificadores,
OCR, comprobante, hash bancario y estado únicos. Su `casa_id` es la primera vivienda
financiada en orden de ID; no representa que reciba el importe completo.

Las consultas de pendientes usan `JSON_CONTAINS` junto con casa_id para cubrir las
viviendas secundarias. La conciliación verifica el depósito total una vez. Después
se bloquean los vínculos y se aplican los planes ordenados por ID en la misma
transacción del pago/hash. Si cambia una tarifa, cuota o vínculo asignado, todo se
revierte y requiere revisión. Al confirmar se exige conservar los vínculos de las viviendas asignadas,
aunque ya solo quede uno activo. Los ceros no producen movimientos.

Cada vivienda conserva recargos, mensualidades consecutivas y saldo propios. Se
crea un evento PAGO_CUOTAS por vivienda con el mismo origen de depósito y clave
idempotente diferenciada por casa. El escritor C3 busca el plan de esa casa y exige
cuotas de respaldo; solo programa entrega tras COMMIT. Sin TAGs se acredita el abono
y se conserva SIN_TAGS. No se multiplican meses ni dinero por número de viviendas.

## Consultas y privacidad

Análisis, historial por vivienda, último registro y recibos de Análisis proyectan
únicamente el importe y las aplicaciones de esa casa, sin duplicar cuotas ya
acreditadas. Ingresos globales suman el depósito una sola vez. El historial
administrativo mantiene un renglón de depósito con desglose por casa. El PDF conjunto
incluye una página de distribución.

Mis recibos muestra los depósitos repartidos al reportante, aun si cambia de vivienda
activa. El PDF, imagen y reintento conjuntos siguen esa propiedad; un miembro de una
sola casa no obtiene por ese vínculo el desglose de las otras. Los pagos ordinarios
conservan su acceso por vivienda. El historial administrativo conserva sus permisos.

## Despliegue y pruebas

Desplegar backend y frontend juntos. No requiere SQL ni variables adicionales sobre
la migración de cuotas ya existente; requiere MySQL con JSON_CONTAINS (ya se utiliza
un campo JSON). No ejecutar instancias antiguas que interpreten el plan versión 3
como si fuera uno individual. No mover manualmente casa_id ni editar este JSON.

`node --test backend/test/pagos-reparto*.test.js` verifica suma en centavos, umbral,
permisos, OCR, cotización/reporte, aplicación real de cuotas con almacenamiento
simulado, rollback conjunto, pendientes secundarios, proyección de historiales y
comportamiento de la UI ante errores y respuestas tardías. No consulta DB, banco,
SMTP ni hardware reales. El despliegue y los bloqueos de MySQL requieren una prueba
de aceptación en el entorno correspondiente; los mocks no los certifican.
