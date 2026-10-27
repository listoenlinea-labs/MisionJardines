# Misión Jardines: instrucciones para agentes

Ámbito: todo el repositorio. Reglas verificadas contra `main` el 10 de octubre de 2026.
Leer este archivo, [docs/INDICE_DOCUMENTOS.md](docs/INDICE_DOCUMENTOS.md) y
[docs/ESTADO_PROYECTO.md](docs/ESTADO_PROYECTO.md) antes de trabajar.
El estado registra evidencias y pendientes; no convierte una exportación antigua en estado en vivo.
Las instrucciones nuevas del usuario tienen prioridad. Si el código, un documento y un
acuerdo difieren, señalar la discrepancia; no restaurar silenciosamente un flujo antiguo.

## Proyecto y fuentes

- Backend Node.js, Express y MySQL en `backend/`; frontend estático en `docs/`.
- Backend y base alojados en Hostinger; controlador físico ZKTeco C3-200.
- SQL de Hostinger no es la base interna del C3. El equipo tiene `user` y
  `userauthorize`, consultados mediante su protocolo TCP.
- `direcciones.id` es el ID de vivienda. Un número de casa o un número de TAG no
  sustituye ese ID. La unidad de cobro es la vivienda, no la cuenta de usuario.
- El padrón usa `condominos_viviendas` (condomino_id, vivienda_id, activo), sin
  fusionar personas por similitud. El modelo y los servicios ya no usan
  `condominos.direccion_id`; altas, correcciones y pruebas escriben la tabla intermedia.
  Las autorizaciones de cuentas siguen en `usuarios_casas`. Para retirar la columna
  heredada: preparación SQL (NULL), desplegar todas las instancias y después SQL final.
  Ver docs/CONDOMINOS_VIVIENDAS.md.
- Una vivienda puede tener varias cuentas y TAGs; una cuenta puede tener varias
  viviendas. Validar siempre el vínculo activo y los permisos en el backend.
- Referencia vigente para pagos/C3: `docs/PAGOS_CUOTAS_UNIFICADOS.md` y servicios actuales.
  `backend/docs/vigencia-mantenimiento.md` contiene reglas históricas incompatibles;
  no usar sus secciones de fecha base, corte general o autoaprobación para implementar cambios.
- No asumir acceso a MySQL, correo del banco o C3 de producción por tener el código.
  Distinguir pruebas simuladas, resultados de exportaciones y confirmaciones del usuario.

## Reglas vigentes de mantenimiento

La petición del 23/oct/2026 sustituye el cálculo desde fechas físicas:
[Pagos/cuotas unificados](docs/PAGOS_CUOTAS_UNIFICADOS.md) es la referencia vigente.

1. La unidad de cobro es la vivienda. Fuente financiera: `cuotas` por `casa_id`,
   tarifa `direcciones.cuota_por_cobrar` (default $300). Nunca cotizar desde C3,
   `vigencias_mantenimiento` ni remanentes del diario de acceso.
2. Por instrucción del 24/oct/2026, calcular el adeudo por DIFERENCIA de cortes:
   meses calendario entre el corte actual y el último corte cubierto, por tarifa,
   menos principal abonado y más recargos pendientes. No reconstruir deuda buscando
   huecos mes por mes, ni desde septiembre ni desde el último pago. Septiembre de
   2026 es base SOLO sin cobertura registrada. Considerar abonos y recargos ya
   pagados; condonaciones/cancelaciones explícitas se descuentan del importe.
   Los renglones mensuales sirven de historial y reparto, no de lista de presencia.
   Cada mensualidad completa avanza un mes desde el último corte; nunca desde el depósito.
3. El reporte sigue pendiente hasta conciliación bancaria. Guardar el reparto y
   acreditar cuotas + pago + diario en una transacción con lock de vivienda.
   Si cambió tarifa/cuotas desde el reporte, detener para conciliación.
4. Aceptar cualquier abono positivo al mantenimiento (desde $0.01), aunque no
   cubra todos los recargos. Restar primero de los recargos más antiguos y solo
   después del principal de periodos más antiguos. Admitir complementos con folios distintos. No repetir recargos pagados. Máximo 36 meses
   completos por movimiento; fecha bancaria admitida desde octubre de 2026.
5. Pagar funciona sin TAG y con C3 desconectado. Un fallo de acceso no revierte un
   abono confirmado. Solo mensualidades completas avanzan el corte; octubre
   completo produce el 10 de noviembre. Un último mes pagado implica cobertura
   anterior: no volver a cobrar huecos históricos. Impedir saltos nuevos desde API.
6. Eventos nuevos `PAGO_CUOTAS` y `CUOTA_SQL` entregan el objetivo absoluto SQL
   respaldado por cuotas. No suman meses a la fecha física. Conservar las guardas
   físicas y la idempotencia; fecha física adelantada genera CONFLICTO para revisión.
7. No reproducir pagos históricos ni aplicar reportes antiguos sin reparto nuevo:
   requieren conciliación. No usar el importe para adivinar qué periodos cubrieron.
   `recargo_pagado` NULL conserva la interpretación histórica de las cuotas.
8. Extraordinarias y casa club no conceden meses ni actualizan TAGs.

## Confirmación bancaria y OCR

- `backend/src/config/pagos-pruebas.js` mantiene `VALIDAR_PAGOS_SIN_ADMIN: false`.
  No volver a autoaprobar imágenes como atajo. Un recibo provisional no es aprobación.
- El OCR del servidor usa Tesseract.js/WASM, con idiomas incluidos por `postinstall`.
  No requiere el ejecutable Tesseract ni `PAGOS_TESSERACT_BIN`.
- Verificar destino/beneficiario, titular y últimos cuatro dígitos configurados;
  comprobar los datos bancarios extraídos cuando estén disponibles. El texto OCR del
  navegador y un campo de importe editado no son evidencia bancaria independiente.
- Los campos bancarios (folio, importe, fecha y hora) son visibles y de solo lectura
  para condóminos. Una lectura incompleta bloquea el reporte y pide una imagen más
  clara o ayuda de Administración. El servidor exige los cuatro datos en su OCR
  independiente para usuarios sin rol administrativo y rechaza discrepancias,
  incluidos segundos en la hora. Solo SUPER_ADMIN/ADMINISTRADOR conservan captura
  manual cuando falta algún dato; nunca pueden contradecir datos detectados.
- Un destino correcto en una imagen no demuestra recepción del dinero. El comprobante
  permanece `PENDIENTE_VALIDACION` hasta la confirmación administrativa actual.
- La conciliación bancaria por correo ya tiene lector IMAP y worker en main;
  consultar `docs/VALIDACION_BANCARIA_CORREO.md` y los servicios actuales. Su presencia
  no acredita conexión al buzón ni aprobación de un depósito real. Antes de activarla,
  comprobar origen autenticado, clave de rastreo, monto, fecha, coincidencia única,
  vínculo a vivienda y protección contra reutilización. Por petición del usuario,
  se aceptan reenvíos del administrador cuyo correo exacto esté configurado en
  PAGOS_BANK_FORWARD_FROM_ADDRESS. Por petición explícita del usuario del 23/oct,
  solo se coteja From exacto y asunto, SIN DKIM, DMARC ni authserv-id; el origen
  puede falsificarse. El banco directo ya no autoriza avisos. En ese modo se confía en el administrador como fuente del aviso, sin
  exigir firma bancaria en el encabezado exterior. El texto del cuerpo no autoriza
  remitentes. La terminación de cuenta del correo admite 3 dígitos enmascarados o 4
  exactos; si hay 4 no se reducen a 3 para ocultar una discrepancia. La validación OCR
  del comprobante del usuario conserva sus reglas. Monto y fecha por sí solos no
  identifican una vivienda.
- Por petición del 26/oct, el concepto bancario es informativo: no exigir calle,
  número ni coincidencia con la vivienda. La vivienda proviene del reporte creado
  con vínculo autorizado; conservar identificador, monto, fecha, cuenta, remitente,
  coincidencia única y hash de correo no reutilizable entre viviendas.
- Reparto de mantenimiento: visible desde DOS viviendas activas (una sola
  conserva el flujo anterior; umbral corregido por el usuario el 27/oct). Un depósito se reporta/valida una sola vez y
  guarda `aplicacion_cuotas.version=3` con distribuciones y planes individuales.
  Sumar importes en centavos contra el OCR del servidor, autorizar cada vínculo,
  bloquear pendientes por vivienda incluso secundaria y acreditar todo en una
  transacción. Historiales/recibos/C3 deben usar el plan de su vivienda; nunca el
  total del depósito para cada casa. El recibo conjunto es privado del reportante
  y Administración; otros miembros consultan su abono en el historial por casa.
- Registrar cortes pagados, aprobación y diario de acceso en la misma transacción.
  La aprobación financiera puede persistir aunque falle la entrega posterior al C3.

## Entrega de fechas al C3 e idempotencia

- Cliente TCP: `backend/src/services/zkteco-c3-client.service.js`.
  Operaciones de alto nivel: `backend/src/services/zkteco-direct.service.js`.
- Producción con escrituras reales: `ZKTECO_DRY_RUN=false`. Para exigir TCP directo
  también en operaciones manuales: `ZKTECO_WRITE_MODE=DIRECT`.
  El valor por defecto del modo global sigue siendo AUTO; no afirmar que DIRECT
  es el valor por defecto. El escritor de pagos fuerza DIRECT sin bridge.
- Usar `readUserValidity` / `writeUserValidity`. Preservar identidad, CardNo, Pin,
  campos físicos, StartTime y autorizaciones al actualizar EndTime; verificar la lectura
  posterior. No suponer que PUTDATA conserva campos omitidos.
- Un pago no asigna puertas, no activa relés ni elimina bloqueos manuales de seguridad.
- SQL conserva auditoría, remanentes e intentos: `pagos_acceso_c3`,
  `pagos_acceso_tags_c3` y `recargos_mantenimiento`. Preparar y confirmar el intento
  por TAG antes de escribir TCP. Serializar operaciones de una misma vivienda.
- Una referencia bancaria repetida en Pagos/Cuotas se reconoce una sola vez por
  vivienda. Cada depósito distinto requiere su propia referencia. Si TCP funcionó
  y falló SQL, reintentar sin agregar los meses otra vez.
- Un cambio externo de fecha, Pin, autorizaciones o vivienda puede generar CONFLICTO.
  Detener y conciliar; no borrar el diario ni recalcular para forzar la escritura.
- Rechazar, reducir o borrar un cobro no retrocede automáticamente fechas físicas.
  No reproducir cobros históricos al dar de alta o reasignar un TAG; el alta requiere
  una fecha explícita. SIN_TAGS requiere conciliación, no activación posterior automática.
- `vigencias_mantenimiento` es referencia heredada; no reenviar sus fechas ni pendientes
  antiguos al C3. Una edición manual física no debe ser sobrescrita por ese espejo SQL.

## Lecturas periódicas: distinguir sus propósitos

- Inventario: `zkteco-autosync.service.js` lee el C3 y actualiza el reflejo SQL. Está
  habilitado por defecto; intervalo predeterminado 60 segundos, mínimo 30 segundos.
  No confundirlo con escrituras financieras ni afirmar que todo sondeo fue eliminado.
- Recuperación: `zkteco-vigencias.service.js` consulta movimientos nuevos pendientes
  del diario; por defecto cada cinco minutos, mínimo un minuto. Los pagos nuevos se
  envían tras el commit por evento; el barrido recupera fallos, no replica fechas heredadas.
- Una lectura vacía/parcial no prueba eliminación física ni autoriza recrear TAGs,
  marcar todos ausentes o modificar fechas/permisos. Conservar estado no confirmado
  y diagnosticar con lectura directa. Evitar cambios simultáneos desde ZKAccess
  mientras se prueba una escritura: no hay transacción compartida entre C3 y MySQL.

## Padrón, asociaciones y privacidad

- Usar el padrón oficial indicado en el índice para cotejar viviendas reales.
  Normalizar acentos y el prefijo Av. para comparar; no convertir una similitud de
  nombre en una asociación automática ni considerar toda fila de direcciones una casa real.
- No borrar o fusionar viviendas antes de comprobar referencias de cuentas, residentes,
  TAGs, cuotas, pagos, reservas y diarios. Preservar historial y resolver duplicados explícitamente.
- El TAG de prueba conocido es `05112343` (normalizado `5112343`). En la exportación
  del 10/oct está asociado a Prueba TEST-001, ID 738. Son datos de esa exportación,
  no constantes para producción ni prueba de acceso físico actual.
- No incluir credenciales, JWT, secretos, datos de contacto personales ni comprobantes
  bancarios en commits, reportes públicos o pruebas. Los documentos privados permanecen
  fuera del repo; el índice ayuda a encontrarlos sin publicar su contenido.

## Forma de trabajar y validar

- Auto-users: `docs/AUTO_USERS.md` describe un flujo distinto del registro público
  manual. Una sola cuenta por condomino_id; prerregistros PENDIENTES y no aceptados
  no pueden autenticarse. Aceptación por enlace válido activa exclusivamente rol
  CONDOMINO y todas sus viviendas activas confirmadas individualmente. Los enlaces son privados, reemplazables y de
  un solo uso; solo guardar hashes. No activar prerregistros cambiando estatus solo.
  Las invitaciones se envían por correo SMTP; no usar WhatsApp Business para este flujo.
  El login usa únicamente usuario o correo y contraseña, visibles desde el inicio; no consultar
  cuentas ni reenviar invitaciones por teléfono desde el login. Los prerregistros se aceptan con
  el enlace personal enviado al correo registrado. Inicio queda permitido para Condómino al
  completar el flujo; Seguridad conserva su restricción.

- Releer el estado actual de main y el esquema/modelos antes de editar. No afirmar
  estructura real de producción solo por modelos; cotejar SHOW CREATE TABLE cuando haga falta.
- Mantener JavaScript en archivos JS; no agregar lógica directamente a HTML.
- Verificar permisos en servidor, no solo ocultar botones. No crear roles nuevos
  ni eliminar roles heredados sin un cambio solicitado. Políticas actuales:
  `backend/src/config/permissions.js` y `docs/assets/js/permissions.js`.
- Mantener las reglas y el índice actualizados cuando un cambio las sustituya.
  Buscar archivos disponibles antes de pedir nuevamente un documento al usuario.
- El PR #132 de automatización fue revertido en main. `test:usuarios`, `test:flujos`,
  `.env.pruebas.example` y su workflow ya no forman parte del proyecto. No anunciarlos
  como comandos disponibles ni restaurarlos sin una petición nueva.
- Para cambios en pagos/C3, desde backend con dependencias instaladas:

  ```sh
  DB_PORT=3306 node --test test/pagos-acceso-c3.test.js test/recargos-mantenimiento.test.js test/zkteco-vigencias.test.js test/zkteco-autosync.test.js
  ```

  OCR: `node --test test/comprobante-parser.test.js test/comprobante-lector.test.js`.
  Permisos: `DB_PORT=3306 node --test test/permissions.test.js test/auth-permissions.test.js`.
  Las pruebas usan almacenamiento/TCP simulados; el OCR tiene una imagen sintética.
  No ejecutar operaciones sobre C3/DB reales como parte de esos checks.
- Si una prueba antigua falla, informar y distinguir el fallo; no debilitar validaciones
  reales para lograr un resultado verde. Los checks del código no prueban apertura física.
