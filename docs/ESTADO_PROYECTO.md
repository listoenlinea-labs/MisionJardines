# Estado actualizado de Misión Jardines

**Última revisión:** 11/oct/2026, 23:37, America/Mexico_City.
**SHA de main consultado:** `ebed7ff3603b0f50b915c34df9eccae72befd0af`.
**Fuentes de esta revisión:** comparación de main desde `8ec5019f24aea496ca8d829f96678d64e4021b7a`,
metadatos de los PR #133–#141 y sus estados/checks en GitHub, pruebas locales de estructura
y regresión, historial ya documentado y transcripción de conversación disponible. Las capturas
de esa transcripción no están disponibles como imágenes inspeccionables aquí; no se certifican
sus resultados desde descripciones del asistente. No se consultaron MySQL, Hostinger, Google
Sheets ni el C3 de producción durante esta revisión.

Leer junto con [AGENTS.md](../AGENTS.md),
[índice de documentos](INDICE_DOCUMENTOS.md) y
[reglas de pagos/C3](PAGOS_ACCESO_C3.md). Este archivo conserva estado y evidencia;
no redefine las reglas de negocio ni sustituye las fuentes originales.

## Resumen operativo

| Área | Estado | Evidencia y límites |
| --- | --- | --- |
| Pagos de mantenimiento | Implementado en main | Mensualidad $300; recargos $50 por corte vencido no cubierto; meses desde fecha física C3; saldo remanente; corte inclusivo día 10. Ver AGENTS.md |
| Confirmación de comprobantes | Revisión administrativa activa | `VALIDAR_PAGOS_SIN_ADMIN=false`; un recibo provisional no confirma depósito ni entrega de fecha al C3 |
| OCR | Tesseract.js en servidor | Reprocesa imagen y coteja destino; no prueba recepción del dinero. PR #125 incorporó el cambio |
| Escritura C3 por pago | DIRECT con diario e idempotencia | Sin bridge en ese flujo; no asigna puertas ni elimina bloqueos manuales. Estado financiero y entrega física son distintos |
| Edición manual de TAGs | Implementada; validación pendiente | Dos pruebas simuladas de edición fallan en main; no está diagnosticado el motivo ni confirmado un fallo equivalente en producción |
| Inventario C3 | Lectura periódica y manual | Reflejo SQL; no volver a usar fechas heredadas para sobreescribir el controlador |
| Cuentas y viviendas | Implementado en código | Permisos, verificación y vínculos activos. No se ha ejecutado una nueva prueba real con las tres cuentas en esta revisión |
| Conmutador | Integración futura | No se confirmó funcionamiento con hardware en esta revisión; consultar configuración antes de habilitar telefonía |
| Confirmación por correo bancario | Propuesta | Sin conexión de buzón ni conciliador implementado. Falta revisar una notificación real y datos de operación |
| Automatización de pruebas PR #132 | Revertida | Reversión en main: `5828fca4d7e68e4a5d72141b9678aabba9482b36`; no usar sus comandos/workflow como si siguieran disponibles |
| Depuración de viviendas | Fusión de tres pares reportada por el usuario | Falta confirmación explícita de COMMIT y lectura posterior desde otra conexión; cinco registros externos siguen pendientes según la conversación. No hay verificación nueva de producción |
| Interfaz responsive | Implementada en main; validación visual pendiente | PR #133–#141 reorganizan navegación, compactan vistas/KPI, retiran la página Conexión y corrigen móvil. Un merge no acredita que Hostinger ya sirva estos assets ni sustituye pruebas en navegador |
| Cuotas para Seguridad | Implementado en main; producción no verificada | PR #140 añade ruta autenticada y tabla paginada sin nombres/teléfonos. Calcula desde `direcciones`/`cuotas`, no desde TAGs ni Sheets; no se consultó la DB real |
| Históricos Google Sheets | Staging opcional en main; no activado/verificado | PR #140 añade lectura OAuth de solo lectura y preparación idempotente. Está deshabilitado por defecto, requiere migración SQL manual y no escribe directamente en cuotas, pagos ni egresos |
| Continuidad documental | Disponible en main | AGENTS.md e índice publicados en `6995b845b500e7530d83b6d3cc6a3ab34ca62697`; este archivo agrega estado y bitácora |

Un merge no acredita despliegue en Hostinger ni prueba física de una pluma.
No se verificaron los valores efectivos de variables de producción.
Desde el SHA anterior se incorporaron los PR #133–#141. Los #133–#139 son cambios de
navegación y presentación; #140 añade mejoras móviles, consulta de cuotas para Seguridad y
staging opcional de Google Sheets; #141 corrige distribución visual en Seguridad/Análisis.
El commit documental `e987281` se excluye del trabajo de producto. La búsqueda de PR abiertos
devolvió cero. El PR #132 sigue fusionado en el historial, pero su entrega fue revertida en main.

## Pruebas físicas y de operación confirmadas por el usuario

Confirmaciones anteriores conservadas de la conversación; fecha/hora exacta de cada
prueba no verificada. No se ejecutaron de nuevo al crear este archivo.

| Caso | Confirmación | Alcance |
| --- | --- | --- |
| Pago de prueba con TAGs de una misma vivienda | El usuario informó que todos cambiaron después de validar como administrador | Confirma esa prueba concreta; no prueba todas las viviendas ni autoaprobación |
| Reutilización de folio durante pruebas | Tras revisar/limpiar el diario antiguo, el usuario informó que volvió a funcionar | No autoriza reutilizar referencias reales; cada depósito distinto requiere su referencia |
| Alta directa de TAG | El usuario informó apertura con un TAG de otra vivienda | Hubo otro caso que requirió ZKAccess; no considerar todas las altas físicas confirmadas |
| Lirios 7 | Confirmó COMMIT, conservación del ID 113 y eliminación del duplicado 726 | Corrección reportada por el usuario, no nueva consulta en vivo |
| Jardines 12/120, 16/160, 36/360, 38/380 | Confirmó que se resolvieron | Distintos de los posibles duplicados 21/201, 25/205, 29/209, 37/307 |
| Depuración adicional de tres pares de viviendas | El usuario respondió «ccreo que ya quedo» después de ejecutar el bloque y aportar una captura | Reporte del usuario accesible en la transcripción del 10/oct; captura no inspeccionada en esta revisión. COMMIT, persistencia, respaldo y modo seguro no confirmados de forma independiente; no acredita cambios físicos en C3 |
| Nueve TAGs sin casa | El usuario dijo resueltos | Sigue discrepancia con 42-3.csv: nueve casa_id NULL; falta confirmar versión/consulta actual |

## Pruebas automatizadas con resultado conocido

| Fecha | Código / comando | Resultado | Interpretación |
| --- | --- | --- | --- |
| 10/oct/2026 | Rama del PR #132, `DB_PORT=3306 npm run test:flujos` | 80 aprobadas, 0 fallidas | **Histórico:** ese PR fue revertido. Incluía un ajuste de simulación de OCR; no implica que main actual tenga 80 pruebas verdes |
| 10/oct/2026 | main `5828fca`, `DB_PORT=3306 node --test backend/test/pagos-acceso-c3.test.js backend/test/recargos-mantenimiento.test.js backend/test/zkteco-vigencias.test.js backend/test/zkteco-autosync.test.js` | **35 aprobadas, 2 fallidas** | SQL/TCP simulados; no se escribió al C3 ni a MySQL de producción |
| 10/oct/2026, 00:15–00:16, America/Mexico_City | PR #132, head `e9b85ad`; desde backend, `DB_PORT=3306 npm run test:flujos`; [Actions 38030320492](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/38030320492) | **80 aprobadas, 0 fallidas**; job `flujos` success; `cuentas-servidor` skipped | Logs recuperados en esta revisión; resultado histórico de código revertido, no prueba de main actual ni del servidor |
| 10/oct/2026 | Documentación de continuidad: enlaces relativos y `git diff --check` | Sin errores | Solo valida archivos/enlaces; no funcionamiento de backend o equipo |
| 11/oct/2026, 23:36, America/Mexico_City | main `ebed7ff`; `node --test tests/ui-responsive.test.cjs tests/ui-unificada.test.cjs tests/ui-inicio-kpis-reportes.test.cjs tests/ui-kpi-compact.test.cjs tests/ui-seguridad-analisis-distribucion.test.cjs backend/test/seguridad-sheets-mobile.test.js` | **26 aprobadas, 3 fallidas** | Pruebas locales/estructurales. Los tres fallos esperan versiones antiguas de cache busting (`sin-conexion`, `kpis-compact`, `mobile-operativo ...-b`) reemplazadas por versiones posteriores; la suite de main queda roja hasta actualizar/conciliar esas expectativas |

Los dos fallos están en `backend/test/zkteco-vigencias.test.js`:

- `manual date edit persists without queueing the old maintenance cutoff`.
- `editing a house association never queues an old SQL cutoff`.

En ambos casos el C3 simulado conservó EndTime `20260910`, cuando se esperaba
`20261110`. Falta investigar código y preparación de la prueba; no se corrigió
al añadir documentación. Conservar estos resultados hasta una ejecución nueva
que explique y confirme su resolución.

Para los heads de los PR #133–#141, GitHub devolvió cero check-runs y cero estados de
commit; por tanto, no hay CI acreditado para esas fusiones. Los cuerpos de los PR documentan
comprobaciones estáticas y pruebas propuestas, además de revisión visual/producción pendiente,
pero no sustituyen el resultado local anterior. No se ejecutaron suites contra DB, Google Sheets,
Hostinger o hardware real.

## Cotejo de base: exportaciones del 10 de octubre

No es un estado en vivo. Fuente: padrón oficial y CSV detallados en el índice.

| Resultado | Estado |
| --- | --- |
| 233 direcciones del padrón presentes en CSV SQL | Confirmado por comparación de calle/número, normalizando Av. y acentos; incluye Jardines 142 marcada inexistente |
| 242 filas de viviendas en SQL exportado | 206 con TAG asociado y 36 sin asociación |
| 36 viviendas SQL sin TAG | 27 aparecen en padrón; 8 fuera del padrón y Jardines 142 marcada CASA NO EXISTE |
| Vivienda ficticia | Prueba TEST-001, ID 738, TAG 5112343, ya asociado en el CSV; fuera del padrón por su propósito |

Las 27 viviendas del padrón sin TAG y los 8 registros externos se enumeran en
[el índice](INDICE_DOCUMENTOS.md#estado-del-cotejo-fotografía-del-10-de-octubre).
Sin una lista anterior comparable, no afirmar cuáles de las antiguas 42 se
resolvieron solo por diferencia de conteos. Una vivienda real puede no tener
TAG entregado; confirmar antes de asignar. Ninguna fila fue borrada durante el cotejo inicial.
Posteriormente el usuario reportó completada la fusión de tres pares. Conservar los conteos
anteriores como fotografía histórica, sin restar filas para inferir el estado actual de SQL.
El índice conserva la hipótesis antigua de coincidencia de residente para uno de los pares;
la conversación posterior la retiró y dejó ese destino sin confirmar. Este proceso no modifica
el índice ni publica datos personales o contenido adicional del padrón.

## Pendientes y próxima evidencia necesaria

| Pendiente | Qué falta para cerrarlo |
| --- | --- |
| Dos pruebas fallidas de edición de TAG | Diagnosticar y repetir pruebas pertinentes, sin debilitar validaciones reales |
| Tres regresiones estructurales posteriores a los PR #138–#141 | Actualizar o conciliar expectativas de versiones de assets y repetir la suite hasta obtener un resultado explicado; no ocultar los fallos como simple éxito visual |
| PR #133–#141 sin checks de GitHub | Añadir/ejecutar CI apropiado y validar en navegador 360/390/430/768/1440 px; comprobar despliegue real por separado |
| Google Sheets histórico | Ejecutar migración opcional solo al decidir activarlo, configurar credenciales/rangos en backend y validar lectura/staging con una hoja y MySQL de prueba; acordar conciliación antes de afectar contabilidad oficial |
| 27 viviendas del padrón sin TAG | Confirmar entrega/posesión y asociación; nueva consulta/exportación tras ajustes |
| Tres pares con fusión reportada | Confirmar COMMIT y persistencia desde otra conexión; verificar respaldo y modo seguro. No dar por cerrado a partir de la frase del usuario o del resumen de una captura |
| Cinco registros fuera del padrón aún pendientes + vivienda marcada inexistente | Identificar destinos y conservar referencias. La conversación reporta cuotas/historial en tres y un residente/permiso en otro; falta revisar evidencia original antes de actuar |
| Correspondencia descartada en el cotejo posterior | Residentes distintos según la conversación; no trasladar automáticamente al destino inicialmente propuesto |
| Nueve TAGs y discrepancia CSV | Confirmar que el export es posterior a los cambios y repetir consulta de asociaciones |
| Asociación previa de 35 TAGs a 20 viviendas | Confirmación del COMMIT no documentada; verificar persistencia con consulta nueva |
| Rosas 33, ID 97 | Leer fecha real del C3 para TAGs 9909769 y 9909783; CSV de asociaciones no incluye fechas |
| Recargos históricos | Identificar cortes ya cubiertos para no cobrarlos nuevamente |
| Correo del banco para conciliación | Obtener muestra y proveedor de buzón; validar datos únicos y autenticidad antes de implementar |
| Prueba integral en producción | Con vivienda/TAG dedicados y referencia nueva: reportar, revisar, leer fecha real posterior, comprobar idempotencia y apertura cuando corresponda |

## Actualización recurrente

Tarea de ChatGPT programada **todos los días a las 23:30, America/Mexico_City**,
para revisar evidencia y publicar un commit normal de este archivo en main.
La primera ejecución está programada para el 10/oct/2026 a las 23:30.
No es un cron de Hostinger ni necesita una computadora de caseta encendida.

- Leer main, AGENTS.md, el índice y este archivo antes de actualizar.
- Revisar commits/PR y evidencia posterior al último punto de revisión. Diferenciar
  propuesto, implementado, revertido, prueba simulada y confirmación física del usuario.
- No inferir novedades de la DB o pruebas físicas desde commits. Si las confirmaciones
  de conversación no son accesibles, mantener su estado anterior y señalar la falta de evidencia.
- Registrar fecha/hora y SHA consultado. Una sola entrada por fecha local, actualizada
  al reintentar; conservar el historial de pruebas y actualizar el resumen actual.
- Si no hay novedades, registrar sin cambios verificables. No anunciar una publicación
  si GitHub la rechazó. Preservar cambios concurrentes; nunca force push de main.
- Esta tarea solo escribe `docs/ESTADO_PROYECTO.md`: no cambia código, DB, TAGs ni
  reglas de negocio. No ejecuta pruebas físicas ni registra pagos. No publica secretos.

## Bitácora

### 2026-10-12

- Pagos: se admiten abonos parciales positivos que cubran recargos pendientes. El caso
  $300 depositados después del corte aplica $50 al recargo y conserva $250 netos;
  tras validar, un complemento de $50 en Mantenimiento completa un mes sin repetir
  el recargo del corte. Se mantiene la revisión administrativa y el bloqueo de otro
  reporte mientras el anterior esté pendiente. Otro corte vencido puede agregar recargo.
- Formulario: acepta el abono, muestra saldo estimado/faltante y explica cómo subir
  el complemento con su propio folio. Sin meses completos no se prepara una escritura
  C3. No requiere cambios de esquema para este flujo. Despliegue y prueba real pendientes.
- Validación local de abonos: 41 pruebas aprobadas en pagos-pruebas, pagos-acceso-c3,
  recargos-mantenimiento y recargos-ui. La suite ampliada conserva los dos fallos ya
  documentados de edición manual/asociación en zkteco-vigencias. SQL/TCP simulados;
  no se consultaron ni modificaron C3, MySQL o Hostinger de producción.

- Navegación del rol SEGURIDAD: únicamente el grupo Seguridad, con Conmutador,
  Seguridad, Visitas, Mapa y Reportes. Mapa y Reportes se trasladan a ese grupo para
  todos los roles. El login de guardia entra directamente en seguridad.html.
- Inicio y Mis viviendas quedan denegados en la política del navegador y en las API
  dashboard/viviendas. Mi cuenta permanece accesible. Se retira el selector de vivienda
  del guardia y se ignora su contexto de vivienda heredado en autenticación.
- Residentes/ZKTeco conservan permisos operativos requeridos por el centro de Seguridad;
  no aparecen en el menú del guardia. Conexión conserva su API interna, sin página pública.
- Validación local: 23 pruebas aprobadas de permisos, autenticación, navegación/login,
  interfaz unificada y rutas de viviendas; git diff --check sin errores. Son simulaciones,
  no pruebas con cuentas reales ni confirmación de despliegue de frontend/backend.


### 2026-10-11

- Main avanzó desde `8ec5019` hasta `ebed7ff`; se fusionaron los PR #133–#141. Se excluyó
  `e987281`, que solo actualizó esta bitácora, de la lista de trabajo de producto.
- #133–#139: nueva agrupación/orden del menú y rediseño responsive compacto; KPIs
  horizontales, Directorio recuperado y página `conexion.html` retirada. El endpoint interno
  de estado usado por Seguridad no fue eliminado. Falta validación visual y de despliegue.
- #140: incorporó consulta autenticada de cuotas por vivienda para Seguridad, mejoras móviles
  y una integración Google Sheets de solo lectura con staging aislado. Sheets queda deshabilitado
  por defecto y la migración es manual; no se confirmó configuración ni ejecución en producción.
- #141: reordenó Seguridad para colocar Cuotas antes de Comunicación directa y alineó fichas
  móviles de Análisis. Solo cambió frontend/pruebas; no acredita operaciones de pagos o C3.
- GitHub no devolvió check-runs ni estados de commit para los heads de #133–#141; cero PR abiertos.
- Ejecución local de seis archivos de pruebas relevantes: 26 aprobadas y 3 fallidas. Los fallos
  corresponden a expectativas de cache busting antiguas que no reconocen las versiones finales
  de assets tras PR posteriores; deben corregirse o explicarse antes de declarar la suite verde.
- No se consultó ni modificó producción, Hostinger, Google Sheets, DB o C3; no se realizaron
  pagos, escrituras de TAG ni pruebas físicas. Se conservan pendientes y confirmaciones anteriores.

### 2026-10-10

- OCR: se conservaron las reglas de revisión independiente y confirmación administrativa.
  La lectura de notificaciones bancarias se discutió como propuesta, sin implementación.
- PR #132 de pruebas automatizadas: creado, fusionado y luego **revertido a solicitud
  del usuario**. Reversión confirmada en main (`5828fca`).
- Cotejo de CSV y padrón oficial: 27 viviendas del padrón sin TAG; 8 registros fuera
  del padrón y Jardines 142 marcada inexistente. Se generaron dos informes PDF;
  el cotejo actualizado sustituye el conteo bruto para clasificar viviendas reales.
- Se registraron las confirmaciones del usuario sobre Lirios/Jardines y la discrepancia
  de los nueve TAGs. No se hicieron correcciones de DB durante el cotejo.
- Se publicaron AGENTS.md e índice en main (`6995b84`), señalando documentación histórica
  incompatible para evitar reinstalar cálculos desde fecha_base o autoaprobar comprobantes.
- Validación local: 35 pruebas aprobadas, 2 fallidas de edición manual; pendientes de diagnóstico.
- Se creó este archivo y se programó su revisión/publicación a las 23:30.
  La creación de la tarea no prueba que su primera ejecución haya ocurrido.
- Revisión de las 23:27, America/Mexico_City: main leído `8ec5019f24aea496ca8d829f96678d64e4021b7a`.
  Desde `6995b84`, solo hay el commit documental de creación del estado; sin cambios
  nuevos verificables de producto. Cero PR abiertos; historial de #132 revertido conservado.
- Checks: main sin estados ni runs PR devueltos. Se recuperaron logs históricos de Actions
  del PR #132: `DB_PORT=3306 npm run test:flujos`, 80 aprobadas y cero fallidas;
  `cuentas-servidor` omitido. No sustituyen los 35 éxitos y dos fallos conocidos de main.
- Evidencia de conversación: el usuario reportó completada una fusión de tres pares.
  Se mantiene pendiente el COMMIT explícito y la verificación de persistencia; las imágenes
  no fueron inspeccionadas en esta revisión. Cinco registros externos aún pendientes según
  el intercambio; se retiró una correspondencia de residente previamente afirmada.
- No se consultó ni modificó producción, ni se ejecutaron pagos, escrituras de TAG o
  pruebas físicas. Se conserva el historial y una sola entrada para esta fecha.
