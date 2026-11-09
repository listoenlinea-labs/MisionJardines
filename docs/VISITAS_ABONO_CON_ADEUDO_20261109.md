# Visitas por vivienda y Abono con adeudo — 09 noviembre 2026

## Visitas
- Dos vistas: **Viviendas** (cuadrícula por calle, usando únicamente la respuesta autorizada de `GET /api/casas`) e **Historial de visitas** (conserva métricas, filtros, tabla y acciones).
- Seleccionar una casa abre `visitModal` con calle y número preseleccionados.
- Móvil: modal a pantalla, una columna, controles táctiles, área desplazable y acciones visibles al pie.
- `Tipo = OTRO`; fecha y hora iniciales en `America/Mexico_City`. El operador puede editarlas.
- Seguridad y administración siguen usando los permisos de `POST /api/visitas`; no se cambia el backend.

## Abono con adeudo
- El botón aparece **solo si** el backend encuentra deuda de meses anteriores y no hay cuota pagada en el mes actual.
- Los únicos datos registrables son el **mes corriente de México**, la **cuota exacta del domicilio** (incluido recargo del propio mes cuando proceda) y la forma de pago.
- Se requiere confirmación explícita de que no se condonan deudas.
- El backend bloquea la casa dentro de una transacción, verifica saldo anterior, meses, importe, pagos duplicados y comprobantes bancarios pendientes; no confía en la visibilidad del botón.
- Usa la tabla existente `cuotas`, `origen_importacion='MANUAL_ABONO_ADEUDO'` y **`estatus_pago='PAGO_PARCIAL'`** incluso cuando se recibió la cuota completa de ese mes: es una excepción de reconocimiento sin avanzar el último corte completamente pagado. El importe entra en la deuda restante como abono real, y el reporte conserva `PENDIENTE` mientras siga la deuda.
- No registra lotes en `pagos_acceso_c3`, no sincroniza ni modifica vigencias físicas. No concede TAGs por pagar el mes corriente.
- La referencia estable `MJABONO:<uuid>` permite consultar historial y generar recibo en el flujo PDF existente, con período e importe recibidos y la leyenda **«Deudas pendientes por aclarar»**, sin detallar el saldo.
- Si posteriormente se quieren cubrir meses atrasados y luego marcar como `PAGADO` este mes excepcional, debe hacerse una **conciliación expresa** que preserve la referencia y monto; el flujo de registro manual común ya rechaza cuotas con abonos parciales y no permite sobrescribir este recibo.

## Validación pendiente en ambiente de pruebas
1. Cuenta Seguridad en móvil: abrir vivienda, comprobar calles/números, fecha/hora México, Tipo Otro, guardar, ver en historial.
2. Administrador: Rosas 18, consultar el botón, registrar $300 de noviembre (si el día y tarifa lo permiten) y comprobar folio, PDF y leyenda.
3. Comprobar que la vivienda continúa PENDIENTE, el adeudo disminuye por importe recibido, no cambia `ultimoMesPagado`, y C3 no registra ninguna escritura.
4. Probar rechazo de doble envío, mes futuro, monto alterado, vivienda sin deuda anterior y banco en revisión.
5. Verificar que el PDF no contiene el total adeudado.
6. Verificar saldos e ingresos por calle; no sumar el dinero dos veces.

No se ejecutaron transacciones contra MySQL ni llamadas al controlador real al preparar este cambio.
