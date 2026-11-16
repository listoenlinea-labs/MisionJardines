# Misión Jardines · Casa Club y plan de asignación de fondos (15-nov-2026)

## Correcciones del calendario
- La liga pública considera el **15/nov** el día actual, todavía válido hasta terminar ese día en `America/Mexico_City`. Solo fechas **anteriores** al día actual se deshabilitan por antigüedad; las ocupadas y la protección por falta de Google siguen aplicándose.
- Una solicitud **RECHAZADA/CANCELADA** no vuelve gris una fecha futura solo por conservarse en el historial del administrador. La fecha se muestra libre si ni MySQL ni reservas externas activas la ocupan. Las fechas pasadas reservadas siguen rojas para administración.
- No se eliminaron solicitudes, pagos, sanciones ni registros anteriores.

## Proyectos: estimado frente a real
- `metaEstimada` = importe de `presupuestoBase`; es una referencia de coste esperado y **no** entra en los egresos reales.
- `egresosReales` = suma de conceptos registrados, independientemente de las marcas `incluidoPresupuesto` y `pagado`.
- El saldo comparativo **no es saldo bancario**: aportaciones acumuladas menos egresos reales registrados.
- Ejemplo del proyecto de barandal: meta $138,600; ingresos $62,700; conceptos $24,432 y $29,300; egresos $53,732; diferencia a favor $8,968. El estimado restante ($84,868) **no es una deuda exigible ni un pago pendiente por sí mismo**.
- Para mostrar deuda efectiva, revisar los conceptos `pagado=false`. El detalle presupuestario histórico permanece visible por compatibilidad.

## Nuevo módulo «Administrar»
- Botón a la izquierda de «Generar recibo manualmente» en **Análisis de cuotas**. Solo los administradores que ya acceden a `/api/finanzas` pueden leer y guardar.
- Dos paneles: fuentes por Mantenimiento, Proyectos y Casa Club; gastos por los mismos ámbitos, con conceptos individuales, fecha, importe, estado pagado/pendiente y cuánto falta asignar.
- Orden por importes ascendentes/descendentes, búsqueda, selección accesible, arrastrar una fuente a un gasto, asignación parcial y remoción del borrador.
- Periodo del plan y periodo de origen del dinero independientes; se puede financiar un gasto con ingresos de un mes anterior. Los proyectos muestran su ingreso **acumulado** como fuente; la misma bolsa no puede asignarse dos veces en varios meses.
- Calcula por fuente los pesos todavía no asignados y el total no asignado. **Esto no equivale al saldo en bancos**: pagos, gastos históricos e ingresos de Google pueden requerir conciliación adicional.
- Notas de gestión hasta 1200 caracteres, `version` optimista, bloqueo de concurrencia y guardas de backend para no exceder los ingresos registrados ni el importe de un gasto. `GET/PUT /api/finanzas/plan-mensual`.
- **No** genera cargos, pagos, ingresos ni movimientos contables nuevos, transferencias reales, correos o actualización de TAGs.
- **Recomendación inteligente (heurística explicable)**: botón sobre el resumen del modal. Lee fondos disponibles en el mes de origen y los gastos registrados del mes del plan, descontando asignaciones existentes. Propone importes, muestra por cada gasto **fuente seleccionada, monto, motivo, fondos restantes, parte aún sin financiar**, además de los gastos que no pudo cubrir. Los motivos no son inventados por IA: reflejan reglas deterministas:
  1. Prioridad a gastos registrados **pendientes de pago**; dentro de ellos, necesidades esenciales de mantenimiento (vigilancia, CFE, SIAPA, Internet) y después fecha más antigua/monto mayor.
  2. Usar primero dinero del **mismo ámbito**. Los recursos de cada proyecto solo cubren automáticamente egresos de ese mismo proyecto, nunca otro proyecto. Las garantías reembolsables no se incluyen como ingreso operativo.
  3. Si un gasto pendiente no puede cubrirse con su ámbito, considerar un apoyo **temporal desde mantenimiento**, conservando el **20% del fondo de mantenimiento que sigue visible sin asignar**. La explicación advierte que no garantiza que el fondo sea realmente prestable ni que exista dinero bancario suficiente.
  4. **No presta automáticamente** recursos de Casa Club ni recursos de un proyecto a otros ámbitos. Los $25,550 históricos Google no se incluyen sin conciliación.
  5. Si no alcanza o falta información, mostrar cantidades pendientes y la razón de no asignarlas, sin fingir una solución.
- Pulsar **«Recomendación inteligente» no guarda ni modifica el borrador**; el administrador primero revisa la explicación, después puede pulsar «Aplicar al borrador (sin guardar)» y finalmente «Guardar plan del mes». Si descarta, mantiene intactas las asignaciones anteriores. Al cambiar de mes o editar el borrador se descarta la propuesta anterior para evitar aplicar cálculos obsoletos.
- Es **asistencia administrativa basada en reglas**, no pronóstico financiero ni optimización de liquidez auditada: no conoce vencimientos precisos, saldos bancarios conciliados, obligaciones de garantía o convenios de reembolso. Los préstamos internos deben verificarse y autorizarse humanamente.

### Despliegue seguro
1. Respaldar la BD en Hostinger. Aplicar **una vez** `backend/sql/2026-11-15-finanzas-planes-mensuales.sql` antes de usar «Guardar plan».
2. Publicar juntos el backend y el frontend de este PR.
3. Verificar los roles: un condómino no debe consultar ni guardar `/api/finanzas/plan-mensual`.
4. Probar con valores pequeños en staging; recargar y editar un mismo plan con dos sesiones para comprobar HTTP 409 cuando la versión cambió. No usar pagos de producción como ensayo.

## Google Sheets · Casa Club 2026
- Hoja original: `MISION_JARDINES_CONTROL_CASA_CLUB_2026`, pestaña `MISION JARDINES 2026`, rango `A1:L1000`.
- Columna F: **PAGO RECUPERACIÓN**; columna L: **ESTATUS PAGO**. Solo se suman filas con L=`PAGADO` y un monto positivo en F; se excluye L=`CANCELADO`. Lectura verificada el 15/nov/2026: **$25,550 MXN**, **29 filas pagadas y 1 cancelada**.
- Se usa primero la cuenta de servicio de solo lectura existente (`GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON_BASE64`); como alternativa la conexión `CASA_CLUB_GOOGLE_*` si tiene sincronización habilitada y permisos para ese documento. **La cuenta debe tener acceso al archivo correcto**.
- El indicador en **Análisis de cuotas → Casa club** distingue claramente recaudación histórica Google de cobros MySQL. **No se suman los $25,550 a la caja hasta conciliar por fecha, recibo y pago bancario**, para no duplicar ingresos. El mes D del evento **no es la fecha del depósito**; su desglose no autoriza calcular el flujo mensual de caja.
- Si Google no responde, el backend conserva finanzas MySQL y muestra histórico no disponible; revisar ID, permisos de lectura y nombre de pestaña.

## Folios duplicados en RESERVACIONES
Se detectaron **7 filas `CC-`** con coincidencia de vivienda y fecha con folios previos `MJ-`:
| Fila `CC-` | Fila histórica `MJ-` |
|---:|---:|
| 15 | 10 |
| 16 | 11 |
| 17 | 9 |
| 18 | 7 |
| 19 | 12 |
| 20 | 13 |
| 21 | 14 |

**Cuatro de esos siete pares tienen nombres de solicitante distintos.** Una coincidencia de vivienda/fecha es señal de posible doble registro, **no** autorización para eliminar solicitudes. La hoja en vivo **no se modificó** en este PR. Primero respaldar la pestaña y conciliar el nombre/origen/estatus de cada par. Luego archivar la fila redundante validada (no sobrescribir el folio histórico ni inventar pagos).

El sincronizador de este PR:
- deja de generar folios externos `CC-id` para nuevas exportaciones; usa `MJ-YYYYMMDD-NNNNN` de forma estable a partir de la fecha y el ID de la reserva;
- detecta espejos de nuestros propios `MJ` para no reimportarlos;
- no vuelve a exportar una vivienda/fecha que ya exista en la hoja bajo otro folio;
- **no borra ni cambia automáticamente** filas existentes: se preserva auditoría y diferencias de nombres.

La sincronización con Google no debe activarse sin revisar primero permisos de cuenta de servicio, duplicados y coherencia de la importación. Si el formulario antiguo sigue admitiendo solicitudes sin consultar MySQL, hay riesgo residual de colisión y requiere una actualización de Apps Script.

## Validación
- Compilación de ocho archivos JS de front/backend revisada en el runtime de desarrollo; prueba de cálculo de $53,732 y +$8,968 verificada.
- No hubo conexión a MySQL Hostinger, banco, correo ni ejecución de migraciones o cambios de Google Sheets en vivo. Es indispensable probar en staging y luego con administrador en navegador real.
