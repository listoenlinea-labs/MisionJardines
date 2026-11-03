# Cuotas extraordinarias — presupuesto y cuotas por vivienda (03-nov-2026)

## Alcance del cambio

- En **Análisis de cuotas → Cuotas extraordinarias** quedan visibles el selector del proyecto (resaltado en **verde menta pastel** cuando hay uno activo), **Nuevo proyecto**, **Importes por vivienda** y un **Resumen financiero** plegable. El resumen inicia cerrado. Contiene Meta, Recaudado, Por recaudar, Casas cumplidas, Sin aportaciones y Avance. Se quita la tarjeta «Abonos parciales» (los abonos se conservan en historial y saldos).
- **Nuevo proyecto** abre un solo modal con nombre, costo total y mes inicial, seguido por la lista completa de las **231 viviendas** y sus cuotas calculadas. No se obliga a escribir 231 importes a mano. La búsqueda no elimina casas del reparto.
- **Generar excepción** fija el importe de una vivienda. El dinero restante se distribuye entre las viviendas sin excepción para preservar **exactamente el costo total ingresado**. Los centavos sobrantes se asignan de forma determinista por \`direcciones.id\`, con un mínimo de $0.01 por casa. Máximo 230 excepciones.
- El frontend solo presenta una simulación. El backend valida el padrón, las excepciones y recalcula el reparto en centavos mediante \`proyectos-presupuesto.service.js\` antes de crear un cargo por vivienda.
- En la tabla de viviendas se elimina **Modificar cuota**. Para modificar la cuota de un proyecto existente, el administrador abre **Historial** de la vivienda → **Modificar cuota del proyecto**. Se reutiliza el panel lateral del historial; queda separado del flujo de mantenimiento.
- La edición individual se audita con la ruta existente \`PATCH /finanzas/proyectos-extraordinarios/:id/viviendas/:casaId\`. No permite reducir el importe por debajo de las aportaciones confirmadas **o pendientes de validación**. Cambia la meta del proyecto, no otras cuotas, mantenimiento ni TAGs.
- Importaciones históricas anteriores, pagos, referencias, recibos \`-P\`, ZIP y Drive no se borran ni se modifican.

## Tres formas complementarias de configurar las cuotas

1. **Nuevo proyecto — presupuesto fijo:** se introduce el costo total; las 231 cuotas se distribuyen automáticamente. Cuando una casa tiene una excepción fija, el saldo se redistribuye entre las demás; la suma no cambia.
2. **Importes por vivienda — proyecto existente:** restaura el modal anterior de «Modificar metas de [proyecto]» con cuota general, búsqueda y **Generar excepción** para cualquiera de las 231 viviendas. Se precargan todas las excepciones reales del proyecto, incluidas las diferencias de centavos de repartos anteriores. Al guardar, el sistema recalcula **la meta del proyecto** desde las cuotas definitivas (no conserva forzosamente el presupuesto original).
3. **Historial de vivienda → Modificar cuota del proyecto:** permite ajustar exclusivamente esa vivienda y recalcular la meta, conservando aportaciones, auditoría y TAGs. Al volver a abrir «Importes por vivienda», la cuota modificada aparece como excepción si difiere de la general.

Ambos editores de proyectos existentes guardan en los mismos cargos extraordinarios y se reflejan en los indicadores, estados y saldos tras actualizar. El editor masivo incluye una versión de las 231 cuotas originales: si otra administración cambia la cuota general o alguna cuota individual mientras la ventana está abierta, se cancela el guardado masivo con un aviso para volver a abrirla. La validación se hace dentro de la transacción bloqueada, no solo en el navegador.

## Verificaciones

Ejecutar desde \`backend\`:

\`\`\`bash
node --test test/proyectos-presupuesto.test.js test/proyectos-cuotas-version.test.js
node --test test/proyectos-extraordinarios-reglas.test.js
\`\`\`

Comprobaciones manuales recomendadas con un entorno de pruebas: comprobar el selector verde pastel y su foco de teclado; abrir «Importes por vivienda» y verificar las excepciones históricas; editar una vivienda desde historial, recargar y comprobar la sincronización con el editor masivo; simular una edición concurrente y comprobar error 409; conservar el flujo de creación de proyectos por presupuesto y su modal. Además: abrir modal con 231 viviendas; crear proyecto con costo total, con/sin excepciones; verificar suma exacta incluso con centavos; guardar una excepción individual desde el historial; intentar reducir cuota por debajo de un abono; verificar mantenimiento, recibos y TAGs intactos.

**Importante:** merge y pruebas de código no demuestran conexión a MySQL de producción ni verificación en Hostinger. No ejecutar cargas reales en la base por una prueba automatizada.
