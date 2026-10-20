# Cuota por cobrar configurable — Análisis de cuotas

Esta entrega requiere ejecutar **una sola vez** el SQL
`backend/sql/2026-10-20-direcciones-cuota-por-cobrar.sql` en la base real de Misión Jardines
**antes de desplegar** el backend del PR. No se ejecuta desde el PR.

## Nueva columna

`direcciones.cuota_por_cobrar DECIMAL(10,2) NOT NULL DEFAULT 300.00`.

- Todas las viviendas existentes y futuras quedan por defecto en **$300/mes**.
- La migración deja únicamente la dirección física **Atotonilco 752** en **$150/mes**, siempre que exista exactamente una coincidencia.
- La PK `direcciones.id` es `casaId`; el número de domicilio «752» no es el ID.
- Solo administradores y superadministradores pueden editar mediante `PATCH /api/finanzas/viviendas/:casaId/cuota-por-cobrar`.
- El valor se valida del lado del servidor: pesos enteros entre **$1 y $10,000**. El backend lee la tarifa de la vivienda, no la envía el navegador en los pagos.
- Cálculo de adeudo, cotización bancaria, registro manual, estado de vigencias y cuota nueva usan la misma tarifa.
- Los recargos existentes se conservan en **$50 por corte vencido**.
- Las cuotas antiguas pendientes guardadas con otra tarifa no anulan la tarifa nueva al recalcular el adeudo.
- La migración no modifica `cuotas`, `pagos_reportados`, `usuarios`, `zk_tarjetas` ni `pagos_acceso_c3`; no concilia ni reembolsa pagos pasados ni cambia vigencias históricas.

## Interfaz

En Análisis de cuotas → Consulta de viviendas → Mantenimiento, al pulsar la cantidad en la columna «Pagado» se abre el historial. «Modificar cuotas» despliega un panel junto al historial en escritorio o debajo en móvil; el historial permanece visible.

Las cantidades monetarias de Análisis, tablas de egresos, gráficas y exportaciones Excel y la gráfica/resumen monetario de Inicio se presentan en pesos enteros. **No se redondean ni alteran los valores persistidos en MySQL**; el redondeo de Excel afecta únicamente las cifras exportadas.

## Fotografías de Tráfico ZMG

La API sigue asociando la URL de una nota con su propia imagen de FreeNewsApi. Para las notas que realmente provienen de `traficozmg.com`, intenta recuperar el `og:image` de la página original y puede servir esa imagen mediante ticket público aleatorio de corta duración (necesario porque una etiqueta `img` no lleva el token de sesión). Solo se proxyfican imágenes bajo dominios oficiales de Tráfico ZMG o el CDN de WordPress para archivos con la ruta explícita de Tráfico ZMG; sin fotografía válida, la tarjeta muestra título y enlace, sin imagen ajena. El resto de fuentes sigue el proceso anterior.

## Comprobaciones tras desplegar

1. Verificar el `SELECT` final del SQL: Atotonilco 752 tiene 150; el resto, 300. Si hay duplicados, la excepción no se aplica y requiere depuración humana.
2. En la tabla «Quién pagó y quién está pendiente», revisar la cuota de Atotonilco 752 y otra casa; abrir el panel, editar temporalmente una vivienda de pruebas y confirmar valor/saldo.
3. Recalcular saldo hasta mes actual, mes anterior y anticipos, respetando pagos parciales.
4. Revisar cotización y registro manual sin generar cobros de prueba reales; nunca alterar TAGs para esta comprobación.
5. Confirmar que todos los importes mostrados en Análisis, egresos, Excel e Inicio aparecen sin centavos.
6. Abrir una noticia de Tráfico ZMG cuya página original tenga `og:image`. Si el origen bloquea las peticiones también al servidor o aloja su imagen en otro dominio, se mantiene una tarjeta sin imagen; no se sustituye por otra.

Las verificaciones locales hechas para el PR son de sintaxis y casos sintéticos. No sustituyen la ejecución del SQL ni las pruebas con la BD real, Hostinger o el controlador C3.
