# Análisis de cuotas: Excel por proyecto, recibos SMTP, retorno a ZKTeco y sincronización

## Diseño y alcance

1. **Mantenimiento:** las tarjetas, gráficas y los cuatro Excel mantienen sus datos originales. Los reportes son independientes de los proyectos.
2. **Cuotas extraordinarias:** al elegir un proyecto cambian las cuatro tarjetas superiores, la gráfica de cumplimiento, los indicadores secundarios y el desglose por calle. Las viviendas con cuota $0 y estado NO_APLICA se excluyen de los denominadores de cumplimiento y deuda, pero permanecen en el padrón de 231 casas.
3. **Excel de cuotas extraordinarias:** cada tarjeta descarga un libro completo exclusivo del proyecto, independiente de filtros y paginación. Conserva el panel Resumen y las cinco hojas base del formato anterior: Todas las viviendas, Pago registrado, Sin Pagar, Finanzas y Desglose por calle. Agrega Aportaciones, No aplica y Abonos parciales. Las cinco gráficas ChartML nativas se alimentan de las celdas del mismo archivo; no son capturas. El backend obtiene los movimientos de ese proyecto en una solicitud administrativa y no ejecuta 231 consultas individuales.
4. **Recibos por correo:** mantenimiento y extraordinarias reutilizan el mismo PDF oficial (con folio terminado en M o P), consultan un correo válido de una cuenta activa vinculada a la vivienda que permite recibir correos de pago, o alternativamente el correo registrado en direcciones. El administrador puede editar el correo solo para el envío actual, sin cambiar la cuenta ni la dirección registrada. Se valida que sea un único email válido (máx. 254 caracteres), se confirma explícitamente la dirección antes de enviar y SMTP debe aceptar el destinatario para mostrar la burbuja de éxito; fallos SMTP se reportan. Esta ruta exige los roles SUPER_ADMIN o ADMINISTRADOR.
5. **ZKTeco:** al entrar desde Editar TAGs aparece Volver a Análisis de cuotas con mis filtros. Se restaura la pestaña, proyecto, año, mes, filtro de calle, estado, búsqueda, orden, página y vivienda seleccionada desde sessionStorage del mismo origen. Se borra al volver y caduca a los 30 minutos.
6. **Sincronización entre equipos:** las mutaciones exitosas publican una revisión en memoria del proceso Node. La interfaz consulta la revisión cada 20 segundos con JWT firmado y sin consultas MySQL en ese endpoint. Si detecta un cambio, recarga el análisis; evita refrescar durante modales. Para varias instancias de Hostinger hay una revalidación de respaldo cada 10 minutos con pestaña visible. Se trata de actualización automática cercana al tiempo real, no entrega instantánea garantizada ni WebSocket. No aumenta el ritmo de conexiones MySQL cada 20 segundos.
7. **Rosas 10:** el pago de noviembre queda protegido ante una referencia de pagos_reportados o un registro de pagos_acceso_c3 vinculado. La cotización ahora devuelve tabla, ID, referencia y estado del registro, restringe las referencias bancarias al concepto MANTENIMIENTO, y no crea cobros ni órdenes duplicadas.

## Variables Hostinger — Gmail independiente para recibos de Misión Jardines

Estas siete variables son **nuevas**, exclusivas del botón **Enviar recibo por correo** de Mantenimiento y Cuotas extraordinarias. No sobrescribir ninguna variable de SMTP del producto Listo en Línea.

| Nueva variable | Valor |
|---|---|
| MJ_GMAIL_SMTP_HOST | smtp.gmail.com |
| MJ_GMAIL_SMTP_PORT | 465 |
| MJ_GMAIL_SMTP_SECURE | true |
| MJ_GMAIL_SMTP_USER | misionjardinesgdl@gmail.com |
| MJ_GMAIL_SMTP_PASSWORD | Contraseña de aplicación de Google |
| MJ_GMAIL_SMTP_FROM_EMAIL | misionjardinesgdl@gmail.com |
| MJ_GMAIL_SMTP_FROM_NAME | Administración Misión Jardines |

**Configuración anterior conservada:** SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASSWORD, SMTP_FROM_EMAIL y SMTP_FROM_NAME permanecen sin modificaciones y siguen atendiendo los demás procesos de correo que ya funcionaban con Listo en Línea.

- Los recibos PDF generados desde Análisis de cuotas utilizan exclusivamente el nuevo transporte Gmail. No existe respaldo automático a SMTP_HOST ni otro servidor: si falta alguna variable MJ_GMAIL_SMTP_* se muestra un error y no se envía.
- Las demás funciones de email.service.js (invitaciones, verificaciones y servicios previos) conservan el transporte original y las variables SMTP_*.
- No subir la contraseña de aplicación a GitHub ni colocar credenciales en el frontend; definirla en el panel de Hostinger. Google requiere una contraseña de aplicación habilitada en una cuenta elegible con verificación en dos pasos.
- Guardar variables y reiniciar/redeploy del backend para que Node las lea. No se necesitan cambios de base de datos.


## Diagnóstico SQL SOLO LECTURA — Rosas 10

Comprobar la base de datos correcta antes de tocar un movimiento. No borrar ninguna cuota, pago o evento C3 sin conciliación y evidencia.

~~~sql
SET @casa_rosa10 := (
 SELECT id FROM direcciones
 WHERE numero = '10' AND (calle = 'Rosas' OR calle_correcta = 'Rosas')
 LIMIT 1
);
SELECT @casa_rosa10 AS casa_id;

SELECT id, casa_id, anio, mes, estatus_pago, monto_cuota, monto_pagado,
       referencia, folio, fecha_pago, fecha_confirmacion, origen_importacion
FROM cuotas
WHERE casa_id = @casa_rosa10 AND anio = 2026
  AND mes IN ('OCTUBRE', 'NOVIEMBRE')
ORDER BY FIELD(mes,'OCTUBRE','NOVIEMBRE');

SELECT id, casa_id, tipo_pago, estatus, monto, fecha_operacion,
       folio_operacion, folio_reporte
FROM pagos_reportados
WHERE casa_id = @casa_rosa10 AND tipo_pago = 'MANTENIMIENTO'
ORDER BY id DESC LIMIT 25;

SELECT id, casa_id, origen, origen_id, referencia, estado, fecha_objetivo,
       monto_origen, principal_movimiento_centavos
FROM pagos_acceso_c3
WHERE casa_id = @casa_rosa10
ORDER BY id DESC LIMIT 25;
~~~

Comparar la referencia/folio de la cuota NOVIEMBRE con los registros bancarios y de acceso C3. Si corresponde a un pago auténtico, debe conciliarse, no registrarse otro. Si el evento está huérfano o corresponde a un período incorrecto, investigar su origen y corregirlo con auditoría; el PR no borra ni desactiva la protección.

## Verificación y despliegue

- Probar el libro completo de un proyecto con 231 viviendas, un pago total, un abono parcial y una exención; revisar 8 hojas y 5 gráficas nativas desde Excel.
- En Gmail realizar un envío real de prueba a una vivienda propia vinculada, verificar PDF, folio, destinatario y confirmación de recepción. No probar enviando datos sensibles a correo ajeno.
- Desde una segunda sesión, registrar un cambio no sensible y esperar la próxima revisión (aproximadamente 20 segundos). El respaldo para instancias diferentes puede tardar hasta 10 minutos; se indica expresamente esa limitación.
- En ZKTeco hacer un cambio en una vivienda de prueba y regresar verificando filtros y proyecto.
- No se requieren migraciones SQL nuevas. Se deben desplegar juntos frontend y backend. Este PR no modifica directamente la producción ni envía correos reales.

## Corrección 04-nov-2026: avisos con saldo cero, tarjetas largas y correo editable

- **Pagos → extraordinarias:** consultarAdeudos excluye de la lista de adeudos los proyectos cuyo saldo monetario ya es $0.00; pueden seguir consultándose en el listado general de proyectos y en sus historiales. Un proyecto activo o pagado no equivale a una deuda. Las insignias y el modal evitan también mostrar saldos cero de respuestas almacenadas. La suma del modal corresponde a proyectos con un saldo realmente pendiente.
- **Análisis de cuotas → Otros indicadores financieros:** el nombre del proyecto extraordinario aparece con tamaño adecuado y salto de línea dentro de su tarjeta, sin invadir tarjetas contiguas.
- **Generar recibo (Mantenimiento/Extraordinarias):** se elimina la instrucción permanente sobre descargar el PDF para adjuntarlo a WhatsApp. El campo de correo inicia con la dirección registrada pero es editable; si no hay correo, permite introducir una dirección válida. Se confirma destinatario y folio antes del envío. El backend valida el campo opcional correoDestino y NO lo guarda en MySQL. El remitente sigue siendo misionjardinesgdl@gmail.com mediante MJ_GMAIL_SMTP_*, sin tocar el correo SMTP de Listo en Línea.
- El envío no es un relay público: la ruta sigue protegida por autenticarToken y autorizarRoles(SUPER_ADMIN, ADMINISTRADOR), valida la vivienda y el PDF oficial y mantiene la protección contra reenvíos repetidos del mismo folio.
- Sin nuevas queries SQL ni cambios en cuotas, depósitos o TAGs. Probar primero con correos de prueba; no se han enviado comprobantes reales.
