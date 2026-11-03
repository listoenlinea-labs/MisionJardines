# Recibos de mantenimiento por movimiento completo

## Regla única de emisión

Los cuatro puntos de entrada —**Generar recibo** desde Análisis de cuotas, **Generar recibo** en el historial, **Descargar todos los recibos** (ZIP mensual) y respaldo PDF a **Google Drive**— usan el mismo servicio `recibo-mantenimiento-analisis.service.js` y el mismo generador `generarReciboPdf`.

**Elegir un mes sirve para localizar el movimiento que pagó ese mes, no para recortar el recibo al mes elegido.** Una referencia que liquidó varios meses siempre representa el importe completo y el período íntegro acreditado. No debe emitirse un recibo parcial del mismo movimiento ni sumarse otra vez el recargo.

### Ejemplo Gardenias 4, 2-NOV-2026

- Tipo: **PAGO ANUAL DE MANTENIMIENTO** (solo cuando al menos una cuota del movimiento tiene `origen_importacion = MANUAL_ANALISIS_ANUAL`).
- Fecha del movimiento: 02-NOV-2026.
- Importe del movimiento: **$600 MXN**.
- Periodo cubierto: **NOVIEMBRE 2026 A DICIEMBRE 2026**.
- Folio único y determinístico del movimiento, con mes inicial del rango: `MJ-NOV-2026-<HASH>-G4-M.pdf`.
- Elegir noviembre o diciembre en el modal, o descargar desde el historial de mantenimiento, ZIP o Drive, produce **el mismo contenido y el mismo folio**.
- La etiqueta `pagoAnual` describe el tipo de pago administrativo, incluso si el monto únicamente cubrió los meses que faltaban del año. **Nunca** afirmar que cubrió enero a diciembre si solamente se liquidaron noviembre y diciembre.

### Otros escenarios

- **Pago ordinario de varios meses:** detallar todo el rango, importe total y sin la leyenda "anual".
- **Mensualidad individual:** indicar solo ese mes y su importe.
- **Abono parcial:** etiqueta `ABONO RECIBIDO`, no `PAGADO`.
- **Cobro con recargo:** el importe se obtiene del historial del movimiento; no volver a sumar los recargos.
- **Diferentes referencias:** conservar folios diferentes. Los recibos no mezclan pagos independientes aun cuando se hayan aplicado a la misma casa.

## ZIP, Drive y documentos anteriores

El ZIP de un mes incluye por vivienda el **recibo íntegro del movimiento que acredita el mes seleccionado**. Si el mismo pago cubre noviembre y diciembre, se podrá descargar desde ambos meses, con **idéntico PDF**; no hay doble cobro.

Google Drive almacena los PDF con el folio único del movimiento en `02_Recibos_PDF/2026`, en la carpeta autorizada con Picker. Si ya existe ese mismo folio, el respaldo actualiza el archivo. **Archivos antiguos con folios distintos creados por la versión anterior (por ejemplo un PDF de diciembre que recortaba el movimiento) no se eliminan automáticamente**: deben revisarse antes de retirar duplicados obsoletos de Drive.

**Despliegue:** actualizar backend Hostinger, desplegar frontend de GitHub Pages y refrescar la página. No hay nueva variable de entorno ni migración de datos para este PR.

## Pruebas

El test `backend/test/recibo-mantenimiento-analisis.test.js` verifica movimientos anuales y ordinarios con dos meses, selector de mes, referencia del historial, mismo folio y total, recargo $650, importes de abonos y generación PDF en memoria.
