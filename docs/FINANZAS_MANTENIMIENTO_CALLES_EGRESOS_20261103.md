# Finanzas Misión Jardines — ingresos por calle y egresos por concepto

## Motivo

El panel anterior mostraba **$0 ingresos bancarios validados** aunque existían
cuotas registradas como **PAGADO** por el administrador. Ese número no era el
total de mantenimiento cobrado: sumaba exclusivamente movimientos bancarios
validados y dejaba pagos manuales separados de ingresos principales.

## Tablero de ingresos por mensualidad cubierta

**Ingresos por calle** se calcula con el importe efectivamente abonado a
**cada cuota de mantenimiento correspondiente al mes seleccionado**, NO con el
importe de un movimiento de caja que liquide varios meses de una sola vez.
El sistema muestra ocho calles oficiales; pagos manuales, históricos y bancarios
conciliados suman por su período real (año y mes guardado en `cuotas`).

**Ejemplo:** Un recibo anual de $600, registrado el 2 de noviembre para cubrir
NOVIEMBRE y DICIEMBRE de 2026, produce **$300 en la barra de noviembre y
$300 en la de diciembre**, usando `monto_pagado` de cada cuota. Un pago
de $350 por una mensualidad atrasada se muestra como **$350 en el mes cubierto**
si el pago realmente incluye un recargo de $50; no se vuelve a sumar el recargo.

El modal histórico de una calle utiliza **el mismo reparto** de enero al mes
elegido, con meses vacíos en $0. Si un pago cubre varios meses, el modal
reparte conforme a sus aplicaciones y no por una división presupuesta.

**Importante: contabilidad de caja vs mensualidades cubiertas.** El total
recibido el día de la operación se mantiene en `recibidoMes` y alimenta el
balance del sistema. El campo `mes` de ingresos por calle ahora describe
**mensualidades cubiertas**, no depósitos recibidos ese mes. El acumulado
`acumulado` sigue siendo el total recibido con todos los movimientos únicos.

Si un banco validado no dispone de un desglose por cuota, su monto sigue en el
acumulado/caja pero **no** se asigna arbitrariamente a noviembre: se indica
`sinPeriodo` para conciliarlo. Las mensualidades importadas **sin fecha de
cobro** cuentan correctamente en el mes cubierto porque conocemos su
`anio`, `mes` y `montoPagado`. No se inventan fechas.

Las viviendas de prueba/auxiliares fuera del padrón no afectan el agregado.
El indicador no sustituye una conciliación bancaria auditada.

**Egresos: Gastos por concepto.** Tanto el importe del mes como el acumulado
hasta el corte se calculan por fecha real del egreso. No se reparten como
adeudo de viviendas salvo los gastos expresamente clasificados como
`CUOTA_EXTRAORDINARIA` y configurados para cobro.

## Categorías nuevas (8)

- CFE
- SIAPA
- Jardinería
- Mantenimiento
- Cuota extraordinaria
- Internet
- Servicios
- Otros

Los gastos almacenados anteriormente con `LUZ` y `AGUA` **se conservan**
en la BD, pero se suman y se muestran bajo CFE y SIAPA. `PROYECTOS` se suma
y se muestra en Cuota extraordinaria. No se borra información histórica.

`backend/src/services/finanzas-schema.service.js` comprueba el ENUM de MySQL
y lo amplía solo si faltan las opciones. Si Hostinger no tiene permiso ALTER,
ejecutar manualmente **después de respaldar**
`backend/sql/2026-11-03-categorias-egresos.sql`, luego reiniciar Node.js.

## Excel

El botón de descarga de la cuarta tarjeta financiera ahora agrega una hoja
`Mantenimiento por calle` con cuotas cubiertas del mes y total de movimientos acumulado, además
de conservar cuotas, bancos, ingresos adicionales y pagos manuales para
conciliación.

## Google 403 access_denied

La captura indica **OAuth externo en modo de pruebas**. No es un problema
de saldos ni del backend. En el mismo proyecto de Google Cloud usado para
`GOOGLE_DRIVE_CLIENT_ID`, abrir
`https://console.cloud.google.com/auth/audience` →
**Usuarios de prueba → Agregar usuarios** y agregar la cuenta
`misionjardines.gdl@gmail.com`, guardar y reintentar **Conectar con Google
Drive** desde Misión Jardines.

Si se pretende uso continuo, revisar el estado de publicación y la
verificación OAuth. En modo Testing los refresh tokens externos con
`drive.file` pueden caducar a los 7 días; no confiar en respaldos
automáticos a largo plazo sin completar la configuración de publicación.

## Despliegue y validaciones

1. Fusionar el PR y desplegar el backend Node.js en Hostinger, comprobando
   el arranque de `asegurarFinanzas`.
2. Actualizar GitHub Pages y recargar Análisis de cuotas. Seleccionar
   **noviembre de 2026**.
3. Comprobar un pago manual real en noviembre: su calle muestra el monto de la cuota correspondiente al mes seleccionado
   sin incluir el mes siguiente de un pago anual.
4. Registrar egreso de prueba en entorno de pruebas bajo Internet y comprobar
   que aparece en el panel y el filtro. Revisar Luz/Agua históricos.
5. Comprobar la descarga del Excel financiero y que el padrón
   continúa en **231 viviendas**.
6. Verificar que pagos y TAGs originales no se alteraron; este PR solo cambia
   lectura de datos y catálogo de egresos.
