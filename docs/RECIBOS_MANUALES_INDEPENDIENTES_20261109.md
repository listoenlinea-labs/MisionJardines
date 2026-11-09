# Recibos manuales independientes · Misión Jardines

## Qué hace
El botón «Generar recibo manualmente» está siempre visible en la cabecera de Consulta de viviendas de Análisis de cuotas. Abre un modal con **Nuevo recibo** e **Historial de recibos**. Puede autollenar una vivienda seleccionada o elegir cualquier casa del padrón; todos los campos de nombre, domicilio, folio (mes y año), concepto, periodo cubierto, detalle, importe, forma de pago y sello siguen editables.

- El folio tiene el formato \`MJ-MES-AÑO-ALEATORIO10-INICIAL+CASA-M\`, por ejemplo \`MJ-NOV-2026-20E07DA986-A752-M\`.
- Fecha de emisión = fecha actual de México, calculada en el **servidor**.
- La referencia se genera en el servidor como \`MJMANUAL:<UUID>\`, estable.
- El sello siempre debe empezar con \`PAGADO\` y puede continuar con otras palabras.
- El importe usa pesos enteros, sin decimales.
- El PDF muestra una marca de documento manual y aviso de que no implica un registro contable.

## Separación total de la contabilidad
Los documentos se guardan **únicamente** en \`recibos_manuales\` y se recuperan desde su propio historial. El servicio no inserta ni actualiza \`cuotas\`, \`pagos_reportados\`, \`pago_manual_concepto\`, \`ingresos\`, \`egresos\`, reportes, Excel, respaldos normales, tags o ZKTeco. No se emiten eventos de sincronización financiera. La referencia, folio y PDF no se mezclan con historial de mantenimiento. No hay claves foráneas a tablas financieras; \`casa_id\` es solo un identificador de origen para autollenado.

**Permisos:** exclusivamente \`SUPER_ADMIN\` y \`ADMINISTRADOR\`, autenticados con JWT.

**Persistencia:** usar \`backend/sql/2026-11-09-recibos-manuales-independientes.sql\` en Hostinger. El servicio también intenta crear la tabla en el primer acceso (si el usuario MySQL tiene permiso \`CREATE\`). Ejecutar la migración antes del despliegue es preferible.

**Despliegue:** publicar backend y frontend coordinadamente.

## Pruebas de aceptación
1. Seleccionar Rosas 18 en Análisis, abrir el generador y comprobar que nombre, calle y número se cargan y se pueden editar.
2. Cambiar mes y año del folio, comprobar vista \`MJ-MES-AÑO-XXXXXXXXXX-R18-M\`.
3. Capturar concepto libre \`APORTACIÓN\`, periodo cubierto distinto, detalle, importe entero, \`TRANSFERENCIA\`, sello \`PAGADO CON ADEUDO\`. Comprobar PDF final.
4. Revisar fecha de México, folio aleatorio de 10 hexadecimales, referencia automática y descarga con nombre \`MJ-...pdf\`.
5. Abrir historial, consultar el recibo persistido, volver a descargar idéntico PDF sin alterar folio.
6. Confirmar que consultas financieras, cuotas, saldo, TAGs, gráficas y Excel son idénticos antes y después (excepto cualquier cambio ajeno simultáneo).
7. Probar rechazos: importe cero, decimal, sello sin prefijo PAGADO, mes/año inválidos, usuario Seguridad.
8. Probar que el historial sigue disponible tras cerrar sesión/reingresar, y que nadie puede acceder sin autenticación.

## Revertir abono de Rosas 18 del 9 de noviembre de 2026
La referencia \`MJABONO:7fb22c0b-71a8-4632-b4dd-b08215b5e146\` pertenece al **movimiento de cuotas**, no a un recibo manual. Para eliminar el documento generado por ese movimiento es necesario revertir el propio abono o implementar una revocación de recibos ordinarios; borrar el movimiento reducirá lo pagado y recalculará la deuda. Si fue dinero real, no debe eliminarse.
La consulta para identificar y revertir **solo ese movimiento**, con revisión transaccional, está en:
\`backend/sql/2026-11-09-revertir-abono-rosas18-SOLO-PRUEBA.sql\`.
Ese archivo termina en \`ROLLBACK\` por seguridad; sustituirlo por \`COMMIT\` únicamente tras verificar una fila y contar con respaldo.
