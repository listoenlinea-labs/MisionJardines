# Pagos por concepto: mantenimiento, extraordinarios y Casa club (octubre 2026)

## Despliegue y límites

1. Hacer respaldo de MySQL y ejecutar **antes de desplegar código** `backend/sql/2026-10-18-cuotas-extraordinarias-casa-club.sql`. Incluye `SET SQL_SAFE_UPDATES=1`, una conversión de `PROYECTOS` por ID y migraciones aditivas. El SQL de DDL hace COMMIT implícito, no se debe repetir `ADD COLUMN` si ya existe.
2. Revisar `backend/sql/consultas-adeudos-2026-10.sql` con el `casa_id` correcto. Es de solo lectura y mantiene safe updates.
3. La app **detiene** el alta de nuevas cuotas extraordinarias si el padrón filtrado por Análisis no tiene **exactamente 231 viviendas**. La captura del 17/oct mostraba 232; conciliar la discrepancia primero. No excluir arbitrariamente una casa ni repartir entre 232 sin aprobación.
4. Los egresos históricos en `PROYECTOS` se renombran; **no** generan automáticamente cargos retroactivos porque desconocemos número de meses y primer mes acordados. Cada uno tendrá el botón «Configurar cobro» en Análisis. Proyectos nuevos piden esos dos datos y crean egreso + cuota + 231 cargos por cada mes en una transacción.
5. El total del proyecto se distribuye por centavos exactos entre 231 × meses. Puede haber diferencias de $0.01 entre cargos; jamás se pierden centavos. Se registra por vivienda y mes. Los pagos validados o manualmente confirmados saldan un cargo individual; mientras un comprobante esté pendiente no se registra otro para el mismo cargo.
6. El pago extraordinario y Casa club usan OCR, verificación de destino y revisión bancaria como el módulo actual. **No** crean meses de mantenimiento ni envían órdenes a los TAGs.
7. El registro manual en Análisis conserva el flujo previo para mantenimiento; para cuota extraordinaria o casa club escribe en `pagos_manuales_concepto` con referencia única y origen. Este tipo de pago no pretende ser un comprobante bancario ni genera cambios C3.
8. La cuenta con «Mantener sesión iniciada» recibe un JWT de 90 días en el navegador; sin marcarlo, conserva el vencimiento corto de 8 horas. No se guarda la contraseña. Revocar cuenta o incrementar `sesion_version` invalida ambos, incluso antes del vencimiento. Usar solo en dispositivos de confianza.

## Casa club

- Solo un miembro de una vivienda con saldo vencido **$0** puede solicitar. Administración no está exenta de la regla en su vivienda. Las solicitudes bloquean la fecha como **PENDIENTE**, no **APROBADA**.
- Administración tiene solicitudes pendientes en el panel y aviso de menú, y aprueba con renta, garantía, limpieza opcional y fecha límite de pago anterior al evento. El solicitante consulta desglose y enlace a **Pagos → Casa club**.
- El comprobante queda `PENDIENTE_VALIDACION` hasta que Administración verifique recepción bancaria. Al validar, la reserva se marca pagada; al rechazar puede reportarse un nuevo comprobante mientras esté dentro del plazo.
- Una reserva aprobada sin pago cuya fecha límite ya pasó se cancela y libera cuando la API consulta calendario, reservas o solicitudes. Si el comprobante fue enviado con fecha bancaria dentro del plazo y sigue pendiente de validación, **no** se cancela por retraso administrativo. No depende de una tarea externa. Reservas `PENDIENTE` requieren acción administrativa para liberar su fecha.
- No hay pagos automáticos ni comprobación bancaria independiente a través de correo del banco: el administrador continúa verificando manualmente.

## Notificaciones

- La API `GET /api/pagos/adeudos` devuelve de forma privada por vivienda los conceptos, períodos, importes y recargos de mantenimiento al corte, cargos extraordinarios exigibles y reservas aprobadas sin pago. Los estados bancarios pendientes se muestran como «En revisión» sin darlos por validados.
- Inicio muestra enlace a Pagos y el menú tiene burbujas verdes con cantidad de pendientes; al entrar en cada pestaña se abre el desglose con cierre **×**. Administración recibe además conteo de solicitudes de casa club sin resolver.
- Sin base/servicio disponible, el cliente debe informar fallo; un cero aparente no es prueba de que la vivienda está al corriente.

## Validaciones necesarias en Hostinger

Los tests usan MySQL/TCP simulados y archivos locales. Validar con tres viviendas de prueba: al corriente, morosa y con adelantos; un proyecto nuevo con 231 × meses cargos, un proyecto histórico configurado sin duplicados, casa club aprobada y pagada dentro de plazo, y vencimiento de reserva sin comprobante. Conciliar `SHOW CREATE TABLE` y SQL real antes de activar cobros. No ejecutar pagos, conciliaciones ni pruebas de apertura sobre C3 de producción como parte de una prueba automatizada.
