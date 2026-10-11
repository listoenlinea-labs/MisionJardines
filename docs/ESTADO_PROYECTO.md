# Estado actualizado de Misión Jardines

**Última revisión:** 10/oct/2026, 21:12, America/Mexico_City.
**SHA de main consultado:** `6995b845b500e7530d83b6d3cc6a3ab34ca62697`.
**Fuentes de esta revisión:** código y commits de main; resultados locales de pruebas;
confirmaciones del usuario en la conversación y exportaciones identificadas en el índice.
No se consultaron MySQL ni el C3 de producción durante esta revisión.

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
| Continuidad documental | Disponible en main | AGENTS.md e índice publicados en `6995b845b500e7530d83b6d3cc6a3ab34ca62697`; este archivo agrega estado y bitácora |

Un merge no acredita despliegue en Hostinger ni prueba física de una pluma.
No se verificaron los valores efectivos de variables de producción.

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
| Nueve TAGs sin casa | El usuario dijo resueltos | Sigue discrepancia con 42-3.csv: nueve casa_id NULL; falta confirmar versión/consulta actual |

## Pruebas automatizadas con resultado conocido

| Fecha | Código / comando | Resultado | Interpretación |
| --- | --- | --- | --- |
| 10/oct/2026 | Rama del PR #132, `DB_PORT=3306 npm run test:flujos` | 80 aprobadas, 0 fallidas | **Histórico:** ese PR fue revertido. Incluía un ajuste de simulación de OCR; no implica que main actual tenga 80 pruebas verdes |
| 10/oct/2026 | main `5828fca`, `DB_PORT=3306 node --test backend/test/pagos-acceso-c3.test.js backend/test/recargos-mantenimiento.test.js backend/test/zkteco-vigencias.test.js backend/test/zkteco-autosync.test.js` | **35 aprobadas, 2 fallidas** | SQL/TCP simulados; no se escribió al C3 ni a MySQL de producción |
| 10/oct/2026 | Documentación de continuidad: enlaces relativos y `git diff --check` | Sin errores | Solo valida archivos/enlaces; no funcionamiento de backend o equipo |

Los dos fallos están en `backend/test/zkteco-vigencias.test.js`:

- `manual date edit persists without queueing the old maintenance cutoff`.
- `editing a house association never queues an old SQL cutoff`.

En ambos casos el C3 simulado conservó EndTime `20260910`, cuando se esperaba
`20261110`. Falta investigar código y preparación de la prueba; no se corrigió
al añadir documentación. Conservar estos resultados hasta una ejecución nueva
que explique y confirme su resolución.

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
TAG entregado; confirmar antes de asignar. Ninguna fila fue borrada en este cotejo.

## Pendientes y próxima evidencia necesaria

| Pendiente | Qué falta para cerrarlo |
| --- | --- |
| Dos pruebas fallidas de edición de TAG | Diagnosticar y repetir pruebas pertinentes, sin debilitar validaciones reales |
| 27 viviendas del padrón sin TAG | Confirmar entrega/posesión y asociación; nueva consulta/exportación tras ajustes |
| 8 registros fuera del padrón + Jardines 142 | Revisar referencias de pagos, cuentas, TAGs y otros módulos antes de corregir/fusionar/eliminar |
| Jardines 21/25/29/37 | Cotejar con 201/205/209/307; coincidencia de residente es indicio, no prueba final |
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
