# Requisito de despliegue: lectura independiente de comprobantes

Desde este cambio, `POST /api/pagos` **no registra comprobantes** hasta que el servidor haya leído su imagen y confirmado ambos elementos **dentro de Destino/Beneficiario**:

- Titular completo definido en `PAGOS_TITULAR` (por defecto: MARIA DEL ROCIO BAHENA JUAREZ).
- Últimos cuatro dígitos definidos en `PAGOS_DESTINO_ULTIMOS4` (por defecto: `4409`).

La lectura enviada por JavaScript o el texto OCR del cliente **no se considera evidencia confiable**. El servidor vuelve a procesar la imagen usando Tesseract mediante el ejecutable de sistema.

## Antes de fusionar y desplegar

1. Comprobar en el servidor de Node/Hostinger que `tesseract --version` funciona y que `tesseract --list-langs` incluye `spa` y `eng`. Si Tesseract no está disponible en ese entorno, instalarlo mediante su administrador de sistema o desplegar el backend en una instancia que lo permita. **No fusionar sin resolver este requisito**: el endpoint fallará cerrado con HTTP 503.
2. Opcionalmente configurar `PAGOS_TESSERACT_BIN` con la ruta del binario, `PAGOS_OCR_LANG=spa+eng`, `PAGOS_TITULAR` y `PAGOS_DESTINO_ULTIMOS4=4409`.
3. Desplegar frontend y backend del mismo PR; limpiar caché del navegador.
4. Ejecutar `node --test test/comprobante-parser.test.js` desde `backend`.
5. Probar comprobante válido, destino incorrecto, cuenta incorrecta, fecha/folio/monto distinto y OCR no disponible. Ningún rechazo debe crear filas en `pagos_reportados`.
6. En celular, el selector anuncia fotos exclusivamente (sin `capture`), mientras en escritorio acepta PDF además de imágenes. Las opciones exactas de la ventana de selección las determina iOS/Android y no pueden limitarse completamente desde HTML.
7. Comprobar que las transferencias reconocidas permanecen `PENDIENTE_VALIDACION` hasta confirmarse por una fuente bancaria independiente. La presencia de destinatario correcto **no prueba** que el dinero haya llegado.

Notas: el OCR del servidor se ejecuta con un límite de dos comprobantes simultáneos y 30 segundos por imagen. En caso de caída, saturación o lectura ilegible se rechaza el reporte sin crear recibo. Se recomienda contar con conciliación bancaria real antes de automatizar cambios de vigencia del C3.
