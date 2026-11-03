# Finanzas Misión Jardines — ingresos por calle y egresos por concepto

## Motivo

El panel anterior mostraba **$0 ingresos bancarios validados** aunque existían
cuotas registradas como **PAGADO** por el administrador. Ese número no era el
total de mantenimiento cobrado: sumaba exclusivamente movimientos bancarios
validados y dejaba pagos manuales separados de ingresos principales.

## Tablero nuevo

**Ingresos: Mantenimiento cobrado por calle**. Por cada una de las calles del
padrón oficial, muestra:
- **Mes seleccionado:** dinero realmente registrado como recibido entre el
  primer y el último día de ese mes, independientemente de los meses cubiertos.
- **Total acumulado:** dinero registrado como recibido hasta el último día del
  período elegido, incluyendo meses anteriores.
- **Total general:** suma de las calles visibles del padrón.

El cálculo agrupa por vivienda y movimiento contable (referencia), usando el
mismo historial que el modal de mantenimiento. Incluye cuotas y pagos manuales,
depósitos bancarios validados conciliados, recargos incluidos en el importe
registrado y pagos importados fechados. No vuelve a sumar un banco cuando ya
está aplicado a una cuota. **Un pago anual de $600 registrado el 2 de noviembre
por noviembre y diciembre se cuenta una vez, con $600 de ingreso de noviembre**.
No se atribuye $300 adicional a diciembre si no hubo otro cobro allí.

Los movimientos sin fecha verificable quedan fuera de la gráfica y se informa
cuántos requieren conciliación. Las viviendas auxiliares/test fuera del padrón
no inflan el total. El resultado del panel es **cobranza registrada**, no un
estado de cuenta bancario auditado. Los ingresos por cuotas extraordinarias,
Casa Club y otros conceptos no se suman al gráfico de mantenimiento.

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
`Mantenimiento por calle` con total cobrado durante el mes y acumulado, además
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
3. Comprobar un pago manual real en noviembre: su calle muestra el importe
   cobrado una única vez en el mes y en el acumulado.
4. Registrar egreso de prueba en entorno de pruebas bajo Internet y comprobar
   que aparece en el panel y el filtro. Revisar Luz/Agua históricos.
5. Comprobar la descarga del Excel financiero y que el padrón
   continúa en **231 viviendas**.
6. Verificar que pagos y TAGs originales no se alteraron; este PR solo cambia
   lectura de datos y catálogo de egresos.
