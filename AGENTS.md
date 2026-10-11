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
- Una vivienda puede tener varias cuentas y TAGs; una cuenta puede tener varias
  viviendas. Validar siempre el vínculo activo y los permisos en el backend.
- Referencia vigente para pagos/C3: `docs/PAGOS_ACCESO_C3.md` y servicios actuales.
  `backend/docs/vigencia-mantenimiento.md` contiene reglas históricas incompatibles;
  no usar sus secciones de fecha base, corte general o autoaprobación para implementar cambios.
- No asumir acceso a MySQL, correo del banco o C3 de producción por tener el código.
  Distinguir pruebas simuladas, resultados de exportaciones y confirmaciones del usuario.

## Reglas vigentes de mantenimiento

1. Mensualidad: **$300 MXN**. Trabajar en centavos; no redondear meses hacia arriba.
2. Fecha final inclusiva: día **10**; desde el día **11** está vencida. Sin mes ni días
   de gracia. El pago no compra un mes contado desde la fecha del depósito.
3. La fuente para avanzar fechas es la **fecha física actual del C3**, no
   `vigencias_mantenimiento.fecha_base` ni un acumulado de ingresos de toda la vida.
4. Cada movimiento confirmado descuenta recargos, considera el remanente disponible,
   compra meses completos y deja el sobrante registrado para el siguiente movimiento.
   Avanzar N meses desde el mes de la fecha física y fijar el resultado en día 10,
   aunque la fecha anterior no fuera día 10. No exigir corregir una base SQL para ello.
5. Antes de reportar mantenimiento, leer las fechas de todos los TAGs asociados.
   Sin TAGs, fechas inválidas/distintas, comprobantes pendientes o movimientos de
   acceso sin terminar, detener la cotización y mostrar el problema. No sustituir
   una lectura fallida por una fecha SQL ni elegir arbitrariamente un TAG.
6. Recargo: **$50 por cada corte del día 10 vencido antes de la fecha bancaria**,
   excluyendo cortes ya cubiertos. No cobrar por el mero hecho de depositar después
   del día 10 si la vivienda ya está cubierta. Los meses adelantados no llevan recargo.
   Una fecha histórica física de día 11 usa el corte de cobro del día 10 de ese mes.
7. El reporte debe cubrir los recargos y al menos una mensualidad neta, considerando
   el saldo previo. No exige múltiplos de $300 o $350, pero tampoco acepta cualquier
   importe positivo como abono aislado. El límite actual es 36 meses por movimiento;
   la fecha bancaria debe ser válida, no futura y desde el 1 de octubre de 2026.
8. Cuotas extraordinarias no conceden meses de mantenimiento ni actualizan TAGs.
9. Recargos históricos sin cortes identificados requieren conciliación administrativa;
   no inferir automáticamente qué meses cubrieron a partir del importe.

Ejemplos que deben conservarse:

| Situación | Resultado |
| --- | --- |
| Fecha C3 10/oct; pago $300 el 8/oct; sin saldo ni recargo | 10/nov |
| Después, pago $300 el 12/oct con fecha C3 10/nov | 10/dic, sin recargo |
| Fecha C3 10/ene; pago el 8/mar de $700 | Dos cortes vencidos: $100; principal $600; fecha 10/mar |
| Pago $725 sin recargos ni saldo previo | Dos meses y $125 de remanente |
| Pago $300 con $50 de recargo y sin saldo previo | Rechazo del reporte; no se registra un abono |
| Fecha C3 11/sep; $600 netos confirmados | 10/nov |

## Confirmación bancaria y OCR

- `backend/src/config/pagos-pruebas.js` mantiene `VALIDAR_PAGOS_SIN_ADMIN: false`.
  No volver a autoaprobar imágenes como atajo. Un recibo provisional no es aprobación.
- El OCR del servidor usa Tesseract.js/WASM, con idiomas incluidos por `postinstall`.
  No requiere el ejecutable Tesseract ni `PAGOS_TESSERACT_BIN`.
- Verificar destino/beneficiario, titular y últimos cuatro dígitos configurados;
  comprobar los datos bancarios extraídos cuando estén disponibles. El texto OCR del
  navegador y un campo de importe editado no son evidencia bancaria independiente.
- Un destino correcto en una imagen no demuestra recepción del dinero. El comprobante
  permanece `PENDIENTE_VALIDACION` hasta la confirmación administrativa actual.
- Leer correos bancarios para conciliar pagos es una propuesta, **no una integración
  implementada**. Antes de activarla, comprobar origen del mensaje, cuenta receptora,
  datos de operación, coincidencia única, vínculo a vivienda y protección contra
  reutilización. Monto y fecha por sí solos no identifican una vivienda.
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
