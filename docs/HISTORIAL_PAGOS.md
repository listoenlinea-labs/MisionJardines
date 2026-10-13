# Historial administrativo por periodo

La página Pagos ofrece una sección exclusiva para SUPER_ADMIN y ADMINISTRADOR.
El servidor protege `GET /api/pagos/historial` con los mismos roles, además de
autenticación. No se aplica el filtro de vivienda del usuario: es un historial de
todos los comprobantes reportados del fraccionamiento.

- Selector `periodo=AAAA-MM`, por fecha bancaria (`fechaOperacion`). El periodo
  octubre 2026 incluye 11/oct y termina 10/nov; 11/nov pertenece al siguiente.
  El periodo inicial usa la fecha de America/Mexico_City y cambia el día 11.
- Se muestran todos los estados (validado, pendiente, rechazado), mantenimiento y
  extraordinarios, con recargos y abonos aunque no liquiden la vivienda.
  Un registro pendiente o rechazado no confirma recepción bancaria.
- Folios del sistema y banco, fecha/hora bancaria, `creadoEn` (subida al sistema),
  monto bruto, recargo, reportante histórico y vivienda proceden de PagoReportado.
  No se devuelven comprobantes, PDF, OCR ni datos de contacto en esta consulta.
- Los meses vienen del diario `pagos_acceso_c3`, origen PAGO e ID del comprobante;
  no se calculan dividiendo el monto bruto entre $300. El saldo previo y recargos
  ya fueron considerados por el flujo financiero. Abono sin meses muestra cero;
  sin diario no se inventa un incremento. Cada movimiento indica entrega completa,
  parcial, pendiente o sin TAGs a partir de su diario de intentos.
- Se muestran **todos** los TAGs asociados actualmente a la vivienda y `fechaFin`
  con `ultimaLectura`/presencia. Es el reflejo SQL disponible al consultar, no una
  lectura física en vivo ni la fecha histórica que tenía el TAG al pagar.
  Fechas diferentes se conservan individualmente, sin escoger un TAG arbitrario.
- Paginación de 50 registros ordenados por fecha/hora bancaria e ID descendentes.
  Consulta pagos y metadatos en lote; no hace lecturas/escrituras TCP ni sondeos.
  Botón Actualizar para refrescar; una revisión administrativa refresca el historial.

Archivos: `backend/src/controllers/pagos-historial.controller.js`,
`backend/src/routes/pagos.routes.js`, `docs/assets/js/pagos-historial.js` y
`docs/pagos.html`. No requiere migración de esquema. El despliegue requiere
frontend y backend; las pruebas locales no certifican los datos de producción.

Validación: `node --test test/pagos-historial.test.js` desde backend. Pruebas con
modelos y DOM simulados: límites de fechas, permisos, paginación, abonos, fechas
por TAG, entregas parciales y escape de texto. Validación visual en navegador y
cotejo con MySQL real pendientes.

La columna **Meses aplicados** aparece junto al monto con el total de meses cuya
entrega a todos los TAGs está confirmada. Cero indica abono sin avance o entrega
todavía pendiente; sin diario se muestra —, no un número inferido. Se detalla aparte
la entrega parcial a TAGs. En móvil los registros se presentan en dos columnas,
con monto y meses visibles sin desplazamiento horizontal.

La columna **Fecha anterior al pago** consulta `fechaAntes` de los intentos en
`pagos_acceso_tags_c3` asociados exclusivamente al diario de ese comprobante.
Muestra cada TAG individualmente y conserva fechas diferentes. Es una lectura
física tomada al preparar la entrega, después de validar el pago y antes de
escribir su nueva fecha; no es una captura del instante previo a la validación.
Sin lectura se indica No registrada; abonos sin avance y extraordinarios muestran
No aplica. Nunca se usa la fecha actual del TAG para rellenar este dato histórico.
