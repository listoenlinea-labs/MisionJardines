# Optimización de carga de secciones y archivos — 23 NOV 2026

## Hallazgos revisados en el repositorio
- app.html crea un iframe por sección y cada documento llamaba otra vez a /auth/perfil.
- La sección Pagos volvía a llamar a /auth/perfil incluso después del control de acceso.
- Las páginas Pagos y Casa Club descargaban OCR Tesseract y el motor PDF aunque nadie adjuntara un archivo.
- El contador /api/casa-club/solicitudes-pendientes aguardaba sincronización Google Sheets para realizar un COUNT en MySQL.
- Entrar a Administración Casa Club forzaba sincronizar Google Sheets; ahora la fuerza el botón Actualizar.
- Análisis de cuotas esperaba el histórico Google después de las lecturas MySQL; ahora empieza su consulta en paralelo.
- Adjuntar archivos a un gasto existente volvía a calcular los indicadores financieros sin cambiar importes.

## Cambios y límites
1. El perfil verificado se reutiliza solamente en el iframe del mismo origen, con token y vivienda coincidentes, por 60 segundos. Cambio de casa o apertura directa obliga a consultar de nuevo. El servidor sigue validando JWT, rol y vivienda en todas las APIs protegidas.
2. Se calienta la conexión con la API y se predescargan documentos HTML autorizados al apuntar o enfocar su enlace, sin ejecutar el documento ni consultar APIs privadas. Respeta Save Data y conexiones 2G.
3. Motores OCR y PDF se descargan solo en la lectura de archivos. Conservan el cotejo bancario independiente del servidor.
4. Contadores de Casa Club usan MySQL, sin esperar Sheets. "Actualizar" en administración sigue forzando la sincronización externa.
5. Histórico Google 2026 se consulta en paralelo con SQL, sin modificar su cálculo, modo de fallo ni ingresos.
6. Cargar documentos a gastos existentes actualiza lista e indicador sin recargar las finanzas. Registrar o modificar un importe sí sigue recalculando el balance.
7. Diagnóstico en los logs de Hostinger para rutas API de 1500 ms o más, sin cuerpos, tokens, referencias ni parámetros. En Chrome DevTools también se puede revisar la marca "mj-section-navigation".

## Verificación manual tras desplegar
- Abrir Inicio, Pagos, Casa Club, Análisis y volver atrás; revisar duración de "mj-section-navigation" en la pestaña Performance.
- Verificar que las páginas cargan sin descargar Tesseract ni pdfjs hasta seleccionar una foto o PDF; comprobar OCR, reintento y errores en celular.
- Cambiar la vivienda seleccionada y validar que no se muestran datos de otra vivienda.
- Abrir Administración de Casa Club y pulsar Actualizar; confirmar lecturas Google sin alterar la reserva y los colores. El contador de pendientes no debe depender de Sheets.
- Adjuntar archivos a egresos de Mantenimiento, Extraordinarias y Casa Club; mantener monto, historial y comprobantes previos sin solicitud nueva a /finanzas/analisis por adjunto.
- Consultar logs [Misión Jardines][API lenta] en Hostinger para orientar próximos índices y consultas.

No se ha medido todavía el despliegue real; no se prometen porcentajes de mejora sin mediciones. No se modifican las reglas de recargos, pagos, reservas, OCR del servidor ni ZKTeco.
