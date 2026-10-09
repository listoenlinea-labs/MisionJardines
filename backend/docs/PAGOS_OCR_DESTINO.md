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

Notas: el OCR del servidor se ejecuta con un límite de dos comprobantes simultáneos y 30 segundos por imagen, incluida la inicialización; cada lectura utiliza workers que se terminan al finalizar o al agotarse el tiempo. En caso de caída, saturación o lectura ilegible se rechaza el reporte sin crear recibo. Se recomienda contar con conciliación bancaria real antes de automatizar cambios de vigencia del C3.
