# Cuotas extraordinarias — presupuesto y cuotas por vivienda (03-nov-2026)

## Alcance del cambio

- En **Análisis de cuotas → Cuotas extraordinarias** quedan visibles el selector del proyecto, **Nuevo proyecto** y un **Resumen financiero** plegable. El resumen inicia cerrado. Contiene Meta, Recaudado, Por recaudar, Casas cumplidas, Sin aportaciones y Avance. Se quita la tarjeta «Abonos parciales» (los abonos se conservan en historial y saldos).
- **Nuevo proyecto** abre un solo modal con nombre, costo total y mes inicial, seguido por la lista completa de las **231 viviendas** y sus cuotas calculadas. No se obliga a escribir 231 importes a mano. La búsqueda no elimina casas del reparto.
- **Generar excepción** fija el importe de una vivienda. El dinero restante se distribuye entre las viviendas sin excepción para preservar **exactamente el costo total ingresado**. Los centavos sobrantes se asignan de forma determinista por \`direcciones.id\`, con un mínimo de $0.01 por casa. Máximo 230 excepciones.
- El frontend solo presenta una simulación. El backend valida el padrón, las excepciones y recalcula el reparto en centavos mediante \`proyectos-presupuesto.service.js\` antes de crear un cargo por vivienda.
- En la tabla de viviendas se elimina **Modificar cuota**. Para modificar la cuota de un proyecto existente, el administrador abre **Historial** de la vivienda → **Modificar cuota del proyecto**. Se reutiliza el panel lateral del historial; queda separado del flujo de mantenimiento.
- La edición individual se audita con la ruta existente \`PATCH /finanzas/proyectos-extraordinarios/:id/viviendas/:casaId\`. No permite reducir el importe por debajo de las aportaciones confirmadas **o pendientes de validación**. Cambia la meta del proyecto, no otras cuotas, mantenimiento ni TAGs.
- Importaciones históricas anteriores, pagos, referencias, recibos \`-P\`, ZIP y Drive no se borran ni se modifican.

## Verificaciones

Ejecutar desde \`backend\`:

\`\`\`bash
node --test test/proyectos-presupuesto.test.js
node --test test/proyectos-extraordinarios-reglas.test.js
\`\`\`

Comprobaciones manuales recomendadas con un entorno de pruebas: abrir modal con 231 viviendas; crear proyecto con costo total, con/sin excepciones; verificar suma exacta incluso con centavos; guardar una excepción individual desde el historial; intentar reducir cuota por debajo de un abono; verificar mantenimiento, recibos y TAGs intactos.

**Importante:** merge y pruebas de código no demuestran conexión a MySQL de producción ni verificación en Hostinger. No ejecutar cargas reales en la base por una prueba automatizada.
