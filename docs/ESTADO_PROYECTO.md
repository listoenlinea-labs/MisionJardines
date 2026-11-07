# Estado actualizado de Misión Jardines

**Última revisión:** 6/nov/2026, 23:30, America/Mexico_City.
**SHA de main consultado:** `53d1eb9b36ffd5b1473e318fe18ca1109c9f1898`.
**Fuentes de esta revisión:** relectura de AGENTS.md, índice y estado vigentes,
comparación de main desde `d64b8e6b897185617f87d18b49c2ccd49992771c`,
historial reciente de commits, PR #354–#356, PR abiertos y evidencia de checks en GitHub.
Main avanzó doce commits: se excluyó `03eca3a95536fa2e2b33c0fab18c393c1ed8bf6e`,
dedicado exclusivamente a esta bitácora, y se verificaron tres PR de producto fusionados.
No hay PR abiertos. Los heads de #354–#356 y el merge actual devuelven cero workflows y
cero estados; los resultados locales que constan en los PR no se presentan como CI.
Las vistas previas efímeras de Hostinger registradas por el bot se eliminaron al cerrar
los PR y no acreditan despliegue en producción. No se consultaron Hostinger, C3 o MySQL
directamente, no se enviaron mensajes ni se publican credenciales, teléfonos,
comprobantes o datos privados del padrón.

Leer junto con [AGENTS.md](../AGENTS.md),
[índice de documentos](INDICE_DOCUMENTOS.md) y
[reglas de pagos/C3](PAGOS_ACCESO_C3.md). Este archivo conserva estado y evidencia;
no redefine las reglas de negocio ni sustituye las fuentes originales.

## Implementado en main el 6/nov/2026

Los PR [#354](https://github.com/listoenlinea-labs/MisionJardines/pull/354) y
[#355](https://github.com/listoenlinea-labs/MisionJardines/pull/355) incorporan una
experiencia instalable del portal: manifiesto, iconos, apertura independiente desde
`app.html`, instrucciones para Android/iPhone y un botón que usa
`beforeinstallprompt` cuando Chrome Android lo ofrece. La aplicación sigue requiriendo
conexión y el backend actual; no se agregó funcionamiento offline. Las vistas previas
de Hostinger fueron efímeras y no prueban publicación del portal principal. Quedan
pendientes Chrome Android, Safari/iPhone, inicio de sesión, navegación y selección de
un comprobante en teléfonos físicos sobre la URL desplegada.

El PR [#356](https://github.com/listoenlinea-labs/MisionJardines/pull/356) agrega,
desactivado por defecto, un piloto de recepción de comprobantes por WhatsApp Cloud API:
verificación y firma del webhook, descarga limitada a JPEG/PNG/WebP/PDF de hasta 2 MiB,
deduplicación por ID de mensaje, tabla SQL y buzón privado de listado/descarga para
ADMINISTRADOR y SUPER_ADMIN. La recepción no acredita dinero, no asigna viviendas, no
actualiza TAGs y no sustituye las guardas de validación bancaria. Falta ejecutar el SQL
en una base de prueba, configurar Meta, probar webhook y adjuntos, definir retención,
vincular número-vivienda, conectar OCR/registro de pagos, agregar acuse e interfaz y
desplegar. No se recibió ningún comprobante real ni se consultó MySQL en esta revisión.

Los PR reportan validaciones locales, pero no publican sus comandos: #354 registró
**49 aprobadas y 12 fallidas preexistentes** y no pudo iniciar Chromium; #355 registró
**18 aprobadas y 2 fallidas preexistentes** con eventos simulados; #356 registró
**54 de 58 aprobadas**, con cuatro fallos en pagos y vigencias. GitHub devuelve cero
runs y cero estados para los tres heads y para `53d1eb9`; por tanto no hay CI nuevo.
Ningún resultado acredita producción, Meta real, MySQL, navegador o teléfono físico.

## Implementado en main el 4/nov/2026

El PR #348 amplía Cuotas extraordinarias con tarjetas, dona, desglose por calle y cuatro
exportaciones Excel acotadas al proyecto seleccionado; los libros incluyen padrón,
estados, finanzas, aportaciones, No aplica y abonos parciales, con gráficas ChartML.
También incorpora envío administrativo del PDF oficial por correo, retorno desde ZKTeco
con filtros guardados y una señal de revisión en memoria para refrescar Finanzas entre
sesiones sin consultar MySQL cada 20 segundos. En procesos múltiples el respaldo es más
lento; no equivale a sincronización instantánea ni acredita Excel abierto, SMTP real,
despliegue o cifras de producción.

El PR #349 separa el transporte Gmail de recibos del SMTP existente de Listo en Línea:
usa variables `MJ_GMAIL_SMTP_*`, sin respaldo automático al transporte anterior ni
cambio de sus variables. El PR #350 oculta de los avisos solo proyectos con saldo cero,
corrige nombres largos y permite cambiar el destinatario para un envío sin persistirlo.
#351 corrige el `ReferenceError` de `proyectoId` en el navegador y conserva
`null` para mantenimiento y el ID activo para extraordinarias. No se autenticó SMTP
ni se confirmó entrega real.

El PR #352 corrige la guardia que bloqueaba una cuota cuando existía cualquier evento
C3 vinculado: únicamente los eventos con estado `ANULADO` dejan de bloquear cotización
y confirmación; bancos y los demás estados C3 siguen bloqueantes. Los seis resultados de
Workbench aportados por el administrador y resumidos en el PR acreditan para ese caso
una cuota pendiente y un evento vinculado anulado. La revisión no consultó MySQL de
nuevo, no registró un pago ni alteró el evento o la vigencia física; falta desplegar el
backend y repetir el flujo controlado.

El PR #353 añade guardado administrativo independiente de teléfono o correo en la
vivienda desde el modal de recibo, sin modificar cuentas, condóminos, pagos ni el otro
campo. Los contactos pueden seguir usándose solo para una operación sin guardarlos y
la confirmación centrada aparece únicamente después de aceptación SMTP. Requiere
desplegar backend y frontend coordinados; no se guardaron contactos ni se enviaron
correos en producción.

Los workflows de #348, #349 y #350
([41844009015](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/41844009015),
[41845023807](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/41845023807)
y [41885015371](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/41885015371))
concluyeron `success`. En el último pasaron Excel/correo/retorno/sincronización **8/8**,
SMTP aislado **3/3** y saldo cero/correo editable **7/7**; la suite de #348 volvió a
pasar **8/8**. Persisten diagnósticos no bloqueantes UI **4/6** y bancaria **87/88**.
#351–#353 añadieron pruebas específicas, pero sus heads devuelven cero runs y cero
estados: no deben presentarse como ejecutadas por CI. Ningún check prueba Hostinger,
MySQL, Gmail real, navegador, Microsoft Excel ni C3 físico.

## Implementado en main el 3/nov/2026

Los PR #334–#335 compactan y alinean las gráficas de Ingresos/Egresos, dejan
Cumplimiento y Desglose inicialmente cerrados, reducen heurísticas de tarjeta bancaria
en los campos TAG de iPhone y concentran cuatro acciones de recibos/Drive en una barra
horizontal. #338 habilita de forma programática los calendarios Fecha desde/hasta y
#347 extiende a Cuotas extraordinarias el resaltado de la fila elegida, acotado al
proyecto activo. Son cambios de frontend; falta revisión visual en Safari/iPhone,
Android y escritorio después de publicar GitHub Pages.

El PR #336 amplía Borrar del historial de mantenimiento a folios históricos elegibles.
Archiva el movimiento antes de devolver la cuota a pendiente y, cuando existe una fecha
anterior verificable, prepara una orden C3 `REVERSA`; bloquea pagos bancarios validados,
parciales, ambiguos o con meses posteriores. El PR #344 añade anulación transaccional y
auditada de una aportación extraordinaria concreta, con doble confirmación y protección
de pagos bancarios. Ninguno acredita una anulación real, restauración física del C3 o
prueba contra MySQL de producción.

El PR #337 incorpora la categoría de egreso `PROYECTO` sin convertirla en cuota ni
reclasificar el legado `PROYECTOS`. El modelo y la verificación de esquema pueden ampliar
el ENUM al arrancar el backend; requiere permisos `ALTER TABLE`, despliegue y cotejo en
una base de prueba antes de registrar gastos reales.

Los PR #339–#346 implementan Cuotas extraordinarias por proyecto sobre el padrón esperado
de 231 viviendas: metas y aportaciones por vivienda, abonos positivos repetibles sin
recargos ni efectos C3, pagos bancarios pendientes que reservan disponibilidad, edición
auditada y concurrente, presupuesto fijo con excepciones, cuota cero/estado No aplica,
folios de recibo `-P`, ZIP y respaldos Drive separados. La interfaz final conserva
Nuevo proyecto e Importes por vivienda; #343 restaura el editor masivo que #342 había
retirado. La importación privada se ocultó de la pantalla, pero el código de importación
y el historial se conservan. El merge no demuestra que se crearon tablas, proyectos,
cargos o aportaciones en MySQL ni que frontend/backend estén desplegados.

La conciliación incorporada por #339 documenta solo agregados: 231 renglones pero 230
domicilios únicos en un archivo, diferencia de $1,000 entre suma y cabecera, y tres
tarifas especiales inferidas que requieren confirmación administrativa antes de
cualquier importación. No se publicaron archivos, nombres ni pagos por vivienda y esta
revisión no recuperó una confirmación nueva del usuario para ejecutar la importación.

Los catorce workflows **Verificar finanzas** concluyeron `success`, desde
[41664324384](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/41664324384)
hasta [41740068734](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/41740068734).
En el run final pasaron proyectos/presupuesto/cuota cero **20/20**, la regla específica
de tarifa especial cero **1/1** y selección de proyecto **5/5**. Siguen diagnósticos no
bloqueantes UI heredada **4/6** y bancaria **87/88**. Las suites nuevas de gráficas/UI
compacta, reversión histórica, categoría Proyecto, aportaciones libres, recibos/Drive
extraordinarios y anulación extraordinaria no están en el workflow final; los checks
verdes no prueban navegador, MySQL, OAuth/Drive, Hostinger ni C3 físicos.

## Implementado en main el 2/nov/2026

Los PR #323–#324 implementan la anulación auditada de pagos manuales de mantenimiento
con referencia MJMAN, vista previa y doble confirmación. Revierte cuotas/eventos en una
transacción y prepara una orden C3 `REVERSA` que debe validar identidad, permisos y
fecha física antes de restaurar el corte. #324 conecta los listeners que faltaban en la
primera entrega. Movimientos históricos sin instantáneas se bloquean; no se ejecutó una
anulación real y una orden en cola no acredita restauración física.

Los PR #323–#326 agregan ZIP mensual de recibos y respaldo Google Drive. #325 permite
elegir con Google Picker una carpeta existente `02_Recibos_PDF`, subir PDF individuales
en lotes de diez y mantener el Excel separado. #326 unifica historial, selector, ZIP y
Drive para que un movimiento multi-mes conserve importe, rango y folio completos; el
pago anual de dos meses no se presenta como enero–diciembre. Requieren OAuth/configuración,
frontend/backend y prueba real; no se usaron credenciales ni archivos de Drive.

Los PR #327–#330 rehacen Ingresos por calle y Egresos por concepto con ocho calles y
ocho categorías, valores del mes seleccionado y comparativos históricos en modales.
#331 corrige la superposición de Google Picker y conserva página/filtros al recargar.
#332 fija el criterio contable final: las barras mensuales usan el importe acreditado
a la cuota de cada período, reparten anualidades entre meses y no duplican recargos;
el efectivo recibido por fecha se conserva separado para caja/saldo.

El PR #333 permite editar el total mensual de un concepto de egreso mediante un asiento
nuevo por la diferencia, no sobrescribiendo gastos originales. Valida categoría, mes,
decimales y concurrencia, usa transacción SERIALIZABLE con `FOR UPDATE` y conserva
auditoría. Está en main, pero debe probarse contra respaldo/clon antes de modificar
montos reales.

Los once workflows **Verificar finanzas** concluyeron `success`, desde
[41479188352](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/41479188352)
hasta [41568172055](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/41568172055).
El run final conserva los diagnósticos no bloqueantes UI heredada **4/6** y bancaria
**87/88**. El workflow no añadió pasos para las nuevas suites de reversión, Drive,
recibos, reportes, Picker o ajustes de egresos; las simulaciones y sintaxis declaradas
en los PR no prueban MySQL, OAuth, Hostinger, navegador ni C3 reales.

## Implementado en main el 31/oct/2026

Los PR #318–#319 están fusionados y retiran de las lecturas operativas las viviendas
sintéticas Prueba TEST-001 y TEST-002. El filtro compartido las oculta de Análisis,
Seguridad, Casas, Residentes, búsquedas, Mis viviendas, Auto-users y el tablero ZKTeco,
incluidos DEPTNAME sin vivienda vinculada. Es una regla de visibilidad: no borra cuotas,
pagos, recibos, TAGs ni historial. El objetivo de 231 viviendas depende todavía del
padrón y despliegue reales; el merge no confirma el conteo en MySQL/Hostinger.

El PR #320 incorpora un diagnóstico C3 de solo lectura para administradores: distingue
configuración, apertura TCP, protocolo/contraseña e inventario `GETDATA user`, sin
publicar host, IP o secretos ni escribir TAGs. Los errores pasan a mostrarse en ZKTeco
y en el modal de Análisis. El PR #321 destruye sockets parciales, añade un único
reintento de 1.2 s solo para fallos transitorios y reduce sesiones TCP al usar MySQL en
búsqueda/paginación; conserva el autosync periódico y la sincronización física manual.

Los PR #321–#322 unifican la búsqueda de ZKTeco en el campo libre «Calle y número»:
acepta calle sola o domicilio completo sin listado desplegable; el selector del modal
Editar TAG se conserva. No cambian permisos, asociaciones, fechas ni operaciones C3.

Los cinco workflows **Verificar finanzas** concluyeron `success`. En el run final
[41264705409](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/41264705409)
pasaron diagnóstico C3 **7/7**, resiliencia/búsqueda **9/9** y campo libre **2/2**.
Permanecen diagnósticos no bloqueantes: UI heredada **4/6** y suite bancaria **87/88**
por expectativas ya documentadas. Son simulaciones/checks de GitHub; no acreditan
despliegue, IP/DDNS estable, MySQL real ni comunicación con el C3 físico.

## Implementado en main el 29/oct/2026

Los PR #308–#317 están fusionados. #308 corrige los recibos de mantenimiento de
Análisis para tomar el importe exacto del movimiento y no volver a sumar un recargo
ya incluido; también distingue viviendas sin pagos y resalta saldos pendientes sin
quitar las acciones. El caso sintético de $650 con $50 de recargo debe conservar
$650 en historial, vista previa y PDF, no $700.

Los PR #309–#314 ajustan exclusivamente la experiencia móvil de Análisis: resumen del
historial en cuadrícula 2×2, tarjeta de Pago anual compacta, gráficas inicialmente
plegadas y de 46 px, alineación uniforme de los tres desplegables y KPI financieros
legibles en dos columnas. No cambian cálculos, registros, SQL ni C3.

El PR #315 permite que ADMINISTRADOR y SUPER_ADMIN reserven Casa Club directamente
como APROBADA usando el rol autenticado del servidor. Conserva elegibilidad financiera,
fecha única y cargos; aprobar no registra ni valida el pago. Los residentes siguen con
solicitud PENDIENTE.

Los PR #316–#317 incorporan para recibos de mantenimiento emitidos desde Análisis el
folio y nombre `MJ-MES-AÑO-CÓDIGO-CASA-M.pdf`. La descarga nativa del visor de Chrome
usa una URL HTTP firmada por cinco minutos, limitada al recibo y a roles administrativos.
No altera comprobantes históricos ni implementa todavía emisores de Proyectos/Casa Club.

Los diez heads tuvieron workflow **Verificar finanzas** con conclusión `success`.
Los pasos obligatorios pasaron, pero la suite bancaria heredada siguió como diagnóstico:
en el run de #317, `node --test backend/tests/*.test.js` quedó **87/88** por la
expectativa conocida «si falta identificador devuelve campos necesarios para modal»,
igual que main base. No hubo validación visual en dispositivo, MySQL/Casa Club real,
despliegue de main en Hostinger ni descarga nativa confirmada en navegador.

## Implementado en main el 27/oct/2026

Los PR #305 y #306 están fusionados en main. #305 habilita el reparto desde dos
viviendas activas; con una vivienda se conserva el formulario individual. #306
acepta en mantenimiento cualquier importe positivo desde $0.01, también al repartir:
aplica primero a los recargos más antiguos y después al principal de mantenimiento.
El saldo no cubierto permanece pendiente y la cobertura/C3 solo avanza cuando se
completa el principal mensual. El mismo PR retira del formulario los cuadros visibles
duplicados de Calle/Número, sin perder el contexto interno de la vivienda.

El PR #307, solo documental, fija en AGENTS.md la regla general de que un comprobante
no se rechaza por no liquidar mantenimiento, extraordinarias o casa club. Esto no
equivale a soporte completo: mantenimiento ya lo implementa #306, mientras que
extraordinarias y casa club todavía requieren adaptación y pruebas. Un abono parcial
no confirma reserva, liquidación ni acceso.

La obligación anterior de cubrir todos los recargos aparece en el commit
`6d82095656f3d5338235eabf722bed64280b2d36` del PR #288. Los metadatos no permiten
atribuir su autoría a un chat o asistente concreto.

#305 no requiere SQL ni variables; #306 requiere desplegar backend y frontend juntos.
Las pruebas usan cuotas, almacenamiento, OCR y C3 simulados. La fusión y los checks
no demuestran despliegue ni funcionamiento en Hostinger, MySQL, Titan o C3 físico.

## Implementado en main el 26/oct/2026

Los PR #295–#304 están fusionados. #295 refresca historial, tarjetas y burbuja de
adeudos cuando un pago pasa de revisión a estado final; su primer workflow falló en
la batería financiera y su aceptación en navegador sigue pendiente. #296 añade el
botón accesible para mostrar/ocultar ambas contraseñas de aceptación. #297 permite
crear desde Auto-users un prerregistro individual por vivienda, sin enviar correo ni
conceder acceso al crearlo y sin borrar al residente anterior.

Los PR #298–#300 amplían OCR móvil y formatos bancarios, y dejan el concepto como dato
informativo: la vivienda procede del vínculo autorizado del reporte. Se mantienen
remitente/asunto configurados, identificador, importe, fecha, cuenta destino,
coincidencia única y hash no reutilizable. Una imagen privada aportada se procesó
localmente con el OCR del servicio y coincidió en los campos documentados; la imagen y
sus datos no se publican. Esto no acredita recepción bancaria, despliegue ni Titan real.

Los PR #301–#302 incorporan reintento controlado del mismo comprobante rechazado, con
máximo tres intentos y relectura OCR de la imagen persistida antes de consultar Titan.
El modal muestra las etapas OCR/Titan y conserva folio, PDF, importe y evidencia; nunca
reabre un pago validado, aplicado o cuyo hash ya fue usado. #304 corrige un 404 causado
por la validación del ID y amplía candidatos multi-banco sin etiquetas, excluyendo
cuentas, importes, fechas y conceptos. La acreditación sigue siendo decisión del backend.

El PR #303 implementa el reparto de un depósito de mantenimiento solo cuando la cuenta
tiene más de dos viviendas activas. La suma por casa debe coincidir exactamente en
centavos con el OCR del servidor; se guarda un reporte bancario único y planes
individuales versión 3. Todas las cuotas se acreditan en una transacción y cada vivienda
recibe su propio historial/recibo/objetivo C3 después del commit. No requiere SQL nuevo,
pero backend y frontend deben desplegarse juntos. No se verificaron MySQL, buzón ni C3
reales. Ver [reparto por viviendas](PAGOS_REPARTO_VIVIENDAS.md).

## Implementado en main: Pagos, cuotas, Seguridad y C3

Los PR #288 y #289 ya están fusionados. Pagos y Análisis comparten la fuente contable
por vivienda; pagar no exige TAG, la acreditación financiera se confirma en una
transacción y C3 recibe después un objetivo absoluto cuando corresponde. El cálculo
de #289 parte del último corte cubierto, aplica mensualidades consecutivas y separa
la fecha bancaria del periodo pagado, sin reconstruir huecos históricos. La migración
aditiva de #288 sigue pendiente de ejecución y verificación en el MySQL de producción;
el merge no acredita despliegue, conciliación bancaria real ni escritura física.

El PR #290 también está en main y añadió saldo a favor, exenciones de recargo,
cotización compartida y cobertura desde enero de 2026 para viviendas sin pagos. Esto
entra en conflicto documental con AGENTS.md, que conserva septiembre de 2026 como base
cuando no hay cobertura registrada. La discrepancia enero/septiembre debe resolverse
antes de usar el cálculo en producción; no se infiere cuál dato corresponde a cada
vivienda. Los PR #291–#293 ajustan únicamente formato y controles de interfaz.

El PR #294 ya está fusionado: Seguridad reutiliza el mismo cálculo y clasificador de
estado que Pagos/Análisis, incluida tarifa individual, exenciones, anticipos y abonos
parciales. La regresión de Atotonilco 752 se cubrió con datos simulados para evitar que
una cuota pendiente antigua marque «Deudor» cuando un pago confirmado posterior cubre
el corte. El cambio es de lectura y no modifica cuotas, pagos ni ZKTeco. No acredita
que el caso real ya esté desplegado o corregido en la base de producción.

## Resumen operativo

| Área | Estado | Evidencia y límites |
| --- | --- | --- |
| Portal instalable / Android | Implementado en main; despliegue y teléfonos físicos pendientes | #354 agrega manifiesto, iconos e instrucciones Android/iPhone; #355 muestra el botón nativo solo cuando Chrome Android ofrece `beforeinstallprompt`. Requiere conexión, no añade modo offline y las vistas previas efímeras no prueban producción |
| Comprobantes por WhatsApp | Piloto desactivado implementado en main; integración y prueba real pendientes | #356 valida firma, formatos/tamaño, deduplica y reserva el buzón a administración. No acredita pagos, asigna viviendas ni toca TAGs. Faltan SQL/configuración Meta en prueba, retención, vínculo vivienda, OCR, acuse, interfaz y despliegue |
| Pagos de mantenimiento | Unificación, reparto y guardas C3 implementados en main; despliegue y regla base pendientes | #288–#290 unifican `cuotas`/casa y C3 posterior al commit; #303/#305 reparten desde dos viviendas; #306 acepta desde $0.01 y aplica recargos antes del principal. #352 excluye solo eventos C3 ANULADO del bloqueo de cotización/registro, conservando bancos y demás estados. Continúa la discrepancia enero/septiembre y falta validar producción |
| Confirmación de comprobantes | Conciliación y reintento en main; política de remitente falsificable y producción pendientes | #300 deja el concepto como informativo; #301–#302 reintentan el mismo comprobante con OCR nuevo antes de Titan; #304 corrige el 404 de IDs y compara candidatos multi-banco. Siguen obligatorios remitente/asunto configurados, identificador, importe, fecha, cuenta, coincidencia única y no reutilización. Sin prueba en Titan/Hostinger real |
| Pagos y recibos del condómino | Refresco, reintento, reparto y formulario simplificado en main; navegador/producción pendientes | #295 actualiza historial/tarjetas/burbuja; #301–#302 muestran reintento OCR/Titan; #303/#305 generan reparto desde dos viviendas; #304 separa 404 de comprobante/ruta; #306 retira Calle/Número duplicados y admite abonos positivos de mantenimiento. La UI no valida depósitos por sí misma y falta aceptación en Safari/app.html |
| OCR | Formatos flexibles, doble lectura y candidatos multi-banco en main | #298 agrega segunda lectura segura para columnas; #299 reconoce importes/fechas sin etiquetas y excluye comisión/saldo/cuentas; #304 compara candidatos sin etiqueta contra identificadores expresos del aviso. Se conserva OCR independiente del servidor y rechazo de ambigüedad. La prueba privada local no acredita despliegue ni recepción |
| Escritura C3 por pago | Flujo general implementado en main; hardware no verificado | #288 entrega un objetivo absoluto SQL posterior al commit, conserva idempotencia y permite acreditar sin TAG; fallos C3 no revierten el abono. No se ejecutó la migración ni se comprobó Hostinger, MySQL o controlador físico |
| Edición manual de TAGs | Implementada en main; búsqueda simplificada y validación física pendientes | PR #205 permite habilitar, crear, reasignar o agregar TAGs aun con adeudo. #321–#322 dejan búsqueda libre por calle/domicilio y conservan el selector de Editar TAG. `bloqueado=false` no prueba `userauthorize` en el C3; dos expectativas históricas de `editTag` siguen fallando en simulación |
| Inventario C3 | Diagnóstico, lectura periódica y retorno con contexto implementados; conexión física pendiente | #320–#321 añaden diagnóstico, cierre/reintento acotado y evitan TCP al buscar. #348 permite volver desde ZKTeco a Análisis con proyecto, fechas, filtros y página guardados por 30 minutos; no cambia la conexión. La pérdida tras apagón/IP continúa sin recuperación, DDNS o despliegue confirmados |
| Cuentas y viviendas | Relación múltiple y contacto de recibo por vivienda implementados; migración/despliegue pendientes | #215 usa `condominos_viviendas`; #216 retira `condominos.direccion_id` del código. El CSV previo reporta 188 relaciones copiadas sin faltantes. #353 permite guardar por separado teléfono o correo en la vivienda sin modificar cuentas/condóminos. Falta despliegue coordinado, prueba de autorización y la migración final SQL 01/02 |
| Conmutador | Integración futura | No se confirmó funcionamiento con hardware en esta revisión; consultar configuración antes de habilitar telefonía |
| Automatización de pruebas PR #132 | Revertida | Reversión en main: `5828fca4d7e68e4a5d72141b9678aabba9482b36`; no usar sus comandos/workflow como si siguieran disponibles |
| Seguridad HTTP | Corrección DoS en main; despliegue pendiente | #270 actualiza body-parser a 2.4.0, fija override mínimo y rechaza cuerpos JSON/form comprimidos antes de descomprimir. La prueba HTTP real reporta 7/7; `npm audit --omit=dev` conserva cinco dependencias ajenas a esa alerta |
| Depuración de viviendas | Fusión de tres pares reportada por el usuario | Falta confirmación explícita de COMMIT y lectura posterior desde otra conexión; cinco registros externos siguen pendientes según la conversación. No hay verificación nueva de producción |
| Interfaz, navegación y fechas | Implementado en main; aceptación parcial | #208 conserva DD-MON-YYYY; #223–#239 corrigen portal, navegación y refresco. #309–#314 compactan Análisis; #334–#335 alinean/compactan gráficas, colapsables y barra de acciones, #338 habilita calendarios y #347 resalta la fila de extraordinarias. Falta validar en Safari/iPhone, Android y escritorio tras despliegue |
| Historial administrativo de pagos | Implementado en main; producción no verificada | PR #160–#162 conservan historial 11–10. PR #209 añade historial por vivienda/concepto, total del último movimiento y separación explícita entre vigencia C3 verificada y MySQL; #214 oculta solo el aviso naranja, no la diferencia. No corrige fechas automáticamente |
| Pagos manuales desde Análisis | Registro y anulaciones auditadas en main; uso real pendiente | #171/#173–#176 registran mantenimiento y #193 amplía conceptos. #323–#324 anulan MJMAN con instantáneas; #336 admite históricos elegibles y prepara C3 REVERSA solo con fecha anterior verificable. #344 anula una aportación extraordinaria auditada. No se probó con MySQL/C3 real; bloqueos de seguridad y una cola no confirman restauración física |
| Auto-users | Alta individual implementada; SMTP/producción pendientes | #296 añade mostrar/ocultar contraseñas. #297 crea prerregistro individual transaccional por vivienda, idempotente y sin enviar correo al crear; conserva cuentas/vínculos anteriores y separa la baja del inquilino saliente. La invitación individual anterior fue recibida por el usuario, pero este flujo nuevo no se probó con MySQL/SMTP reales |
| Correo de recibos | Implementado en main; configuración y entrega real pendientes | #348 envía el PDF oficial con límite por folio/actor; #349 aísla `MJ_GMAIL_SMTP_*` del SMTP existente sin fallback; #350 admite destinatario de una operación; #351 corrige proyectoId; #353 permite guardar contacto y confirma solo tras aceptación SMTP. No se configuró Hostinger ni se envió correo en esta revisión |
| Seguridad, pluma y cámaras | Parcialmente implementado; hardware no verificado | PR #159 reutiliza el endpoint de pluma y prepara proxy HLS; #163 añade diagnóstico; #164 retira el visor Dahua de Seguridad, conservando backend/documentación. PR #189 habilita Inicio operativo a Seguridad con visitas de hoy y accesos sin salida, sin finanzas. Falta gateway RTSP→HLS, despliegue y pruebas con cuentas/hardware reales |
| Visibilidad del padrón | Filtros de lectura en main; objetivo 231 pendiente de producción | #177–#178 filtran Guadalajara 707 y Valle de México 3614. #318–#319 ocultan TEST-001/002 de módulos operativos y ZKTeco sin borrar historial, pagos o TAGs. Falta desplegar y confirmar 231 viviendas y ausencia de ambas pruebas en consultas reales |
| Finanzas históricas y dashboard | Reportes, ajustes y vista por proyecto en main; producción no verificada | #327–#333 cubren comparativos, criterio por período y ajustes auditados; #337 añade el gasto PROYECTO. #348 cambia tarjetas, dona y calle al proyecto extraordinario activo y exporta libros completos por proyecto. Falta cotejo MySQL, permiso ALTER, despliegue, apertura en Excel y prueba visual |
| Cuotas para Seguridad | Cálculo compartido implementado en main; producción no verificada | #140 creó la vista sin PII. #294 sustituye su criterio independiente por el mismo cálculo/clasificador de Pagos y Análisis, considerando tarifa, exenciones, anticipos y abonos parciales. La regresión Atotonilco 752 está cubierta con fixtures; no se consultó la DB real ni se confirmó despliegue |
| Respaldos Google Drive | Mantenimiento y proyectos implementados en main; OAuth y archivos reales pendientes | #323–#325 incorporan Picker, PDF de mantenimiento y Excel separado; #331 corrige Picker oculto. #341 añade recibos -P, ZIP y respaldo Drive por proyecto/año sin mezclar Excel de mantenimiento. Requiere configuración segura, permisos reales y validación de reintentos/nombres; no se conectó Drive en esta revisión |
| Históricos Google Sheets | Backend/staging opcional conservado; controles retirados de Análisis | PR #140 añadió lectura OAuth y preparación idempotente, deshabilitadas por defecto. PR #187 retiró solo la tarjeta y el script de esa vista; no borró archivo, endpoint, tabla ni datos. Requiere decisión explícita, migración y validación antes de activar |
| Análisis, historial y recibos | Mantenimiento, proyectos y correo implementados; producción no verificada | #308/#316–#326 cubren importe, folio, ZIP/Drive y movimiento completo; #341 añade recibos -P; #344 anulación auditada. #348–#351 agregan correo del PDF, destinatario de una sola operación y corrigen proyectoId; #353 permite guardar contactos por vivienda y muestra confirmación solo tras SMTP. Falta validar PDF/ZIP, correo real, navegador, Drive y MySQL |
| Navegación de Administración/Comunidad | Implementada en main; validación visual pendiente | PR #187 oculta Cuotas del menú y retira la tarjeta de conciliación; #188 oculta las pestañas de Análisis, conserva sus elementos/rutas y ordena Comunidad con Pagos primero. Son cambios de interfaz, no borrado de datos ni cambio de permisos |
| Inicio por rol | Implementado en main; producción no verificada | PR #223 restaura Inicio dentro del portal persistente: administración ve finanzas, Seguridad visitas/accesos sin cobros y Condómino solo viviendas autorizadas por `usuarios_casas`. Fallos parciales muestran «No disponible» sin inventar ceros. Faltan cuentas reales y revisión de logs/despliegue |
| Cobranza extraordinaria y casa club | Proyectos extraordinarios implementados en main; Casa Club y producción pendientes | #193/#210/#315 cubren cargos y reserva administrativa. #339–#346 implementan proyectos por vivienda, aportaciones repetibles, cuota cero/No aplica, edición, recibos y anulación. #348 añade tablero/Excel por proyecto y #350 evita que saldos cero aparezcan como adeudo sin borrar historia. Falta desplegar/migrar y probar MySQL; Casa Club aún requiere abonos parciales |
| Noticias y tráfico | Implementado en main; despliegue/visual pendientes | #220/#225/#228/#238 conservan fotos, fallbacks e ilustración etiquetada. #263 corrige TomTom a `language=es-ES` y solicita los campos que consume la UI; faltan despliegue y prueba contra la API real con la llave configurada |
| Monitor automático de adeudos C3 | Implementado en main; apagado por defecto | #204–#205 conservan piloto/dry-run y operaciones manuales. PR #210 limita el monitor exclusivamente a deuda de mantenimiento: extraordinarias y Casa club no bloquean TAGs ni cambian vigencias. No auto-reactiva al saldar. Sin prueba física ni escritura de producción |
| Continuidad documental | Reglas de concepto, reparto y abonos actualizadas; discrepancia enero/septiembre pendiente | #307 fija cualquier importe positivo como abono y #305 corrige el reparto desde dos viviendas. #340 ya implementa esa regla para extraordinarias por proyecto; Casa Club sigue pendiente. Debe conciliarse AGENTS.md (septiembre sin cobertura) con #290/código (enero de 2026 sin pagos). El manual integral sigue siendo guion, no evidencia E2E |

Un merge no acredita despliegue en Hostinger ni prueba física de una pluma.
No se verificaron los valores efectivos de producción ni la versión PHP de Hostinger;
el backend documentado continúa siendo Node.js.
Desde el SHA consultado en la revisión anterior, main avanzó 30 commits. Se excluyó
`51b0ebf`, dedicado únicamente a esta bitácora; el trabajo de producto se agrupa en
los PR #348–#353, todos fusionados. No hay PR abiertos. #348–#350 tienen workflows
exitosos; #351–#353 no tienen runs ni estados combinados recuperables. Los checks
acreditan simulaciones y estructura, no despliegue, MySQL, SMTP/Gmail, Microsoft Excel,
navegador ni C3 físico.
El PR #132 continúa revertido.

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
| Nueve TAGs sin casa | El usuario dijo resueltos | Sigue discrepancia con 42-3.csv. El 19/oct se entregó una consulta para los nueve TAGs, pero no se recibió su resultado; no cerrar todavía |
| Tabla `condominos_viviendas` | El usuario aportó CSV de la migración: 188 relaciones originales, 188 copiadas y cero faltantes | Confirma esos archivos/resultados, no una conexión en vivo ni la eliminación de `condominos.direccion_id` |
| Precuentas pendientes | El usuario confirmó el borrado de 159 precuentas PENDIENTES/no aceptadas | Confirmación de conversación; no se recuperó una exportación posterior ni COMMIT/lectura independiente |
| Procedimiento de conciliación del padrón | El usuario mostró `CALL mj_conciliar_padron_20261019()` con error 1644: ya había respaldos o conciliación de esa ejecución | Confirma el intento bloqueado; no demuestra que la conciliación final, sus conteos o su COMMIT sean correctos |
| Invitación SMTP individual | El usuario confirmó «listo funcionó» tras habilitar el envío individual y recibió el correo de invitación | Confirma una entrega controlada con la configuración actual; no acredita lotes masivos, dirección pública definitiva, aceptación completa ni todos los proveedores/buzones |
| Total mensual de Gardenias | El PR #332 registra que el usuario verificó manualmente $2,400 como suma esperada de mensualidades de noviembre, frente a $3,900 que mezclaba anualidades completas | Confirma el cálculo manual esperado, no el valor desplegado ni las filas reales de MySQL. La simulación de #332 reprodujo $2,400 noviembre, $1,500 diciembre y $3,900 de caja; falta cotejo de producción |
| Conexión C3 tras apagón | El usuario informó que, tras un apagón, cambió la IP pública del módem y se perdió la conexión con el C3 | Confirma la incidencia observada, no su causa técnica completa ni una recuperación. #320–#321 añaden diagnóstico/reintento, pero no implementan DDNS ni actualización automática de IP y no se probaron físicamente |
| Scroll y refresco del portal en móvil | El usuario confirmó que el desplazamiento funciona después de #230; después reportó que el primer gesto de refresco de #231 no cambió nada | #239 contiene una corrección posterior para páginas directas, paneles y cabecera, pero no existe confirmación accesible de que ya esté desplegada o funcione en un teléfono |
| Excel del padrón en Microsoft Excel | La evidencia del PR #252 registra que la versión #250 abrió con cinco gráficas y que #251 volvió a provocar reparación | Confirma la regresión concreta reportada, no que #252/#253 actuales ya abran correctamente; falta nueva descarga y apertura en la misma versión de Excel |
| Diagnóstico del buzón IMAP | La documentación incorporada por #265 registra conexión/lectura real de 41 mensajes con el diagnóstico anterior | En ese momento hubo cero avisos autenticados y cero cuentas de cuatro dígitos reconocidas; no acredita conciliación, depósito, aprobación, MySQL ni TAGs. El contenido privado no fue consultado en esta revisión |
| Prueba bancaria controlada y saldo de Análisis | Los PR #280–#285 conservan evidencia de un reporte controlado que llegó a VALIDADO mientras la cuota aún mostraba saldo | Confirma la discrepancia concreta documentada y motivó #285; no prueba que el flujo general ya actualice `cuotas` ni que C3 haya cambiado. Esta revisión no consultó MySQL ni el buzón |
| Requisito de fuente única | El usuario pidió que Pagos deje de calcular desde ZKTeco y use la misma fuente contable que Análisis, actualizando después Análisis y sincronizando C3 cuando exista TAG | Es una decisión/solicitud accesible, no una prueba física ni una implementación. #285–#287 cubren solo TEST-001 |
| Diagnóstico Workbench del bloqueo por C3 anulado | El PR #352 conserva seis resultados aportados por el administrador: la cuota del caso seguía pendiente y el movimiento C3 vinculado estaba ANULADO | Evidencia puntual de consulta accesible en el PR; esta revisión no leyó MySQL directamente. No demuestra despliegue de #352, pago recibido, nuevo evento ni cambio físico en C3 |

## Pruebas automatizadas con resultado conocido

| Fecha | Código / comando | Resultado | Interpretación |
| --- | --- | --- | --- |
| 6/nov/2026 | PR #354, comando no publicado; validación local y arranque de Chromium | **49 aprobadas, 12 fallidas preexistentes**; Chromium no inició | Evidencia declarada en el PR, no CI. Falta navegador y teléfono físico; no acredita Hostinger principal |
| 6/nov/2026 | PR #355, comando no publicado; eventos simulados de Android, instalación, error, iPhone y standalone | **18 aprobadas, 2 fallidas preexistentes** | Simulación local, no confirmación nativa en Chrome Android ni despliegue |
| 6/nov/2026 | PR #356, comando no publicado; suite existente | **54 de 58 aprobadas**; cuatro fallos en pagos/vigencias | Evidencia local del PR; no prueba Meta, webhook HTTPS, MySQL ni recepción real |
| 6/nov/2026 | GitHub: heads `88d73a9`, `7e6f26d`, `e10da90` y merge `53d1eb9` | **0 workflows y 0 estados** | No hay CI nuevo que permita declarar estas entregas verdes |
| 10/oct/2026 | Rama del PR #132, `DB_PORT=3306 npm run test:flujos` | 80 aprobadas, 0 fallidas | **Histórico:** ese PR fue revertido. Incluía un ajuste de simulación de OCR; no implica que main actual tenga 80 pruebas verdes |
| 10/oct/2026 | main `5828fca`, `DB_PORT=3306 node --test backend/test/pagos-acceso-c3.test.js backend/test/recargos-mantenimiento.test.js backend/test/zkteco-vigencias.test.js backend/test/zkteco-autosync.test.js` | **35 aprobadas, 2 fallidas** | SQL/TCP simulados; no se escribió al C3 ni a MySQL de producción |
| 10/oct/2026, 00:15–00:16, America/Mexico_City | PR #132, head `e9b85ad`; desde backend, `DB_PORT=3306 npm run test:flujos`; [Actions 38030320492](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/38030320492) | **80 aprobadas, 0 fallidas**; job `flujos` success; `cuentas-servidor` skipped | Logs recuperados en esta revisión; resultado histórico de código revertido, no prueba de main actual ni del servidor |
| 10/oct/2026 | Documentación de continuidad: enlaces relativos y `git diff --check` | Sin errores | Solo valida archivos/enlaces; no funcionamiento de backend o equipo |
| 11/oct/2026, 23:36, America/Mexico_City | main `ebed7ff`; `node --test tests/ui-responsive.test.cjs tests/ui-unificada.test.cjs tests/ui-inicio-kpis-reportes.test.cjs tests/ui-kpi-compact.test.cjs tests/ui-seguridad-analisis-distribucion.test.cjs backend/test/seguridad-sheets-mobile.test.js` | **26 aprobadas, 3 fallidas** | Pruebas locales/estructurales. Los tres fallos esperan versiones antiguas de cache busting (`sin-conexion`, `kpis-compact`, `mobile-operativo ...-b`) reemplazadas por versiones posteriores; la suite de main queda roja hasta actualizar/conciliar esas expectativas |
| 14/oct/2026 | PR #180–#189; archivos de prueba y validaciones aisladas descritos en cada PR; comandos completos no publicados | #181: 11; #182: 6; #183: 6; #184: 8; #185: 5; #186: 6; #187: 5 comprobaciones satisfactorias; #180/#188/#189 sin total publicado | Resultados declarados en las ramas/PR; no se volvieron a ejecutar y GitHub no acredita CI del main |
| 15/oct/2026 | PR #190, pruebas/sintaxis de columna Pago; comando completo no publicado | **18 comprobaciones pasaron** | Resultado declarado en el PR; sin ejecución nueva de esta revisión, MySQL ni C3 |
| 15/oct/2026 | PR #191, filtro Mes/Año, regresión de deuda/TAG/pagos y sintaxis; comando completo no publicado | **30 comprobaciones pasaron** | Resultado declarado en el PR; falta MySQL real y revisión visual de navegador/Safari |
| 17/oct/2026 | PR #192 antes de su integración final; suites de SMTP simulado, autenticación, login UI, prerregistro, solicitudes y permisos; comando no publicado | **76 pruebas aprobadas** | Resultado histórico de la rama; queda sustituido para el estado actual por la ejecución integrada de 112 pruebas del 18/oct |
| 17/oct/2026 | PR #193, pruebas dirigidas de adeudos, casa club, egresos, pagos, recargos, sesión y prorrateo; comando y totales no publicados | Reportadas como aprobadas; otros tests antiguos no validados por expectativas obsoletas o restricción de subprocesos | No acredita suite completa, migración, MySQL ni C3 |
| 17/oct/2026 | PR #194, `git diff --check` y comprobación estática de pestañas/CSS | Sin errores; tres pestañas y regla de tres columnas presentes | Solo valida el cambio de presentación; falta navegador real |
| 18/oct/2026 | PR #192, `DB_PORT=3306 node --test backend/test/recordar-sesion.test.js backend/test/auto-users*.test.js backend/test/telefono-cuenta.test.js backend/test/login-telefono-ui.test.js backend/test/registro-invitacion.test.js backend/test/auth-permissions.test.js backend/test/permissions.test.js backend/test/cuentas-ui.test.js backend/test/cuentas-verificacion.test.js backend/test/registro-smtp-diagnostico.test.js backend/test/cuotas-extraordinarias-casa-club-202610.test.js backend/test/casa-club.test.js backend/test/analisis-tres-conceptos.test.js backend/test/noticias-ui.test.js backend/test/noticias-locales.test.js`; además `DB_PORT=3306 node --test backend/test/sidebar-avisos-integrados.test.js` | **111 + 1 = 112 aprobadas** | DB/SMTP simulados; no prueba envío real, producción ni C3 |
| 18/oct/2026 | PR #195, `node backend/test/noticias-locales.test.js`, `node --check` y `git diff --check` | **3 pruebas pasaron**; sintaxis/diff sin errores | GDELT de siete días quedó después sustituido por FreeNewsApi en #196 |
| 18/oct/2026 | PR #196, desde backend `DB_PORT=3306 node --test test/noticias-locales.test.js test/noticias-locales-ruta.test.js`; sintaxis/diff | Todas pasaron; peticiones de prueba a FreeNewsApi devolvieron artículos recientes | No acredita conectividad desde Hostinger |
| 18/oct/2026 | PR #197, `DB_PORT=3306 node backend/test/trafico-teselas-ruta.test.js` y `... noticias-locales-ruta.test.js`; `node --check`/diff | **3 + 1 pruebas aprobadas**; sintaxis/diff sin errores | TomTom y noticias simulados; claves/visual real pendientes |
| 18/oct/2026 | PR #198–#202, comandos `DB_PORT=3306 node --test test/noticias-*.test.js test/incidencias-idioma.test.js test/trafico-teselas-ruta.test.js test/dashboard-operativo-roles.test.js` según cada PR; `node --check`/diff | #198: **5 archivos**; #199: **6**; #200: **4**; #201: **5**; #202: **5**, todos correctos | Proveedores simulados; falta despliegue y validación física Safari/iPhone/Android |
| 18/oct/2026 | PR #203, 11 archivos de Análisis/pagos/padrón + 3 de mantenimiento/C3/Casa club; comando exacto no publicado; `node --check`/diff | **14 archivos correctos**; sintaxis/diff sin errores | Dobles de prueba; falta MySQL real, despliegue y conciliación 231 |
| 18/oct/2026 | PR #204–#205, ocho suites seleccionadas/relevantes; comando exacto no publicado | **8 suites aprobadas** en cada PR; `zkteco-vigencias.test.js` conserva 2 fallos históricos | C3/MySQL simulados; no hubo escritura física |
| 18/oct/2026 | PR #206, seis archivos de test y `zkteco-vigencias.test.js`; comando exacto no publicado | Seis archivos pasan; vigencias **7/9**, con los mismos 2 fallos históricos | Auditoría documental; no E2E físico |
| 18/oct/2026 | PR #207, `git diff --check`, conteo de secciones/flujos y verificación de enlaces Markdown | Sin errores; **24 secciones, 6 flujos**, enlaces válidos | Solo documentación; no prueba código, DB, Hostinger o C3 |
| 19/oct/2026 | PR #208, `node tests/date-display.test.cjs`; `node --check`; sintaxis embebida en 24 páginas; `git diff --check` | **7/7 aprobadas**; sintaxis/diff correctos | Solo presentación; suites UI heredadas conservan expectativas obsoletas |
| 19/oct/2026 | PR #209, `node --test backend/test/historial-pagos-vivienda.test.js backend/test/pagos-manuales-analisis.test.js backend/test/analisis-columna-pago.test.js backend/test/analisis-tags-zkteco.test.js`; sintaxis/diff | **4 archivos pasan** | No prueba Hostinger, MySQL ni C3 |
| 19/oct/2026 | PR #210, `DB_PORT=3306 node --test --test-reporter=tap backend/test/casa-club.test.js backend/test/zkteco-adeudos.test.js backend/test/elegibilidad-casa-club.test.js backend/test/analisis-tres-conceptos.test.js backend/test/pagos-manuales-analisis.test.js backend/test/historial-pagos-vivienda.test.js`; sintaxis/diff | **6 archivos aprobados** | DB/C3 simulados; política física pendiente |
| 19/oct/2026 | PR #211–#214, pruebas dirigidas de `analisis-columna-pago`, elegibilidad, historial, sintaxis y diff según cada PR | #211: **2 archivos**; #212–#214: prueba dirigida correcta en cada uno | Cambios de UI; no datos, SQL ni C3 |
| 19/oct/2026 | PR #215, suites de Auto-users, residentes, búsqueda, viviendas y permisos; comando exacto no publicado | **84 pruebas aprobadas**; sintaxis/diff correctos | DB/SMTP simulados; CSV del usuario es evidencia separada |
| 19/oct/2026 | PR #216, suites de altas/correcciones y SQL generado sin `direccion_id`; comando exacto no publicado | **85 pruebas aprobadas**; sintaxis/diff correctos; cero referencias en `backend/src` | Scripts 01/02 no ejecutados por el PR en MySQL real |
| 19/oct/2026 | PR #217, siete suites relacionadas, generación PDF en memoria, comparación visual y `git diff --check` | **7 suites aprobadas**; PDF comparado con ejemplo | No modifica pagos/datos; envío por WhatsApp es manual |
| 19/oct/2026 | PR #218, siete archivos dirigidos, `node --check`, diff, render PDF y Excel sintético | **7 archivos aprobados**; PDF con logo; Excel probado con 232 filas sintéticas | Suite estructural amplia aún falla por caché/markup antiguo; sin producción |
| 19/oct/2026 | PR #219, seis suites dirigidas de Análisis/recibos, `node --check` y diff | **6 suites aprobadas** | `analisis-tags-compacto` conserva 2 expectativas obsoletas; falta visual real |
| 20/oct/2026 | PR #220, pruebas añadidas para `cd backend && node --test test/noticias-locales.test.js test/noticias-locales-ruta.test.js test/noticias-ui.test.js`; análisis estático | **No se ejecutó Node ni prueba visual** en esa entrega; sintaxis/reglas revisadas | Presencia en main sin resultado automatizado ejecutado |
| 20/oct/2026 | PR #221, desde backend `DB_PORT=3306 node --test test/auto-users.test.js test/auto-users-ui.test.js test/auto-users-routes.test.js`; sintaxis/diff | **41 aprobadas** | DB/SMTP simulados; sin producción |
| 20/oct/2026 | PR #222, pruebas nuevas de cuota/editor/noticias y validaciones locales; comando/total exactos no publicados | Casos de tarifa y sintaxis reportados correctos | Migración no ejecutada; AGENTS.md aún fija $300 |
| 20/oct/2026 | PR #223, `auth-permissions`, `dashboard-operativo-roles`, `security-navigation` y `app-shell-navigation`; sintaxis/diff | **7 + 9 + 3 + 3 = 22 aprobadas** | Sin MySQL real ni navegador físico |
| 20/oct/2026 | PR #224, desde backend `DB_PORT=3306 node --test test/auto-users.test.js test/auto-users-routes.test.js test/auto-users-admin-trials.test.js test/auto-users-email.test.js`; sintaxis/diff | **35 aprobadas** | DB/SMTP simulados; la recepción real confirmada por el usuario es evidencia separada |
| 20/oct/2026 | PR #225, `DB_PORT=3306 node --test backend/test/noticias-imagenes-zmg.test.js backend/test/noticias-locales-ruta.test.js backend/test/noticias-ui.test.js backend/test/noticias-locales.test.js`; `node --check` | **4 archivos aprobados**; nota real devolvió imagen 300×169, HTTP 200 | Proveedor público probado; Hostinger/CSP/CDN pendientes |
| 20/oct/2026 | PR #226–#227, suites `app-shell-navigation`, `ui-kpi-compact`, `ui-inicio-kpis-reportes`; sintaxis/diff | #226: **4/4 + 4/4 + 3/3**; #227: **5/5 + 3/3 + 4/4** | #226 conserva un fallo heredado en `ui-responsive` por etiqueta antigua |
| 20/oct/2026 | PR #228, `DB_PORT=3306 node --test backend/test/noticias-ui.test.js backend/test/noticias-locales.test.js backend/test/noticias-locales-ruta.test.js`; sintaxis/diff | **3/3 archivos correctos** | Falta visual/despliegue real |
| 20/oct/2026 | PR #229, `DB_PORT=3306 node --test backend/test/login-telefono-ui.test.js backend/test/auto-users-login.test.js backend/test/recordar-sesion.test.js backend/test/auto-users-routes.test.js backend/test/auto-users-ui.test.js backend/test/auto-users.test.js backend/test/auth-permissions.test.js backend/test/cuentas-verificacion.test.js`; sintaxis/diff | **76 aprobadas** | DB/SMTP simulados; sin producción |
| 20/oct/2026 | PR #230, `node --test tests/app-shell-navigation.test.cjs backend/test/login-telefono-ui.test.js`; sintaxis/diff | **11 aprobadas** | Simulación DOM; usuario confirmó scroll real por separado |
| 21/oct/2026 | PR #231 ya fusionado, `node --test tests/app-shell-navigation.test.cjs backend/test/login-telefono-ui.test.js`; sintaxis/diff | **17 aprobadas** según la versión final del PR | DOM/gestos simulados; el usuario reportó después que el gesto seguía sin funcionar físicamente |
| 21/oct/2026 | PR #232–#237, comprobaciones estáticas/sintaxis y DOM según cada PR | #235: **11/11**; #236: **11/11**; #237: **12/12**; #234 sintético; #232–#233 sin total publicado | Cambios visuales de modales/cabecera; falta navegador real |
| 21/oct/2026 | PR #238, `node --test backend/test/noticias-imagenes-medios.test.js backend/test/noticias-ui.test.js backend/test/noticias-locales-ruta.test.js` | Pruebas añadidas, **no ejecutadas** en esa entrega; sintaxis/estructura revisadas | Requiere backend/frontend desplegados y validación de medios reales |
| 21/oct/2026 | PR #239, `node --test tests/app-shell-navigation.test.cjs`; `node --check`; `git diff --check` | **20/20 aprobadas**; sintaxis/diff sin errores | Simulación; sin teléfono físico |
| 21/oct/2026 | PR #240, `DB_PORT=3306 node --test backend/test/analisis-pagos-fechas.test.js backend/test/historial-pagos-vivienda.test.js backend/test/analisis-tres-conceptos.test.js` | **26 aprobadas** | Código luego sustituido por #241; DB simulada |
| 21/oct/2026 | PR #241, `DB_PORT=3306 node --test backend/test/analisis-ultimo-registro-orden.test.js backend/test/analisis-tres-conceptos.test.js backend/test/historial-pagos-vivienda.test.js` | **25 aprobadas** | DB/DOM simulados; #244 oculta después la columna, conserva el orden |
| 21/oct/2026 | PR #242–#244, pruebas dirigidas y verificaciones estáticas descritas en cada PR | #242 añadió casos de horas/orden y TAGs, pero dejó suite completa pendiente; #243 simuló tarifa especial sin MySQL; #244: **9 verificaciones** | Sin CI, producción, C3 ni prueba visual |
| 21/oct/2026 | PR #245–#246, simulaciones de servicios/worker y regresiones añadidas | Casos anuales/historial y cinco escenarios C3 reportados correctos; **no se ejecutó suite Node completa** | Sin MySQL/C3 reales; #246 puede reducir fechas físicas y requiere conciliación de regla y prueba controlada |
| 22/oct/2026 | PR #247–#253, generador Excel/ChartML y `backend/test/analisis-excel-dashboard.test.js` | Sintaxis y simulaciones en memoria reportadas correctas; #250/#252: **6 hojas y 5 gráficas** sin etiquetas problemáticas; suite Node completa no acreditada | #249/#251 causaron reparación en Excel según evidencia del PR; #252 es la corrección vigente, pendiente de prueba final de escritorio |
| 22/oct/2026 | PR #254–#256, tests de descarga y recibos por movimiento | #254/#255: comprobaciones de patrones, ejecución Node pendiente; #256: casos lógicos aislados correctos, tests agregados pero no ejecutados como suite | Sin navegador, MySQL ni producción |
| 22/oct/2026 | PR #257–#259, conciliación Outlook→Gmail→IMAP genérico | #257: **5** verificaciones aisladas; #258: **6**; #259: **7** | #257/#258 quedaron sustituidos por #259; mensajes sintéticos, sin buzón ni DB/C3 reales |
| 22/oct/2026 | PR #260–#262, refresco/UI y validación exclusivamente bancaria | #260: **3** pruebas aisladas; #261: **10** comprobaciones estáticas + **2** regresiones; #262: **4/4** | Sin navegador real; #261 cambia el flujo operativo y requiere backend/IMAP funcional |
| 22/oct/2026 | PR #263, pruebas de TomTom y diagnóstico seguro | **3/3 aprobadas** | Aisladas; API TomTom y variables Hostinger no verificadas |
| 22/oct/2026 | PR #264, `PAGOS_IMAP_AUTH_SERVER=mx.hostinger.com node --test backend/test/diagnostico-buzon-pagos.test.js backend/test/validacion-pagos-correo.test.js`; sintaxis/diff | **11 aprobadas** | El servidor de autenticación es fixture; sin buzón, DB ni C3 reales |
| 22/oct/2026 | PR #265, `PAGOS_IMAP_AUTH_SERVER=mx.hostinger.com node --test backend/test/validacion-pagos-reenvio-admin.test.js backend/test/diagnostico-buzon-pagos.test.js backend/test/validacion-pagos-correo.test.js`; sintaxis/diff | **21 aprobadas** | Reenvío/worker simulados; no confirma despliegue ni aprobación real |
| 22/oct/2026 | PR #266, mismo grupo más `banco-correo-monto-tablas.test.js` | **28 aprobadas**; cuatro regresiones fallaban en main anterior | Ya está en main, pero usa datos sintéticos y no prueba buzón/MySQL/C3 reales |
| 23/oct/2026 | PR #267–#269, validaciones estáticas de modal/controles y caso sintético | Selectores, listeners y aislamiento de TEST-001 reportados correctos; sin suite integrada publicada | UI/SQL de prueba; sin navegador ni DB/C3 reales |
| 23/oct/2026 | PR #270, desde backend `node --test test/http-body-parser.test.js`; instalación limpia y `npm ls` | **7/7 aprobadas**; body-parser 2.4.0; cuerpos comprimidos rechazados y proceso sano | Backend local con rutas/DB sustituidas; falta redeploy |
| 23/oct/2026 | PR #271–#274, regresiones iOS/fecha SPEI/selector | Sintaxis y funciones aisladas reportadas correctas; tests Node agregados pero ejecución completa no acreditada | #271 fue corregido por #274; falta Safari/Hostinger |
| 23/oct/2026 | PR #275–#282, identificadores, trazabilidad y diagnóstico Titan | #276: **9 escenarios** funcionales; #279: **7 simulados**; #281: **6 simulados**; demás parsers/DOM reportados correctos sin suite completa | Evidencia sintética y diagnóstica; no acredita buzón, MySQL ni recepción del dinero |
| 23/oct/2026 | PR #283 abierto, pruebas dirigidas de autenticación/fecha | **26/26 dirigidas**; tres suites históricas mantienen **7 fallos** (19/26) tanto en base como en la rama | No está en main y su política fue sustituida por #284 |
| 23/oct/2026 | PR #284, pruebas de remitente exacto sin DKIM/DMARC | **8/8 aprobadas**; sintaxis/diff correctos | Política deliberadamente falsificable; sin buzón/MySQL/C3 reales |
| 23/oct/2026 | PR #285–#287, funciones y tests de TEST-001 | Deuda/acreditación/incremento simulados correctos; tests Node agregados, ejecución con dependencias/DB/IMAP/C3 pendiente | Excepción sintética, no solución general; #287 cambia temporalmente totales de Análisis |
| 24/oct/2026 | PR #288; pruebas dirigidas de cálculo/reporte/confirmación y selección ampliada | **20/20 nuevas**; selección **112/119**, con los mismos siete fallos heredados que la base (**92/99**) | SQL/TCP simulados; sin MySQL, IMAP o C3 reales |
| 24/oct/2026 | PR #289; pruebas dirigidas de corte consecutivo y selección ampliada | **45/45 dirigidas**; selección **123/130**, con siete fallos heredados igual que la base (**112/119**) | Persistencia/TCP simulados; no acredita suite global, despliegue ni hardware |
| 24/oct/2026 | PR #290, workflow `Verificar finanzas`; `node --test backend/tests/adeudos-enero-saldo-favor-exencion.test.js ...` y sintaxis JS; [Actions 40109657022](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/40109657022) | Job y pasos obligatorios **success**; PR declara **30/30** obligatorias. Suite ampliada **77/84**, con siete fallos bancarios heredados; comparación de base **66/74**, con esos siete y una expectativa HTML obsoleta | CI sintético con credenciales falsas y diagnóstico heredado no bloqueante; sin DB/buzón/C3 reales |
| 24/oct/2026 | PR #291–#293, mismo workflow financiero/sintaxis; [runs 40110902436](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/40110902436), [40111488434](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/40111488434) y [40112484067](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/40112484067) | Los tres jobs concluyeron **success**. Además, #291 verificó cinco formatos, #292 cinco escenarios UI y #293 once comprobaciones de código | #291–#293 son presentación/estado visual; no prueban navegador físico, API desplegada ni persistencia real |
| 25/oct/2026 | PR #294; `node --test backend/test/seguridad-cuotas-consistencia.test.js` y filtro `cuotas de seguridad|rutas de seguridad` sobre `seguridad-sheets-mobile.test.js`; workflow [40168871351](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/40168871351) | Job `Verificar finanzas` y ambas regresiones obligatorias **success**; también pasaron sintaxis y la batería financiera obligatoria. La UI heredada y suite bancaria continúan como diagnósticos con `continue-on-error` | Fixtures/simulaciones: cubre Atotonilco 752, tarifas, exenciones, anticipos, parcialidad y ausencia de PII; no prueba MySQL, despliegue ni C3 reales |
| 26/oct/2026 | PR #295, workflow [40421185686](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/40421185686) | **Failure** en «Pruebas financieras y de integración sintética TEST-001»; sintaxis e instalación pasaron, pasos posteriores quedaron omitidos | El test estático de avisos en tiempo real no quedó acreditado por ese run. Cambios posteriores integrados tuvieron CI verde, pero falta aceptación real del refresco/burbuja |
| 26/oct/2026 | PR #296–#297; comprobación DOM de contraseñas; suites Auto-users/invitaciones/permisos y workflow [40425576848](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/40425576848) | #296 alternó ambos campos cuatro veces sin requests. #297: **76/76** Auto-users, **37/37** finanzas/Seguridad, **2/2** rutas y **17/17** parser/OCR; Actions **success** | DOM, MySQL y SMTP simulados; sin creación/envío/aceptación real del alta individual |
| 26/oct/2026 | PR #298–#300; parser/doble lectura/lector, concepto opcional y workflows [40424787500](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/40424787500), [40427610352](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/40427610352), [40429497710](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/40429497710) | Tres jobs **success**. #299: **22/22** parser/doble lectura, **4/4** lector y **37/37** finanzas/Seguridad. #300: **88/88** backend/tests, **8/8** remitente y **49/49** finanzas/Seguridad/permisos; regresión amplia conserva **39/43** con cuatro fallos previos | OCR real del servicio se ejecutó localmente sobre una imagen privada sin publicarla; sin Safari/Hostinger, MySQL, buzón o C3 reales |
| 26/oct/2026 | PR #301–#302; `node --test backend/test/pagos-reintento-validacion.test.js backend/test/pagos-relectura-ocr.test.js`; workflows [40431880701](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/40431880701) y [40433983445](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/40433983445) | Ambos jobs y el paso obligatorio de reintento/relectura concluyeron **success** | DB, OCR y Titan simulados; no acredita reintento real ni despliegue |
| 26/oct/2026 | PR #303; pruebas de reparto servicio/reporte/UI; workflow [40434611672](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/40434611672) | **125/125** grupo nuevo/integrado y job **success**; grupo ampliado conserva las mismas seis fallas antiguas en base y rama (**62/68**) | OCR/almacenamiento/PDF/C3 simulados; sin depósito, MySQL, buzón o escritura física |
| 26/oct/2026 | PR #304; workflow [40436655252](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/40436655252), incluido `comprobantes-candidatos-bancarios.test.js` y regresión del ID numérico | Job **success**; pasaron reintento, reparto, concepto libre, extracción OCR, finanzas y Seguridad. Suites heredadas permanecen diagnósticas | Cubre el 404 y casos multi-banco sintéticos; no prueba el comprobante rechazado ni Titan real |
| 27/oct/2026 | PR #305; pruebas locales de reparto y workflow [40598808015](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/40598808015) | **15/15** pruebas locales de reparto; job **success**, incluidos reparto, reintento, concepto, OCR, finanzas y Seguridad | Cubre cuentas sintéticas con dos viviendas; DB/OCR simulados, sin datos, depósito ni despliegue real |
| 27/oct/2026 | PR #306; regresiones de abonos y workflow [40601173808](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/40601173808) | Pasaron cuatro casos nuevos ($0.01, varios recargos, HTTP $20 y secuencia $20+$30+$300), reparto/UI **15/15** y el paso obligatorio de abonos; job **success**. Un grupo amplio quedó **124/125** por una expectativa heredada del parser, además de fallos antiguos enero/septiembre y pagos/C3 en otras selecciones | Almacenamiento, TCP y C3 simulados; no prueba MySQL, buzón, depósito, cobertura física ni despliegue |
| 27/oct/2026 | PR #307, solo documentación; `git diff --check` | Sin errores; no hubo workflow de Actions por el alcance documental | Fija la regla en AGENTS.md, pero no implementa abonos arbitrarios en extraordinarias o casa club |
| 29/oct/2026 | PR #308–#317; workflows **Verificar finanzas** [40908504070](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/40908504070) a [40971893271](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/40971893271) | **10/10 jobs success**; sintaxis y pasos obligatorios de reintento, abonos, reparto, conciliación, OCR, finanzas y Seguridad concluyeron success | Checks sobre heads/merge de PR; no prueban despliegue, navegador físico, MySQL, Casa Club o C3 reales |
| 29/oct/2026 | PR #317; `NODE_PATH=backend/node_modules node --test backend/tests/*.test.js` en head y comparación con main | **87 aprobadas, 1 fallida** en ambos; falla «si falta identificador devuelve campos necesarios para modal» | Paso diagnóstico con `continue-on-error`; el job verde no equivale a suite heredada totalmente verde |
| 29/oct/2026 | Validaciones declaradas en PR #308–#317 | #310: 7; #311: 11; #312: 10; #313: 12; #314: 11 comprobaciones estáticas; #315/#317 sintaxis y diff. #308/#309/#316 añadieron casos pero declararon ejecución local pendiente | Evidencia de rama y CI general; falta ejecutar explícitamente todos los nuevos archivos sobre main y validar visualmente |
| 31/oct/2026 | PR #318–#319; workflows [41224628335](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/41224628335) y [41225307370](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/41225307370) | Ambos jobs **success**; pasaron sintaxis y pasos obligatorios de finanzas/Seguridad, incluido el código de visibilidad | Filtros con datos simulados; no acreditan conteo 231, MySQL/Hostinger ni ausencia visual tras despliegue |
| 31/oct/2026 | PR #320–#322; workflows [41226536407](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/41226536407), [41227049882](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/41227049882) y [41264705409](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/41264705409); en el último: `node --test backend/test/zkteco-diagnostico-conexion.test.js`, `node --test backend/test/zkteco-address-filter.test.js backend/test/zkteco-autosync.test.js` y `node --test backend/test/zkteco-calle-libre.test.js` | **3/3 jobs success**; diagnóstico **7/7**, resiliencia/búsqueda **9/9**, campo libre **2/2**. Diagnósticos no bloqueantes: UI heredada **4/6** y bancaria **87/88** | Clientes, sockets y DOM simulados; no prueba Hostinger, router, IP/DDNS, MySQL ni C3 físico |
| 2/nov/2026 | PR #323–#333; workflows [41479188352](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/41479188352) a [41568172055](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/41568172055) | **11/11 jobs success** en el workflow existente. El run final conservó diagnóstico UI **4/6** y bancario **87/88**; los fallos coinciden con las expectativas heredadas ya registradas | El workflow no contiene pasos para los nuevos archivos de reversión, Drive, recibos, reportes, Picker o ajustes; job verde no acredita esas suites |
| 2/nov/2026 | Validaciones declaradas por #324, #326, #328, #331–#333 | #324 simuló clics de Borrar/ZIP/Drive; #326 reportó **4/4** variantes con mismo folio y $600; #328 obtuvo $1,100 acumulado en memoria; #332 reportó **PASS** con $2,400 noviembre/$1,500 diciembre/$3,900 caja. Los demás declaran sintaxis/casos añadidos sin total ejecutado publicado | Evidencia local/de rama; no sustituye ejecutar `finanzas-botones-respaldos.test.js`, `drive-recibos-2026.test.js`, `recibo-mantenimiento-analisis.test.js`, `finanzas-ingresos-calles-egresos-conceptos.test.js`, `analisis-picker-paginacion.test.js` y `ajustes-egresos-mensuales.test.js` en main |
| 3/nov/2026 | PR #334–#347; workflows [41664324384](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/41664324384) a [41740068734](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/41740068734) | **14/14 jobs success** | Cada head pasó el workflow disponible al momento; los previews de Hostinger pertenecen a ramas y no prueban despliegue de main ni funcionamiento |
| 3/nov/2026 | Run #347: `node --test backend/test/proyectos-presupuesto.test.js backend/test/proyectos-cuotas-version.test.js backend/test/proyectos-cero-edicion.test.js`; patrón de tarifa cero; `node --test backend/test/analisis-seleccion-proyectos.test.js` | **20/20**, **1/1** y **5/5**. Diagnósticos no bloqueantes: UI **4/6**, bancaria **87/88**, esta última igual en main | Pruebas estructurales/servicios con entorno simulado; no ejecutan MySQL, navegador, Drive, Hostinger o C3 real. Varias suites añadidas por #334–#344 siguen fuera del workflow |
| 4/nov/2026 | Heads #348–#350; workflows [41844009015](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/41844009015), [41845023807](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/41845023807) y [41885015371](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/41885015371) | **3/3 jobs success** | Los heads #351–#353 devuelven cero workflow runs y cero estados combinados; sus archivos de prueba no cuentan como ejecución CI |
| 4/nov/2026 | Run #350: `node --test backend/test/finanzas-proyectos-correo-live.test.js`; `node --test backend/test/mj-gmail-smtp-aislado.test.js`; `node --test backend/test/proyectos-pendientes-correo-editable.test.js` y repetición de la primera suite | **8/8**, **3/3**, **7/7** y **8/8**. Diagnósticos no bloqueantes: UI **4/6**, bancaria **87/88**, igual en main | SMTP, DOM, libros y sincronización simulados; no prueban entrega Gmail, Excel real, Hostinger, MySQL o C3. `recibos-correo-proyecto-id.test.js`, `pagos-c3-anulados-no-bloquean.test.js` y `recibos-contactos-guardados.test.js` están en main pero sin run recuperable |

Los dos fallos están en `backend/test/zkteco-vigencias.test.js`:

- `manual date edit persists without queueing the old maintenance cutoff`.
- `editing a house association never queues an old SQL cutoff`.

En ambos casos el C3 simulado conservó EndTime `20260910`, cuando se esperaba
`20261110`. Falta investigar código y preparación de la prueba; no se corrigió
al añadir documentación. Conservar estos resultados hasta una ejecución nueva
que explique y confirme su resolución.

GitHub no devolvió estados de commit para #295–#307 ni workflow runs en sus commits
de merge. En los heads: #295 tuvo un run fallido; #296 no activó el workflow; #297–#306
tuvieron diez ejecuciones exitosas; #307, solo documental, no activó Actions. El run
verde de #297 integró cambios anteriores, y los runs de #305/#306 verifican sus
regresiones sintéticas, pero ninguno sustituye la aceptación en navegador ni el
despliegue. La UI heredada, la suite bancaria y la comparación con main
siguen como pasos diagnósticos con `continue-on-error`; por ello no convierten fallos
históricos en aprobados. Se conservan los fallos de ZKTeco/pagos documentados hasta
una ejecución específica que los resuelva. No se probaron MySQL, C3, buzón, Hostinger
o Dahua reales.

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
| Portal instalable y botón Android | Publicar frontend por HTTPS y probar en Chrome Android y Safari/iPhone físicos: instalación, icono, apertura standalone, login, navegación por rol y selección de comprobante. Confirmar que el botón aparece solo con `beforeinstallprompt`; la vista previa cerrada no acredita producción |
| Piloto de comprobantes por WhatsApp | En base y número de prueba: ejecutar `backend/sql/whatsapp_comprobantes.sql`, configurar variables `WHATSAPP_*` sin publicar secretos, registrar callback HTTPS y validar firma, formatos, límite, deduplicación, roles y descarga. Antes de producción definir retención, vínculo número-vivienda, OCR/registro bancario, acuse e interfaz; mantenerlo desactivado hasta cerrar estas pruebas |
| Conectividad C3, IP pública y recuperación | Desplegar #320–#322 y ejecutar Diagnosticar C3 desde el servidor. Confirmar etapa/código sin publicar IP o secretos; revisar IP pública/DDNS, NAT/port-forwarding TCP y contraseña. El reintento de #321 no corrige una IP cambiada. No existe en main actualización automática basada en la IP del navegador del administrador; diseñarla solo con autenticación fuerte, verificación C3 inequívoca, auditoría y rollback |
| Dos pruebas históricas fallidas de edición de TAG | PR #205 restauró la conducta manual solicitada, pero `zkteco-vigencias.test.js` sigue 7/9 por expectativas antiguas de `editTag`. Diagnosticar, acordar el comportamiento esperado y repetir sin ocultar SQL/C3 divergentes |
| Tres regresiones estructurales posteriores a los PR #138–#141 | Repetir la suite actual y confirmar si las expectativas antiguas de assets siguen fallando o ya fueron sustituidas; no declarar main verde sin ejecución nueva |
| CI y regresiones históricas | #348–#350 tienen tres workflows exitosos; #351–#353 carecen de runs/estados. El run #350 pasa suites nuevas 8/8, 3/3, 7/7 y 8/8, pero conserva UI 4/6 y bancaria 87/88 como diagnósticos. Ejecutar las tres pruebas de proyectoId, C3 anulado y contactos guardados, además de suites anteriores aún omitidas; no declarar todo verde por `continue-on-error` |
| Auto-users por SMTP | La prueba individual anterior recibió correo. #297 añade alta individual sin envío automático. Falta desplegar y probar con una vivienda controlada: creación idempotente, invitación separada, enlace en incógnito, aceptación completa, reintento SMTP, duplicados y conservación del residente anterior |
| Migración de cobranza por concepto | Respaldar DB, revisar y ejecutar manualmente `backend/sql/2026-10-18-cuotas-extraordinarias-casa-club.sql` primero en prueba; después correr consultas diagnósticas. No desplegar backend/frontend nuevo antes del esquema |
| Padrón y relaciones condómino-vivienda | El CSV reporta 188 pares copiados sin faltantes y #318–#319 dejan en código el objetivo operativo de 231 al ocultar TEST-001/002. Falta desplegar, revisar respaldos/bitácora, confirmar 231 en MySQL desde otra conexión y verificar que casas reales, relaciones e indicadores financieros no se ocultaron ni alteraron |
| Casa club y tres conceptos | #315 permite reserva directa administrativa, pero falta probar con MySQL controlado roles, spoofing, colisión, cargos, plazo y que APROBADA siga impaga. #340 ya acepta aportaciones positivas repetibles para proyectos extraordinarios sin liquidar ni tocar C3; adaptar Casa Club con el mismo principio conservando saldo, reserva y verificación bancaria |
| Proyectos extraordinarios por vivienda | Respaldar y probar en clon MySQL antes de desplegar #339–#350. Confirmar migración, 231 viviendas, aportaciones, presupuesto/excepciones, 409, cuota cero/No aplica, recibos/anulación y que saldo cero no genere aviso. Abrir los cuatro libros de #348 en Excel y cotejar tablero por proyecto. No importar archivos privados hasta resolver la diferencia agregada y confirmar tarifas inferidas; previews no equivalen a main desplegado |
| Inicio por rol | Validar con cuentas reales de administrador, Seguridad y Condómino (una y varias viviendas): alcance de listas, ausencia de finanzas en no administradores y ausencia de datos de casas ajenas |
| Adeudo acumulado, anticipos y advertencias TAG | Cotejar contra MySQL una casa al corriente, parcial, morosa y con anticipo 2027; confirmar que Último mes pagado muestra el período real sin sumar deuda futura. Abrir modal en casas con 0/1/varios TAGs y confirmar C3 bajo demanda sin escrituras |
| Paridad Seguridad–Análisis | Desplegar #294 y cotejar en MySQL controlado Atotonilco 752 y otras viviendas con tarifa especial, exención, anticipo, abono parcial y pendientes antiguos. Confirmar mismo estado/adeudo en ambas vistas y ausencia de PII; no cambiar registros para forzar el resultado |
| Portal móvil y navegación | El scroll fue confirmado y el primer refresco de #231 fue reportado sin efecto. Desplegar #239 y #309–#314; validar en Safari/iPhone/Android las cuadrículas 2×2, Pago anual, gráficas/desplegables de 46 px, KPI, caché, modales, navegación y descargas. Los checks estáticos no sustituyen revisión visual |
| Anulación de pagos y reversión C3 | Antes de usar #323–#324/#336: respaldo, clon MySQL, MJMAN e histórico elegible, vista previa, doble confirmación, concurrencia y auditoría. Para #344 probar una aportación extraordinaria sin banco y el rechazo de una conciliada. Verificar COMPLETADO y lectura física de TAGs; no asumir que una orden en cola restauró C3 |
| Respaldos Google Drive | Configurar OAuth/Picker sin publicar secretos, autorizar la carpeta existente y probar lotes, actualización, cancelación/errores, ZIP/Excel/PDF de mantenimiento. Añadir pruebas #341 de recibos -P, ZIP y carpetas por proyecto/año sin mezclar Excel ni duplicar reintentos. Confirmar #331 al frente; no borrar PDF antiguos con folios distintos sin revisión |
| SMTP de recibos y contactos guardados | Configurar únicamente `MJ_GMAIL_SMTP_*` en Hostinger sin tocar `SMTP_*`; desplegar #348–#353 frontend/backend, probar una cuenta controlada, entrega/adjunto/remitente, errores 503, límite de 60 s y destinatario alternativo. Verificar que Guardar teléfono/correo exige ADMIN, actualiza solo una columna de la vivienda y nunca expone ni modifica cuentas vinculadas |
| Cuota bloqueada por evento C3 anulado | Respaldar y desplegar #352. Repetir SELECT de solo lectura; confirmar que cuota siga pendiente y evento siga ANULADO. Cotizar sin bloqueo por ese evento y registrar únicamente si administración comprobó pago e importe. El movimiento nuevo debe ser independiente; no reactivar el anulado ni inferir que C3 físico cambió |
| Sincronización de Finanzas entre sesiones | Desplegar #348 y probar dos sesiones/instancias: revisión en memoria sin consultas MySQL cada 20 s, recarga sin interrumpir modales y respaldo multi-proceso. Medir conexiones frente al límite del hosting; no describirla como tiempo real garantizado |
| Reportes financieros por calle/concepto | Desplegar #327–#332/#337 y cotejar calles y las nueve categorías contra MySQL. Verificar Gardenias $2,400 como cuotas cubiertas y separar $3,900 de caja; revisar PROYECTO frente al legado PROYECTOS, permiso ALTER del ENUM, modales, mensual/anual, Excel y caché sin alterar filas |
| Ajuste mensual de egresos | Ejecutar `ajustes-egresos-mensuales.test.js` y probar #333 en respaldo/clon: ajuste negativo/positivo, alias históricos, ediciones sucesivas, 409 por concurrencia, SERIALIZABLE/FOR UPDATE, folio/auditoría y actualización de reportes. No editar totales reales hasta confirmar rollback operativo |
| Mis recibos, refresco y reintento | Desplegar #295, #301–#304, #308/#316/#317, #341 y #348–#353 en frontend/backend. Validar refresco OCR→Titan, importes/folios MJ y -P, descarga/WhatsApp/correo, proyectoId, rol, límite de reenvío, CSP, contactos de una operación frente a persistidos y ausencia de confirmación falsa cuando SMTP falla |
| TomTom | Desplegar #263 y probar incidencias reales en español con la llave del proyecto; distinguir un HTTP 400 anterior de una respuesta válida con los campos consumidos por la UI |
| Body-parser y dependencias | Redesplegar backend desde el lock de #270, confirmar rechazo 415 de gzip/deflate/Brotli y ejecutar smoke de login/pagos. Revisar por separado los cinco avisos restantes de npm audit sin aplicar `audit fix --force` a ciegas |
| Retiro operativo de TEST-001/002 | #318–#319 ya revierten la excepción temporal y ocultan ambas viviendas sintéticas en lecturas, sin borrar historial. Falta desplegar y verificar Análisis, Seguridad, Casas, Residentes, Auto-users y ZKTeco; no ejecutar DELETE ni tocar `zk_tarjetas` para forzar el conteo |
| Despliegue de unificación Pagos–Análisis–C3 | #288–#290 y #306 ya están en main. Respaldar, aplicar/verificar la migración aditiva, desplegar backend/frontend compatibles y probar una vivienda con y sin TAG, incluido un abono menor al recargo. Confirmar persistencia ante fallo C3, idempotencia, saldo común y que la cobertura solo avance al completar principal |
| Reparto de depósito entre viviendas | Desplegar juntos frontend/backend de #303/#305/#306 y probar una cuenta con dos o más vínculos: suma exacta en centavos, abono positivo inferior al recargo, cero para casa excluida, cambio de tarifa/vínculo, rollback total, privacidad, historial por casa y C3 solo después del commit y de completar principal. No usar depósito real hasta validar en clon |
| OCR móvil y formatos multi-banco | Probar #298–#304 en Safari/Android y backend Hostinger con comprobantes controlados de varios bancos. Confirmar doble lectura sin mezclar pases contradictorios, exclusión de cuenta/comisión/saldo, importe exacto, candidato identificador y mensaje de error preciso; no acreditar solo por OCR |
| Monitor automático de adeudos | Mantener apagado hasta respaldo/cotejo, piloto autorizado, padrón exacto, dry-run y lectura física. Probar que solo mantenimiento bloquea TAGs, que extraordinarias/Casa club no escriben C3, reactivación manual y ausencia de desbloqueo automático al saldar |
| Manual integral de aceptación | Ejecutar y registrar los 24 apartados A01–A24, seis FTI y casos Z01–Z18 del manual raíz; el merge documental no los da por superados |
| Noticias y tráfico | Desplegar frontend/backend y comprobar fotos de fondo, fallback sin imagen, Tráfico ZMG, proxy/CSP/CDN, buscador, orden por fecha y estados de error con fuente real en móvil/escritorio |
| Cámaras Dahua y pluma | Para video falta gateway RTSP→HLS privado y configuración Hostinger. Para pluma, coordinar prueba física; ORDEN ENVIADA no confirma posición |
| Guadalajara 707 / Valle de México 3614 | Verificar en producción que filtros, paginación, ZKTeco y conmutador oculten solo los domicilios previstos; los registros siguen en MySQL y requieren conciliación separada si contienen relaciones |
| Finanzas históricas y saldo inicial | Confirmar que producción usa el esquema esperado, que existen las tablas/asientos requeridos y cotejar API Inicio/Análisis con MySQL sin doble conteo; las cifras de los PR son valores esperados, no verificación de esta revisión |
| Google Sheets histórico | Ejecutar migración opcional solo al decidir activarlo, configurar credenciales/rangos en backend y validar lectura/staging con una hoja y MySQL de prueba; acordar conciliación antes de afectar contabilidad oficial |
| 27 viviendas del padrón sin TAG | Confirmar entrega/posesión y asociación; nueva consulta/exportación tras ajustes |
| Tres pares con fusión reportada | Confirmar COMMIT y persistencia desde otra conexión; verificar respaldo y modo seguro. No dar por cerrado a partir de la frase del usuario o del resumen de una captura |
| Cinco registros fuera del padrón aún pendientes + vivienda marcada inexistente | Identificar destinos y conservar referencias. La conversación reporta cuotas/historial en tres y un residente/permiso en otro; falta revisar evidencia original antes de actuar |
| Correspondencia descartada en el cotejo posterior | Residentes distintos según la conversación; no trasladar automáticamente al destino inicialmente propuesto |
| Nueve TAGs y discrepancia CSV | Ejecutar la consulta entregada el 19/oct, aportar CSV y confirmar vivienda correcta por TAG; tener `casa_id` no demuestra por sí solo que la asociación sea correcta |
| Asociación previa de 35 TAGs a 20 viviendas | Confirmación del COMMIT no documentada; verificar persistencia con consulta nueva |
| Rosas 33, ID 97 | Leer fecha real del C3 para TAGs 9909769 y 9909783; CSV de asociaciones no incluye fechas |
| Recargos históricos | Identificar cortes ya cubiertos para no cobrarlos nuevamente |
| Conciliación bancaria por correo | Desplegar #299–#304 y validar Titan/Hostinger con reporte controlado, sin repetir depósitos. El concepto ya es informativo; deben mantenerse remitente/asunto configurados, identificador, monto, fecha, cuenta, coincidencia única y hash no reutilizable. La política #284 sigue confiando en From exacto/asunto sin DKIM/DMARC; #283 está cerrado sin merge |
| Migración final de `direccion_id` | Respaldar; ejecutar SQL 01; desplegar todo el backend nuevo y retirar instancias/importadores antiguos; probar; después, sin escrituras, ejecutar SQL 02. DDL no revierte con ROLLBACK y código antiguo no puede volver tras retirar la columna |
| Tarifa y exención por vivienda | AGENTS.md ya reconoce `direcciones.cuota_por_cobrar` con default $300 y #290 añade exenciones persistentes. Falta migrar/verificar esquema, probar cambios de tarifa/exención y confirmar que pagos históricos, referencias y C3 no se alteran |
| Recibos, Excel y exportación de Análisis | Además de validar XLSX vigente, desplegar #323–#326/#341/#348 y comprobar folio/importe/rango, ZIP/Drive y cuatro libros por proyecto con hojas y cinco gráficas editables. Abrirlos en la misma versión de Microsoft Excel, cotejar 231 viviendas/estados y confirmar que mantenimiento no se mezcla. Regenerar documentos solo tras revisar duplicados/folios antiguos |
| Orden por fecha, UI y pago anual en Análisis | Comprobar que #240 ya no aparece, que #244 conserva el filtro de orden, que #245 cobra solo meses faltantes y que #247 filtra Pago anual sin confundir diciembre ordinario. No registrar pagos reales hasta conciliar #243/#246 y validar con datos controlados |
| Fechas DD-MON-YYYY | Revisar visualmente 24 páginas y selectores nativos en Safari iOS/Chrome Android; confirmar que valores ISO, zona México y folios permanecen intactos |
| Base de deuda sin pagos: enero vs septiembre | Resolver la discrepancia antes de desplegar: #290/código limita cortes heredados a enero de 2026, mientras AGENTS.md indica septiembre de 2026 cuando no hay cobertura. Definir la regla, actualizar fuentes rectoras/código y probar casos sin historial sin inventar periodos |
| Versión PHP en Hostinger | No hay evidencia recuperada de una consulta al entorno ni de una actualización. Confirmar en hPanel/CLI la versión efectiva y su relación con el sitio; el backend del repositorio es Node.js, por lo que no asumir que una actualización de PHP corrige este servicio |
| Prueba integral en producción | La excepción temporal TEST-001 ya fue retirada en main por #318–#319; confirmar el despliegue y conteo 231. Después, con vivienda/TAG dedicados y referencia nueva: comprobar `cuotas` antes/después, Análisis, historial, evento C3, idempotencia y lectura física; no repetir transferencia ante una falla |

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

### 2026-11-06

- Main consultado a las 23:30, America/Mexico_City, en `53d1eb9b36ffd5b1473e318fe18ca1109c9f1898`, doce commits por delante del SHA guardado.
- Se excluyó `03eca3a`, que solo actualizó esta bitácora. Como trabajo de producto se verificaron #354 (portal instalable), #355 (botón de instalación Android) y #356 (piloto desactivado de comprobantes por WhatsApp), todos fusionados en main; no hay PR abiertos ni revertidos nuevos.
- #354 reportó 49/61, #355 18/20 y #356 54/58 en validaciones locales con comandos no publicados. Los heads y el merge actual tienen cero workflows y cero estados; los fallos declarados y la falta de Chromium/pruebas físicas se conservan como pendientes.
- Los comentarios del bot muestran vistas previas efímeras de Hostinger para los tres PR, eliminadas al cerrarlos; no acreditan despliegue del portal principal. No hubo acceso directo a Hostinger, Meta, MySQL o C3 ni confirmación física nueva del usuario.
- Se actualizan resumen operativo y pendientes sin cambiar reglas de pagos/C3: WhatsApp no acredita dinero, no asigna viviendas ni modifica TAGs, y el portal instalable requiere conexión.

### 2026-11-05

- Main consultado a las 23:27, America/Mexico_City, en `d64b8e6b897185617f87d18b49c2ccd49992771c`: un commit por delante del SHA guardado.
- El único commit nuevo fue `d64b8e6`, que modificó exclusivamente `docs/ESTADO_PROYECTO.md`; se excluyó del trabajo verificable de producto.
- No hay PR abiertos, cambios de código, PR fusionados, workflows ni checks nuevos. Se conservan sin cambios los PR #348–#353 y los resultados ya documentados, sin contarlos otra vez.
- No hubo confirmaciones nuevas accesibles de despliegue, Hostinger, Gmail, Microsoft Excel, MySQL o C3 físico. Se preservan las reglas, pruebas históricas, resumen operativo y todos los pendientes.

### 2026-11-04

- Main consultado a las 23:26, America/Mexico_City, en `9def48327b5a983dc769989530c91acfad4b0ebf`: 30 commits por delante del SHA guardado. Se excluyó `51b0ebf`, dedicado solo a esta bitácora.
- PR #348–#351 fusionados: tablero y Excel por proyecto, correo de recibos con SMTP Gmail aislado, avisos solo por saldo pendiente, destinatario de una operación y corrección de proyectoId. No hubo Excel, SMTP, navegador o despliegue real.
- PR #352 fusionado: los resultados Workbench aportados confirman el caso puntual de cuota pendiente bloqueada por un evento C3 ANULADO; main ahora excluye solo ese estado del bloqueo. No se registró pago ni se alteró MySQL/C3.
- PR #353 fusionado: guardar teléfono/correo por vivienda y confirmación centrada solo tras SMTP. No se guardaron contactos ni se enviaron correos reales.
- Los workflows de #348–#350 concluyeron **success**; el run final pasó **8/8**, **3/3**, **7/7** y **8/8**, con diagnósticos UI **4/6** y bancario **87/88**. #351–#353 no devolvieron runs ni estados combinados.
- No hay PR abiertos. Se preservan reglas, pruebas históricas y pendientes; los merges no acreditan despliegue, Hostinger, Gmail, MySQL, Microsoft Excel ni C3 físico.

### 2026-11-03

- Main consultado a las 23:29, America/Mexico_City, en `d32916e68b0bf06ea242500c9e616dcec29ab3f4`: 146 commits por delante del SHA guardado. Se excluyó `a6ff758`, dedicado solo a esta bitácora.
- PR #334–#338 fusionados: ajustes de gráficas/toolbar/calendarios, reversión segura de pagos históricos y categoría de egreso Proyecto. No hubo validación real de navegador, MySQL, Hostinger o C3.
- PR #339–#347 fusionados: proyectos extraordinarios por 231 viviendas, aportaciones libres, presupuesto/excepciones, recibos -P/Drive, anulación auditada, cuota cero/No aplica y resaltado de selección. No se importaron datos privados ni se acreditan despliegue o escrituras en producción.
- Los catorce workflows concluyeron **success**. El run final pasó proyectos/cuota cero **20/20 + 1/1** y selección **5/5**; mantiene diagnósticos UI **4/6** y bancario **87/88**, y todavía omite varias suites nuevas.
- No hay PR abiertos ni confirmaciones nuevas accesibles de despliegue, MySQL, Drive, navegador o C3 físico; se conservan los pendientes y confirmaciones anteriores.

### 2026-11-02

- Main consultado a las 23:26, America/Mexico_City, en `6cc8e7f4f9b6e7ad88830fe6ba3873481b8079ed`: 133 commits por delante del SHA guardado. Se excluyó `53886ef`, dedicado solo a esta bitácora.
- PR #323–#326 fusionados: anulación auditada de pagos MJMAN con reversión C3 controlada, ZIP/Drive y recibos de movimiento completo. No hubo anulación, OAuth, Drive o C3 real.
- PR #327–#333 fusionados: ocho calles/categorías, reportes mensuales e históricos en modales, Picker/paginación, criterio de cuotas por período y edición auditada de totales mensuales de egresos. La suma manual esperada de Gardenias noviembre quedó documentada en $2,400, pendiente de cotejo MySQL.
- Los once workflows concluyeron **success**, pero no ejecutan las nuevas suites específicas. El run final conserva UI heredada 4/6 y bancaria 87/88 como diagnósticos no bloqueantes.
- No hay PR abiertos. No se consultaron ni modificaron Hostinger, MySQL, Google Drive, pagos o C3 físicos; un merge no acredita despliegue ni funcionamiento.

### 2026-11-01

- Main consultado a las 23:30, America/Mexico_City, en `1b4ba3185c50f30007fac5c149a16e68f5adbef4`: un commit por delante del SHA guardado.
- El único commit nuevo fue `1b4ba31`, que actualizó exclusivamente `docs/ESTADO_PROYECTO.md`; se excluyó del trabajo de producto.
- No hay PR abiertos, cambios verificables de producto ni checks nuevos. Se conservan los PR #318–#322 y sus resultados ya documentados, sin contarlos otra vez.
- No hubo confirmaciones nuevas accesibles de despliegue, MySQL, IP/DDNS, navegador o C3 físico. Se preservan las reglas, el historial de pruebas y todos los pendientes.

### 2026-10-31

- Main consultado a las 23:34, America/Mexico_City, en `4775252f3e1ab183ea9d5090b5eb2f9e2ec001dd`: 34 commits por delante del SHA guardado. Se excluyó `6c03525`, dedicado solo a esta bitácora.
- PR #318–#319 fusionados: TEST-001/002 quedan fuera de las lecturas operativas sin borrar historial, cuotas, pagos o TAGs. El objetivo de 231 viviendas requiere despliegue y comprobación en MySQL real.
- PR #320–#322 fusionados: diagnóstico C3 de solo lectura, cierre de sockets parciales, un reintento transitorio, menos sesiones TCP y búsqueda libre «Calle y número». No implementan DDNS ni cambio automático de IP.
- Los cinco workflows concluyeron **success**. En el run final pasaron diagnóstico 7/7, resiliencia/búsqueda 9/9 y campo libre 2/2; la UI heredada quedó 4/6 y la suite bancaria 87/88 como diagnósticos no bloqueantes.
- El usuario reportó pérdida de conexión con el C3 tras un apagón/cambio de IP pública. No se verificó recuperación, despliegue, Hostinger, MySQL o hardware en esta revisión; no se escribieron TAGs ni se publicaron secretos.

### 2026-10-30

- Main consultado a las 23:28, America/Mexico_City, en `3084ff40d02aaba4271b018708cc3de559cf41b6`: un commit por delante del SHA guardado en la revisión anterior.
- El único commit nuevo fue `3084ff4`, que consolidó exclusivamente `docs/ESTADO_PROYECTO.md`; se excluyó del trabajo de producto.
- No hay PR abiertos, cambios verificables de producto ni checks nuevos. Se conservan los PR #308–#317 y sus resultados ya documentados, sin contarlos otra vez ni duplicar la entrada del 29/oct.
- No hubo confirmaciones físicas nuevas accesibles y no se consultaron ni modificaron Hostinger, MySQL, Titan, Casa Club, C3 o datos privados. Se preservan reglas, historial de pruebas y pendientes.

### 2026-10-29

- Main consultado inicialmente a las 23:30 en `26b5ffea50c538dcbaf93a81eebbfcf33f721682` y releído a las 23:35, America/Mexico_City, en `7f66b501541f6e3f913d3e0c73d821a722345c55`. Desde el primer corte solo avanzó `7f66b50`, commit de esta bitácora, y se excluyó del trabajo de producto; se mantiene una sola entrada del 29/oct.
- PR #308–#314 fusionados: recibos sin recargo duplicado, adeudos resaltados y ajustes móviles de historial, Pago anual, gráficas, desplegables y KPI. Son cambios en main; no hay confirmación visual ni de despliegue.
- PR #315 fusionado: administradores autenticados pueden reservar Casa Club directamente como APROBADA, sin registrar pago. PR #316–#317 fusionados: folio/nombre MJ para recibos de mantenimiento de Análisis y descarga nativa de Chrome mediante pase firmado temporal.
- Los diez workflows de #308–#317 concluyeron **success**. En el run [40971893271](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/40971893271), la suite heredada diagnóstica quedó **87/88** por la misma expectativa de identificador que falla en main; no se considera resuelta.
- En la relectura no aparecieron PR, checks ni cambios de producto adicionales. No hay nuevas confirmaciones físicas accesibles; los previews de ramas no acreditan despliegue de main y no se consultaron ni modificaron MySQL, Titan, Casa Club, Hostinger, C3 o datos reales.


### 2026-10-28

- Main consultado a las 23:25, America/Mexico_City, en `4cb42defbe74243d0ce2edc1f024a3a2307101ee`: un commit por delante del SHA de producto revisado el 27/oct.
- El único commit nuevo fue `4cb42def`, que actualizó exclusivamente `docs/ESTADO_PROYECTO.md`; se excluyó de la lista de trabajo de producto.
- No hay PR abiertos, cambios verificables de producto ni checks nuevos. Tampoco hubo confirmaciones accesibles de despliegue, MySQL, Titan o pruebas físicas.
- Se conservan las reglas vigentes, el historial de pruebas y todos los pendientes, incluidos extraordinarias/casa club, la discrepancia enero/septiembre y la validación real en Hostinger/C3.


### 2026-10-27

- Main consultado a las 23:25, America/Mexico_City, en `01ffc661de5ea1609d9d31cd6a6b7be4c18b6fb2`: ocho commits por delante del SHA revisado el 26/oct. Se excluyó `61c7f9c`, que solo actualizó esta bitácora.
- PR #305 fusionado: el reparto se habilita desde dos viviendas activas; una sola conserva el formulario individual. PR #306 fusionado: mantenimiento acepta desde $0.01, aplica primero recargos antiguos y luego principal, conserva saldo y no avanza cobertura/C3 hasta completar la mensualidad; además retira Calle/Número duplicados.
- PR #307, solo documental, fija la regla de aceptar cualquier depósito positivo en todos los conceptos. Extraordinarias y casa club todavía no la implementan; quedan pendientes código y pruebas. Los metadatos del PR #288 no permiten atribuir la restricción anterior a un chat concreto.
- Checks: #305 [40598808015](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/40598808015) y #306 [40601173808](https://github.com/listoenlinea-labs/MisionJardines/actions/runs/40601173808) concluyeron **success**; #307 no activó Actions. Se conservaron el 124/125 y demás fallos amplios heredados como pendientes, sin presentarlos como resueltos.
- No hay PR abiertos ni confirmaciones físicas nuevas accesibles. No se consultaron ni modificaron Hostinger, MySQL, Titan, buzón o C3, y un merge no acredita despliegue.


### 2026-10-26

- Main consultado a las 23:25, America/Mexico_City, en `737f1f4dee50f85a8f5d39a7ac02beb6f0b0e068`: 72 commits por delante del SHA revisado el 25/oct. Se excluyó `be23ae4`, que solo actualizó esta bitácora.
- PR #295–#304 fusionados; no hay PR abiertos. Se implementaron refresco de pagos, mostrar contraseñas, alta individual, OCR móvil/formatos flexibles, concepto informativo, reintento OCR→Titan, reparto para más de dos viviendas y corrección del 404/identificadores multi-banco.
- #303 responde a la solicitud accesible del usuario: un depósito único puede repartirse entre viviendas autorizadas, con suma exacta, reporte/hash únicos, transacción conjunta y plan/recibo/C3 por casa. No se hizo depósito ni prueba física.
- Checks: #295 falló su run inicial en finanzas; #296 no activó Actions; #297–#304 tuvieron ocho runs exitosos. Los pasos heredados con `continue-on-error` y los fallos amplios preexistentes no se declaran resueltos.
- La imagen privada citada por #299 se procesó localmente sin publicarse; esto valida extracción en ese entorno, no recepción bancaria. No se consultaron MySQL, Titan, Hostinger o C3 reales ni se confirmó despliegue.
- Se conservan la discrepancia enero/septiembre, la política de remitente falsificable y todos los pendientes de producción.


### 2026-10-25

- Main consultado a las 23:30, America/Mexico_City, en `853200d7460d5d8141ef7b8e09b034ca1b6cf864`: nueve commits por delante del SHA revisado el 24/oct. Se excluyó `dc3721d`, que solo actualizó esta bitácora.
- PR #294 fusionado: Seguridad ahora comparte con Pagos/Análisis el cálculo y clasificador de mantenimiento. Considera tarifa individual, exenciones, pagos adelantados y abonos parciales sin modificar cuotas, pagos ni ZKTeco.
- La regresión Atotonilco 752 quedó cubierta con fixtures: un pago confirmado que cubre el corte evita clasificar como deudor por una fila pendiente antigua. Esto no confirma la base ni el despliegue reales.
- GitHub Actions run 40168871351 concluyó exitosamente para el head de #294; las regresiones Seguridad/Análisis fueron obligatorias. Las suites UI/bancaria heredadas siguen como diagnóstico no bloqueante.
- No hay PR abiertos ni confirmaciones físicas/operativas nuevas accesibles. Se conservan la discrepancia enero/septiembre y todos los pendientes de Hostinger, MySQL y C3.


### 2026-10-24

- Main consultado a las 23:26, America/Mexico_City, en `bd983ec8705b9b9020d59845ba0e521dad651b09`: 60 commits por delante del SHA revisado el 23/oct. Se excluyó `1ea0ac6`, que solo actualizó esta bitácora.
- PR #288–#289 fusionados: unifican Pagos/Análisis por vivienda, aceptan pagos sin TAG, acreditan antes de sincronizar C3 y calculan meses consecutivos desde el último corte. La migración, Hostinger, MySQL, buzón y C3 reales no fueron verificados.
- PR #290 fusionado: añade saldo a favor, exenciones y base enero de 2026 para casas sin pagos. Queda explícito el conflicto con AGENTS.md, que conserva septiembre; no se da por resuelto.
- PR #291–#293 fusionados: formato sin decimales en tarjetas/historial y ajustes de la interfaz/confirmación de exención. No cambian pagos ni C3.
- GitHub Actions acreditó cuatro runs exitosos para los heads de #290–#293. Los siete fallos bancarios heredados siguen siendo diagnóstico no bloqueante; #288–#289 no tuvieron workflow runs. No se ejecutaron pruebas nuevas de producción ni físicas.
- PR #283 fue cerrado sin merge. No hay PR abiertos. Tampoco se recuperó evidencia para afirmar una versión PHP actualizada en Hostinger; se conserva como pendiente.


### 2026-10-23

- Revisión de las 23:28: main leído en `c5e044e1e0008ea21d7f99a51a6dd8e391c3d4f9`, 139 commits después de `cd24e60`. Se excluyó `d83d5ae7829eef681d590afa794bb1ef34d4a392`, dedicado al estado del 22/oct.
- Se fusionaron #267–#282 y #284–#287. #283 sigue abierto, pero #284 sustituyó su propuesta de autenticación; GitHub devolvió cero estados y cero workflow runs para 20 merges y el head abierto.
- #267–#269 mejoran Pagos y crean un modo de $10 aislado. #270 corrige body-parser 2.4.0 y bloquea cuerpos comprimidos: 7/7 pruebas HTTP locales. #271–#274 corrigen iPhone, fecha SPEI y restauran selector nativo.
- #275–#282 amplían OCR por tipo, trazabilidad, diagnóstico de Titan, lectura de importes y cuenta oficial. Las comprobaciones son simuladas; los diagnósticos de producción conservados no acreditan que esta revisión leyera el buzón o MySQL.
- #284 aplica la instrucción documentada de confiar en remitente exacto/asunto sin DKIM/DMARC; AGENTS.md reconoce el riesgo de suplantación. El PR #283 permanece pendiente y ya no representa la política vigente.
- #285 confirmó en código/documentación que validar un reporte no actualiza de forma general `cuotas`. #285–#286 agregan solo una excepción TEST-001 y #287 la hace visible temporalmente en Análisis. El usuario pidió unificar Pagos con la fuente de Análisis y sincronizar C3 después; no existe aún implementación general en main.
- No se consultó ni modificó Hostinger, MySQL, C3 o buzón; no se ejecutaron scripts SQL, pagos ni pruebas físicas. Un merge no acredita despliegue ni funcionamiento.

### 2026-10-22

- Revisión de las 23:27: main leído en `cd24e60d0b325a735cad72a089dd05f34f74e9da`, 153 commits después de `d12ad50`. Se excluyó `0acc3bee1b87ca4508631abe13b0d36b74f1ecd6`, dedicado al estado del 21/oct.
- Se fusionaron #247–#266 y no hay PR abiertos. GitHub devolvió cero estados y cero workflow runs para los 20 merges.
- #247–#253 dejan un Excel de seis hojas/cinco gráficas; #249 y #251 introdujeron regresiones de reparación y #250/#252 las retiraron. #253 muestra pagadas/total por calle y #254–#255 añaden iconos. La evidencia conserva una apertura correcta de #250 y un fallo de #251, pero falta validar la versión vigente #252/#253.
- #256 añade recibo PDF por movimiento. #260/#262 agregan y alinean refresco en Mis recibos. Son cambios en main sin prueba visual de producción.
- #257 (Outlook) y #258 (Gmail) fueron reemplazados por #259 (IMAP genérico). #261 elimina aprobación/rechazo manual: solo correo autenticado puede validar. #264 corrige el entorno del diagnóstico y #265 permite reenvíos del administrador configurado; la fuente confiada pasa a ser ese administrador, no la firma bancaria exterior.
- El diagnóstico real previamente documentado leyó 41 mensajes, pero no acreditó avisos autenticados ni aprobación. #266 ya corrige en main la lectura del importe en fila separada y reporta 28 pruebas sintéticas; aún falta desplegarlo y repetir el diagnóstico real.
- #263 corrige TomTom a español `es-ES`. No se consultó ni modificó Hostinger, MySQL, C3 o buzón; no se aprobaron pagos, ejecutaron migraciones ni hicieron pruebas físicas. Un merge no acredita despliegue ni funcionamiento.

### 2026-10-21

- Revisión de las 23:31: main leído en `d12ad500ac39689b1072fb48a85f1b33f66fcff0`, 131 commits después de `91a4bb3`. Se excluyó `fe7dc35475874d7a6f71a46e25a09a976143f7e2`, dedicado al estado del 20/oct.
- Se fusionaron #231–#246 y no hay PR abiertos. GitHub devolvió cero estados y cero workflow runs para los 16 merges.
- #232–#237 corrigen la superposición de cabecera/modales, conservan el menú de escritorio, unifican la X morada y fijan la posición de Modificar cuotas. #238 garantiza foto real o ilustración etiquetada y quita la flecha de Ayuda. Son cambios en main, no pruebas visuales de producción.
- El usuario reportó que el refresco inicial de #231 no funcionó. #239 amplía el gesto a páginas directas, paneles y cabecera y reporta 20/20 pruebas simuladas; aún falta despliegue y confirmación física en Android/iOS.
- La solicitud de pagos por fecha de #240 fue corregida por el usuario: #241 la reemplazó por orden en la tabla existente, #242 añadió fecha/hora y controles; #244 ocultó la columna y el contador, conservando el filtro de orden. No hubo prueba visual ni MySQL real.
- #243 implementa conciliación explícita de una tarifa especial y #245 agrega Pago anual de meses faltantes. #246 permite fijar el corte absoluto C3 y reducir una vigencia posterior para pagos manuales validados. Estas reglas requieren conciliación con AGENTS.md ($300 y avance desde fecha física) antes de uso real.
- No se consultó ni modificó Hostinger, MySQL o C3; no se ejecutaron migraciones, pagos ni pruebas físicas. Un merge no acredita despliegue ni funcionamiento.
### 2026-10-20

- Revisión de las 23:26: main leído en `91a4bb3f40211096b09be55bea24003df5c39831`, 23 commits después de `9e226f5`. Se excluyó `7f9a3e648fa48d00118870bf1a838a6f39d6b233`, dedicado al estado del 19/oct.
- Se fusionaron #220–#230. #231, que añade deslizar hacia abajo para refrescar una sección en móvil, sigue abierto y no forma parte de main. GitHub devolvió cero estados y cero workflow runs para los 11 merges y el head abierto.
- Auto-users: #221 valida credenciales antes de confirmar vivienda, #224 habilita correo individual de prueba y #229 elimina el login por teléfono. El usuario confirmó la configuración SMTP y recepción de una invitación individual; no se publica el remitente. La dirección pública y la aceptación completa siguen pendientes.
- #222 incorpora cuota configurable por vivienda y SQL manual, pero AGENTS.md todavía declara $300 como regla vigente. La discrepancia se conserva como bloqueo: no se considera autorizada la migración ni una tarifa distinta por el solo merge.
- #223 crea navegación persistente y restaura Inicio por rol; #226–#227 corrigen estilos/caché; #230 corrige scroll móvil. El usuario confirmó que el scroll ya funciona. El pull-to-refresh de #231 aún requiere merge y prueba física.
- #220/#225/#228 incorporan fotografías propias por noticia, recuperación de miniaturas de Tráfico ZMG y fondo con degradado. Las pruebas dirigidas de #225/#228 pasan; #220 añadió pruebas pero no ejecutó Node en esa entrega. Falta validación Hostinger/CSP/CDN y visual.
- No se consultó MySQL/C3 ni se ejecutaron migraciones, pagos o pruebas físicas de hardware durante esta revisión. Se conservan los pendientes e historial anterior.

### 2026-10-19

- Revisión de las 23:27: main leído en `9e226f5124688aaeeebe57850723b10fb3e12e40`, 32 commits después de `3fcff016`. Se excluyó `402de9951fa8fdd4f35638c93843f41154840a3f`, dedicado al estado del 18/oct.
- Se fusionaron #208–#219 y no hay PR abiertos. #208 unifica fechas visibles; #209–#214 mejoran historial, importes, estados y la comparación C3/MySQL sin escribir al controlador.
- #210 limita los bloqueos TAG automáticos a mantenimiento y deja Casa club condicionada por mantenimiento/extraordinarias, no por deuda previa exclusiva de club. Seis archivos de prueba pasan con simulaciones; no hubo C3 físico.
- #215–#216 migran el código a relaciones múltiples `condominos_viviendas` y retiran `direccion_id` del modelo. El usuario aportó CSV con 188 relaciones originales/copiadas y cero faltantes. Los SQL 01/02 para retirar la columna física siguen pendientes de ejecución/despliegue verificado.
- La conversación también registra que el usuario confirmó borrar 159 precuentas pendientes. Un intento posterior de `CALL mj_conciliar_padron_20261019()` devolvió error 1644 porque ya existían respaldos o una conciliación de esa ejecución; esto no certifica conteos finales ni COMMIT.
- #217–#219 añaden recibos PDF mensuales de mantenimiento, apertura manual de WhatsApp y exportación Excel. Las pruebas dirigidas pasan; quedan expectativas estructurales obsoletas y validación real en móvil/escritorio.
- GitHub devolvió cero estados y cero workflow runs para los 12 merges. Esta revisión no consultó directamente Hostinger/MySQL ni ejecutó migraciones, pagos, correos reales, operaciones C3 o pruebas físicas; las operaciones confirmadas por el usuario quedan separadas arriba.

### 2026-10-18

- Revisión de las 23:31: main leído en `3fcff016c3fbd000f9bb2c16da4ec86619cf9a12`, 30 commits después de `5aab812`. Se excluyó `cb772b3ec3388525b7a40a50bc2134e7c7f5f56a`, dedicado a esta bitácora.
- Quedaron fusionados #192 y #195–#207; no hay PR abiertos. #192 deja Auto-users por SMTP y login progresivo por teléfono integrado con sesiones/avisos actuales: 112 pruebas locales con DB/SMTP simulados, sin correo real ni despliegue.
- #195–#202 dejan Noticias locales de siete días con FreeNewsApi, búsqueda vial, prioridad local, tráfico TomTom/Google y correcciones móviles/Safari. Los comandos publicados pasan; falta conectividad desde Hostinger, credenciales reales y revisión visual física.
- #203 incorpora las tres vistas de Análisis y Casa club cobrado sin doble conteo; el universo visible de 232 sigue sin conciliar con el requisito de 231. #204 añade monitor automático de adeudos apagado por defecto; #205 restaura operaciones manuales de TAG aun con deuda. No hubo escritura C3 y continúan dos fallos históricos de `editTag`.
- #206 documenta 18 casos ZKTeco y seis hallazgos; #207 publica el manual raíz con 24 secciones y seis flujos. Son guiones/auditorías, no evidencia de despliegue ni E2E físico.
- GitHub devolvió cero estados y cero workflow runs para los 14 merges. No se consultó Hostinger/MySQL, no se ejecutaron migraciones, pagos, correo real, operaciones C3 ni pruebas físicas; se conservan las confirmaciones anteriores sin añadir novedades.

### 2026-10-17

- Revisión de las 23:33: main leído en `5aab812f944628022d5283b92794153ed3f8d593`, cinco commits después del SHA anterior. Se excluyó `a91d632`, que solo actualizó la bitácora del 16/oct.
- #193 quedó fusionado: cobranza separada de mantenimiento, cuota extraordinaria y casa club; pagos manuales por concepto; avisos de adeudo; sesión recordada opcional; autorización y vencimiento de reservas. Su SQL no se ejecutó en producción y el backend/frontend requieren el esquema nuevo.
- La emisión de extraordinarias queda bloqueada hasta conciliar el padrón elegible: la evidencia del PR contrasta 232 viviendas visibles con el requisito de 231. No se documenta ninguna exclusión automática.
- #194 quedó fusionado y mantiene las tres pestañas de Pagos en una sola fila, incluido móvil. Solo cambia CSS; su revisión visual real sigue pendiente.
- #192 continúa abierto, no está en main: propone cambiar Auto-users de WhatsApp a SMTP, login progresivo por teléfono y alertas de solicitudes. Reporta 76 pruebas locales simuladas, sin envío de correo real ni despliegue.
- Checks: GitHub devolvió cero estados y cero workflow runs para #192–#194. No se consultó Hostinger/MySQL ni se ejecutaron migraciones, pagos, correos reales, escrituras C3 o pruebas físicas.

### 2026-10-16

- Revisión de las 23:27: main leído en `b3188c74117e14fd9b36f79edfeac87ceca5981f`.
- Sin cambios verificables de producto desde `fbd6ebb7091fd114f8b4263c561536a7c156e0e4`. El único avance fue `b3188c7`, commit documental de la bitácora del 15/oct, excluido de la lista de trabajo de producto.
- No hay PR abiertos. El commit documental devolvió cero estados y cero workflow runs; no hubo nuevas pruebas automatizadas ni evidencia de despliegue.
- No se consultó Hostinger/MySQL ni se realizaron pagos, escrituras C3 o pruebas físicas. Se conservan sin cambios el resumen operativo, el historial de pruebas y todos los pendientes anteriores.

### 2026-10-15

- Revisión de las 23:28: main leído en `fbd6ebb7091fd114f8b4263c561536a7c156e0e4`, 21 commits después del punto anterior. Se excluyó `82496d8`, que solo actualizó esta bitácora. Los PR #190–#191 están fusionados y no quedaron PR abiertos.
- Pagos en Análisis: #190 coloca «Registrar pago» en una columna propia por vivienda y lo retira del modal TAGs. Reutiliza el flujo existente y no modifica backend, cálculos, DB ni C3. Falta validar visualmente escritorio/iPhone y apertura de la vivienda correcta sin efectuar un cobro.
- Último mes pagado: #191 añade filtro inclusivo Mes/Año y muestra anticipos confirmados de 2027 o posteriores aunque el período financiero consultado sea anterior. El saldo conserva su corte y no proyecta meses futuros; no toma la vigencia TAG como pago. Falta cotejo con MySQL real y navegador/Safari.
- Pruebas declaradas: #190 reporta 18 comprobaciones y #191 reporta 30, sin comandos completos publicados. GitHub devolvió cero estados y cero workflow runs para ambos merges; no se ejecutó una suite nueva sobre main.
- No se consultó Hostinger/MySQL ni se hicieron pagos, escrituras C3 o pruebas físicas. Se conservan los pendientes anteriores y no hay nueva confirmación del usuario sobre DB o hardware.

### 2026-10-14

- Revisión de las 23:32: main leído en `7ab74ebbc08e168f64f3f5f0dfb405ca34b1f0ea`, 98 commits después del punto anterior. Se excluyó `f8dad14`, que solo actualizó esta bitácora. Los PR #180–#189 están fusionados y no quedaron PR abiertos.
- Análisis financiero: #180 calcula adeudo acumulado, recargos y último mes pagado desde septiembre de 2026. #181–#184 añaden resumen/modal TAG, diagnóstico C3 de solo lectura al abrir, advertencias deuda–TAG, filtro Advertencias y ajustes móviles. Presencia en main no prueba cifras MySQL ni estado físico C3.
- Interfaz: #183–#186 alinean fichas y egresos, centran la dona y encapsulan fechas nativas de Safari. #185 documenta emulación Chromium en 320, 375, 390, 430, 440 y 700 px; Safari/iPhone y producción siguen pendientes.
- Navegación: #187 oculta Cuotas del menú y retira la tarjeta de conciliación histórica de Análisis sin borrar página, endpoint, archivo ni datos. #188 oculta las pestañas de Análisis y ordena Comunidad con Pagos primero; falta verificación visual tras despliegue.
- Inicio por rol: #189 mantiene el tablero financiero para administradores, da a Seguridad listas generales de visitas/accesos y limita a Condómino a viviendas vinculadas desde el servidor. No se probó con cuentas ni MySQL de producción; la suite completa está pendiente.
- Checks: los diez merges devolvieron cero estados y cero workflow runs. Las validaciones descritas en los PR son locales/aisladas, sin comandos completos publicados; no se repitieron. No se consultó Hostinger/MySQL ni se hicieron pagos, escrituras C3 o pruebas físicas.

### 2026-10-13

- Revisión de las 23:26: main leído en `13a3a2334053cdde223cea8fd9a6c89f766fe7c1`, 149 commits después del punto anterior. Se excluyó `de57d88`, que solo actualizó la bitácora del 12/oct. Los PR #154–#179 están fusionados y no quedaron PR abiertos.
- Inicio/Análisis: #154–#158 dejan la gráfica móvil a ancho completo con ejes y puntos táctiles no deformados; #179 coloca Consulta de viviendas inmediatamente debajo de las gráficas. Validación visual en navegador/dispositivo sigue pendiente.
- Seguridad/Dahua: #159 conecta los botones al endpoint ZKTeco existente y prepara HLS seguro; #163 añade diagnóstico. #164–#165 retiran el visor de Seguridad y reordenan cuotas/pluma. No se probó la pluma ni el NVR físicamente y el video requiere gateway externo.
- Pagos: #160–#162 publican historial administrativo 11–10 y fechas anteriores guardadas. #171 y #173–#176 incorporan registro manual de meses, conciliación HIST/referencias protegida, una entrega durable C3 por lote y cierre seguro del modal. No se consultó MySQL/C3 real ni se confirmó el caso Lirios 13.
- Auto-users: #166–#170 y #172 quedaron en main con prerregistro, aceptación, pruebas administrativas, diagnóstico de borrado y confirmaciones masivas. Requiere despliegue, migración validada y configuración real de WhatsApp; no se crearon cuentas ni se enviaron mensajes en producción.
- Padrón visible: #177 restringe Guadalajara a 707 y #178 Valle de México a 3614 en listados compartidos. Son filtros de lectura: no borran ni trasladan direcciones, cuotas, pagos o TAGs.
- Checks: los 26 merges #154–#179 devolvieron cero estados y cero workflow runs. Se conservan resultados locales documentados por cada PR, pero no hay CI de main ni pruebas nuevas de Hostinger, MySQL, WhatsApp, Dahua o C3.

- Auto-users integrado en main mediante PR #166: prerregistro por condómino con vínculo único a
  vivienda/usuario, cuenta_aceptada=false y credenciales aleatorias no entregadas.
  Creación por lotes idempotente; datos ambiguos/inactivos requieren revisión.
  Invitaciones únicas, reemplazables, con hash y caducidad; confirmación del número
  de casa, contraseña, activación transaccional y sesión hacia Inicio. Reportes,
  corrección de datos/vivienda y reenvío individual o de pendientes no aceptados.
- Auto-users requiere migración incremental (preserva cuentas existentes aceptadas),
  frontend/backend y configuración de WhatsApp Business con plantilla de 3 parámetros.
  Sin configuración no simula envíos. No se crearon usuarios ni se enviaron mensajes
  reales; MySQL/Hostinger/C3 de producción no consultados. Inicio se habilita para
  Condómino; Seguridad sigue sin Inicio y Auto-users queda exclusivo de administración.
- Validación: 56 pruebas aprobadas de flujo, HTTP local, DOM, login, permisos,
  migración/proveedor simulados y compatibilidad de registro/revocación. Sintaxis y
  diff sin errores. Revisión visual y prueba de migración/WhatsApp reales pendientes.

- Fecha anterior al pago integrada mediante PR #162: se muestran las fechas
  físicas guardadas en fecha_antes por TAG y movimiento de ese comprobante; no se
  sustituye por la vigencia actual. Sin lectura se indica No registrada; abonos sin
  avance/extraordinarios indican No aplica. Lectura tomada antes de escribir C3,
  después de validar financieramente. No se crea una captura retroactiva.
- Validación de fecha anterior: 9 pruebas de historial aprobadas, sintaxis y diff
  sin errores. Suite pagos/C3: 37 aprobadas y los dos fallos anteriores de edición
  manual/asociación. Producción no consultada; requiere frontend y backend.

- Corrección del historial integrada mediante PR #161 después de #160: periodos
  inclusivos 11–10 (fin exclusivo día 11); selector por hora de México. Meses
  aplicados destacados junto al monto, con entregas parciales/pendientes separadas
  y vista móvil sin desplazamiento horizontal. No se altera el corte de cobro
  inclusivo del día 10 ni el cálculo financiero.

- Historial administrativo de pagos integrado mediante PR #160: selector por
  fecha bancaria en periodos 10–9, tabla de todos los estados/abonos, folios,
  fecha de subida existente (`creadoEn`), monto/reportante y diario de meses.
  TAGs muestran todas las fechas registradas y última lectura; no se consulta TCP.
  API paginada, roles SUPER_ADMIN/ADMINISTRADOR en servidor y página; sin migración.
- Validación del historial: 6 pruebas nuevas y 11 de permisos aprobadas. La suite
  requerida de pagos/C3: 37 aprobadas y los dos fallos previos de edición manual.
  Sintaxis/diff sin errores. Validación visual pendiente (Chromium no disponible
  en este entorno); producción/MySQL/C3 no consultados. Requiere ambos despliegues.

- Datos bancarios de condóminos: folio, monto, fecha y hora se muestran de solo
  lectura y se llenan por OCR. Una lectura incompleta no habilita el reporte;
  se pide releer, una imagen clara o ayuda administrativa. Campos de vivienda y
  concepto conservan su condición de solo lectura.
- El servidor exige detectar los cuatro campos para roles no administrativos y
  coteja valores enviados contra su propia lectura (incluidos segundos). Administración
  conserva captura manual si falta un dato, sin contradecir valores detectados.
- Validación de este ajuste: 33 pruebas aprobadas de OCR, interfaz, campos y reportes;
  sintaxis y diff sin errores. La suite requerida de pagos/C3 conserva los dos fallos
  previamente documentados de edición manual/asociación; no se modificó esa lógica.
  No se consultó ni modificó MySQL o C3 reales. Requiere despliegue frontend y backend.

- OCR del navegador: se reprodujo que SINGLE_BLOCK omite el importe grande en un
  comprobante con bloques de tamaños distintos. Se crea el worker explícitamente y
  se configura PSM.AUTO antes de reconocer; se termina también ante un error.
- Prueba local con el comprobante aportado: el flujo runOcr llenó 300.00 y verificó
  destino. La imagen y el texto bancario no se incorporan al repositorio.
- Validación: 15 pruebas aprobadas de parser, interfaz y OCR independiente del servidor;
  sintaxis JavaScript y diff sin errores. La prueba de imagen usó Tesseract.js local;
  no acredita despliegue ni ejecución en el navegador de producción.
- Asset pagos.js versionado para renovar caché. Solo requiere desplegar frontend;
  backend, reglas financieras, MySQL y C3 no se modificaron.

**Auto-users: prueba individual**

- Se añade una cuenta ficticia por clave de prueba, limitada a viviendas identificadas como Prueba/TEST. Creación transaccional e idempotente en la misma pestaña.
- Enlace individual sin WhatsApp, con expiración, rotación y el mismo flujo público de aceptación/reportes. Cuentas de prueba excluidas de envío, incluso después de editar el teléfono.
- Validación local: 39 pruebas de Auto-users, permisos, autenticación y registro aprobadas; incluye creación concurrente, rechazo de viviendas reales, número incorrecto, corrección de reportes, aceptación única y rollback. Sin consultas/escrituras a producción ni mensajes reales. Requiere desplegar frontend y backend para probar manualmente.

**Auto-users: administración de cuentas de prueba**

- Auto-users incorpora tabla paginada de cuentas de prueba pendientes/aceptadas, consulta de datos y fechas, edición de perfil y vivienda de pruebas, y borrado confirmado del conjunto ficticio. Conserva viviendas e historial externo; validación de marca/rol en servidor, transacción y bloqueo por referencias.
- Editar mantiene aceptación/contraseña/rol, actualiza condómino y vínculo, e invalida enlaces y sesiones anteriores. No incluye cuentas manuales sin marca de prueba.
- Validación local: 43 pruebas aprobadas de Auto-users, interfaz administrativa, autenticación, permisos y registro; incluye rechazo de cuentas reales, edición aceptada, cancelación/confirmación de borrado y rollback. Sin cambios de DB de producción ni mensajes reales. Requiere despliegue de frontend/backend.

**Auto-users: borrado sin respuesta visible**

- El usuario reportó que Borrar no eliminaba y no mostraba mensaje. El flujo anterior salía silenciosamente al cancelar/suprimir la confirmación nativa; no se verificó la causa concreta en su navegador/DB.
- Se sustituye confirmación nativa por dialog de la página, con ID, cancelación explícita, estado de solicitud y errores persistentes; límite de espera de 45 segundos sin reintento automático. Se distingue DELETE completado de fallo posterior refrescando la tabla y se corrige el cursor de botones deshabilitados por estado.
- Validación local: 43 pruebas aprobadas; UI prueba cancelación, rechazo 409, respuesta HTML 404, timeout simulado, recuperación de botones y borrado confirmado. Sin cambios en DB de producción ni relajación de validaciones de borrado. Requiere actualizar frontend; el servidor sigue comprobando la marca y referencias de prueba.

**Auto-users: error de servidor al borrar prueba**

- Captura del usuario muestra panel de borrado de cuenta #8 y respuesta genérica de operación fallida. Confirma que el nuevo panel funciona y la petición obtiene un rechazo del backend; no revela la excepción SQL concreta.
- Se corrige consulta de dependencias: antes seleccionaba modelos completos y asumía todas las tablas/columnas. Ahora comprueba esquema físico y proyecta solo referencias disponibles, omite módulos físicamente ausentes y mantiene bloqueo por historial/FK. Errores administrativos muestran tabla/código seguro, sin SQL ni datos privados.
- Validación local: 45 pruebas aprobadas, incluidas tablas opcionales ausentes, campos heredados, consulta mínima, rollback y diagnóstico HTTP sanitizado. Sin acceso a DB de producción; la causa específica allí requiere confirmar tras desplegar backend o revisar el código de error.

**Auto-users: confirmación antes de acciones masivas**

- Crear usuarios y Mandar invitación requieren panel Sí/No antes de empezar el flujo por lotes. No/Escape no ejecuta solicitudes masivas y Sí se consume una vez para evitar repetir por clics sucesivos. No cambia los botones de pruebas ni el envío individual.
- Validación local: 45 pruebas aprobadas; interfaz comprueba ausencia de solicitudes antes de Sí y al cancelar, selección de la operación correcta, confirmación única y creación de prueba sin panel masivo. Sin creación de cuentas ni mensajes reales en producción. Requiere actualizar frontend.

### 2026-10-12

- Main quedó en `3d25888592a4a2996d7fca70edb66a95b6efbf7a`, 45 commits por delante del SHA revisado el día anterior. Se excluyó `05aab7c`, que solo actualizó esta bitácora.
- PR #143–#147 fusionados: conectan cuotas históricas, egresos, ingresos manuales y saldo inicial al dashboard/Análisis, con protección contra doble conteo. Requieren comprobar tablas, asientos, API y cifras en el MySQL realmente usado por producción; el merge no confirma esos datos ni el despliegue.
- PR #148–#149 y #152–#153 fusionados: gradientes, filtros, tooltips, detalle mensual, tarjeta Agenda y rediseño de la gráfica financiera para móvil. La validación visual y la ejecución de las pruebas UI en un checkout completo siguen pendientes.
- PR #151 fusionado: el porcentaje de viviendas pagadas usa el padrón documentado para Atotonilco, Guadalajara y Valle de México, excluye Prueba y deduplica el indicador sin borrar ni trasladar cuotas, pagos o direcciones. Falta cotejo con nombres/números reales de producción.
- PR #142 fue cerrado sin merge. PR #150 permanece abierto; sus seis líneas de ajuste no están en main.
- GitHub no acreditó estados ni workflow runs para #143–#147, #149 y #151–#153. #148 devolvió cero runs y un error transitorio al consultar el estado combinado. No se ejecutaron pruebas nuevas contra Hostinger, MySQL real o C3 en esta revisión.

- OCR del monto: el lector de navegador/servidor solo toma valores monetarios
  asociados a Monto/Importe/Total; no usa terminaciones de cuenta ni atraviesa
  secciones Destino/Origen/Folio/Fecha. Si la lectura es ambigua, deja el importe
  vacío para completarlo. La validación independiente del servidor se conserva.
  Se cambia la versión del asset en pagos.html para actualizar el lector en caché.
  Pruebas: parser en ambos entornos, llenado del formulario y OCR sintético del servidor.
  No se consultaron ni modificaron comprobantes, DB o C3 de producción.

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
  La lectura de notificaciones bancarias se discutió como propuesta, sin implemen
