# Requisito de despliegue: lectura independiente de comprobantes

Desde este cambio, `POST /api/pagos` **no registra comprobantes** hasta que el servidor haya leído su imagen y confirmado ambos elementos **dentro de Destino/Beneficiario**:

- Titular completo definido en `PAGOS_TITULAR` (por defecto: MARIA DEL ROCIO BAHENA JUAREZ).
- Últimos cuatro dígitos definidos en `PAGOS_DESTINO_ULTIMOS4` (por defecto: `4409`).

La lectura enviada por JavaScript o el texto OCR del cliente **no se considera evidencia confiable**. El servidor vuelve a procesar la imagen con Tesseract.js (WebAssembly dentro de Node.js), sin ejecutar programas del sistema.

## Despliegue en Hostinger

1. Instalar las dependencias de `backend` con `npm ci`. El script `postinstall` prepara español e inglés en `node_modules/.pagos-ocr-data`. Si el despliegue deshabilita scripts de instalación, ejecutar `npm run postinstall` explícitamente en su etapa de construcción.
2. No es necesario instalar Tesseract con sudo ni configurar `PAGOS_TESSERACT_BIN`; esa variable ya no se utiliza. `PAGOS_OCR_LANG` es opcional (por defecto `spa+eng`; solo se admiten `spa` y `eng`). Conservar `PAGOS_TITULAR` y `PAGOS_DESTINO_ULTIMOS4=4409` con los datos reales de la cuenta.
3. Desplegar y reiniciar el backend. El núcleo WASM y los idiomas están incluidos como dependencias: las solicitudes no descargan modelos ni necesitan escribir una caché en el alojamiento.
4. Ejecutar `node --test test/comprobante-parser.test.js test/comprobante-lector.test.js` desde `backend`. La prueba del lector procesa un comprobante sintético mediante OCR real.
5. Probar comprobante válido, destino incorrecto, fecha/folio/monto distinto y archivo ilegible. Ningún rechazo debe crear filas en `pagos_reportados`. Comprobar memoria y tiempo de lectura en el plan contratado; el comportamiento real en Hostinger debe verificarse después del despliegue.
6. En celular, el selector anuncia fotos exclusivamente (sin `capture`), mientras en escritorio acepta PDF además de imágenes. Las opciones exactas de la ventana de selección las determina iOS/Android y no pueden limitarse completamente desde HTML.
7. Comprobar que las transferencias reconocidas permanecen `PENDIENTE_VALIDACION` hasta confirmarse por una fuente bancaria independiente. La presencia de destinatario correcto **no prueba** que el dinero haya llegado.

Notas: el OCR del servidor se ejecuta con un límite de dos comprobantes simultáneos y 50 segundos por imagen, incluida la inicialización; cada lectura utiliza workers que se terminan al finalizar o al agotarse el tiempo. En caso de caída, saturación o lectura ilegible se rechaza el reporte sin crear recibo. Se recomienda contar con conciliación bancaria real antes de automatizar cambios de vigencia del C3.


## Extracción flexible (26/oct/2026)

El mismo parser se entrega al navegador y al servidor. Conserva primero los campos
bancarios etiquetados y añade respaldo por expresiones «Enviaste», «Transferiste» y
«Transferencia por». Si no encuentra un monto etiquetado, admite un importe único
precedido por `$`. Excluye comisión, retención, impuestos, saldo, cuentas y otros
campos, tanto en el mismo renglón como en el siguiente. Varios candidatos diferentes
sin contexto suficiente dejan el campo vacío: no se elige el mayor ni el primero.

Reconoce los doce meses en español, abreviados o completos, fechas con diagonales,
guiones o puntos (día/mes/año; ISO año-mes-día), y fechas y horas sin etiqueta en
renglones independientes. Exige una fecha calendario válida con año. En el respaldo
sin etiqueta descarta fechas de vencimiento/impresión y candidatos diferentes.
No interpreta un nombre de mes aislado como fecha ni inventa año, hora o monto.

Se conserva el OCR independiente del servidor, el destino obligatorio, la comparación
de campos y la confirmación bancaria. No requiere servicios nuevos, SQL ni variables.
Desplegar backend y frontend juntos; `pagos.html` renueva la versión del parser.
Las pruebas usan texto ficticio: `node --test test/comprobante-formatos-flexibles.test.js
test/comprobante-parser.test.js test/comprobante-ocr-doble-lectura.test.js
test/comprobante-lector.test.js`. Una lectura correcta no acredita el depósito.
