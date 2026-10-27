# Índice de documentos de Misión Jardines

Actualizado el **10 de octubre de 2026**. Punto de entrada:
[AGENTS.md](../AGENTS.md). Este índice distingue documentación vigente, material
histórico y archivos privados. Un documento guardado no equivale a una lectura
actual del C3 ni a una consulta en vivo de MySQL.

## Documentación del repositorio

| Documento | Uso | Estado / precaución |
| --- | --- | --- |
| [Estado del proyecto](ESTADO_PROYECTO.md) | Resumen operativo, pruebas confirmadas, pendientes y bitácora diaria | Leer antes de continuar; actualización programada a las 23:30, America/Mexico_City |
| [Manual integral de funcionamiento y pruebas](../PLAN_PRUEBAS_INTEGRAL_20261018.md) | **Documento principal en la raíz**: 24 secciones, lógica y conexiones reales, flujos de aceptación por rol/móvil y piloto seguro C3 | El enlace antiguo en `docs/` apunta al manual principal; no acredita pruebas físicas de producción |
| [Mapa SQL por módulo](MAPA_SQL_POR_MODULO_20261018.md) | Queries SELECT seguras, relaciones entre mantenimiento/extraordinarias/Casa club y diagnóstico de TAGs | No confundir espejo SQL con autorización física `userauthorize` del C3 |
| [AGENTS.md](../AGENTS.md) | Reglas para agentes: pagos, recargos, C3, OCR y trabajo seguro | Vigente; leer antes de editar |
| [Auto-users](AUTO_USERS.md) | Alta individual de residentes por vivienda/correo, prerregistro idempotente, aceptación, reportes, SMTP, login por usuario/correo y prueba individual con envío opcional con consulta, edición y borrado con confirmación/diagnóstico y consulta del esquema real; confirmación de acciones masivas | Nuevo flujo; requiere migración, frontend/backend y configuración del remitente/plantilla |
| [Validación por correo](VALIDACION_BANCARIA_CORREO.md) | IMAP y reenvíos del administrador por From exacto, sin autenticar; concepto libre, cuenta de 3/4 dígitos y aviso de uso único | Configurar remitente exacto en backend; conciliación real pendiente de prueba |
| [Historial administrativo de pagos](HISTORIAL_PAGOS.md) | Periodos 11–10, fecha bancaria/subida, estados, meses y última vigencia registrada por TAG | Nueva sección; requiere despliegue frontend/backend y cotejo de producción |
| [Tres conceptos de pago](PAGOS_TRES_CONCEPTOS_202610.md) | Sesiones recordadas, extraordinarias, adeudos, casa club y SQL de migración/diagnóstico | Rama de trabajo de 18/oct; exige SQL previo, conciliación del padrón de 231 viviendas y validación en Hostinger |
| [Análisis por tres conceptos](ANALISIS_TRES_CONCEPTOS_20261018.md) | Pestañas Mantenimiento/Extraordinarias/Casa club, saldos por casa, ingresos de Casa club y columna de último registro de pago y orden reversible por encabezados | Cambios de 18/oct; requiere despliegue de frontend y backend, tablas previas y conciliación con MySQL |
| [Tráfico y noticias del entorno](ENTORNO_TRAFICO_NOTICIAS.md) | Capa de congestión Google/TomTom, privacidad de credenciales, activación y pruebas de noticias | Cambios del 18/oct; requiere claves externas y despliegue, sin SQL |
| [Reparto entre viviendas](PAGOS_REPARTO_VIVIENDAS.md) | Un depósito de mantenimiento, asignaciones por casa, suma exacta y acreditación conjunta | Desde dos viviendas activas; frontend/backend juntos, sin SQL nuevo |
| [Pagos/cuotas unificados](PAGOS_CUOTAS_UNIFICADOS.md) | Diferencia entre último corte cubierto y corte actual, meses consecutivos, fecha bancaria separada y C3 posterior al commit | Sustituye la cotización desde C3; requiere despliegue y conciliación de pendientes anteriores |
| [Pagos y acceso C3](PAGOS_ACCESO_C3.md) | Cálculo desde fecha física, abonos parciales y complementos, diario de aplicación, reintentos y cortes pagados | Histórico: cálculo desde C3 sustituido por Pagos/cuotas unificados |
| [OCR del destinatario](../backend/docs/PAGOS_OCR_DESTINO.md) | Tesseract.js, idiomas, instalación y comprobantes pendientes | Vigente; OCR no confirma recepción bancaria. Extracción flexible del 26/oct: expresiones de envío, importe con $, fechas sin etiqueta; excluye comisión/retención/saldo y ambigüedad |
| [Diagnóstico de presencia C3](../backend/docs/diagnostico-presencia-c3.md) | Diferenciar inventario SQL, presencia física y autorizaciones | Diagnóstico; Gardenias 5 es el ejemplo histórico |
| [Tablas por módulo](BASE_DATOS_MODULOS.md) | Relaciones de tablas y gestión de residentes | Inventario del código, no certificación del esquema de producción |
| [Condóminos y viviendas](CONDOMINOS_VIVIENDAS.md) | Relación muchos a muchos del padrón, compatibilidad y despliegue | Tabla intermedia verificada mediante CSV; retiro de direccion_id requiere SQL 01, despliegue y SQL 02, en ese orden |
| [Mis viviendas](VIVIENDAS.md) | Cuentas, responsables, miembros e invitaciones | Referencia para vínculos; no confundir residente con cuenta de login |
| [Verificación de cuentas](../backend/docs/verificacion-cuentas.md) | Registro, aprobación, rechazo y asignación de roles | Consultar también rutas y política actuales |
| [Roles](ROLES.md) | Descripción de permisos | Navegación de Seguridad actualizada el 12/oct; la política completa está en los dos archivos permissions.js |
| [Vigencia de mantenimiento](../backend/docs/vigencia-mantenimiento.md) | Historia de implementaciones y API heredada | **Histórico y mixto.** Sus secciones de fecha base, total acumulado, corte general, autoaprobación y reenvío SQL al C3 no son las reglas vigentes. Leer AGENTS.md y PAGOS_ACCESO_C3.md en su lugar |
| [Cambios visuales](README_CAMBIOS.md) | Contexto de una migración de estilos | Histórico; no describe toda la interfaz actual |
| [Telefonía](../telefonia/README.md) | Motor y futura conexión del conmutador | Consultar el flag/configuración actual antes de habilitarlo |
| [Bridge Pull SDK](../tools/zkteco-pullsdk-bridge/README.md) | Herramienta Windows alternativa | No se necesita para el escritor DIRECT de pagos; no implica que todas las operaciones globales sean DIRECT por defecto |

## Archivos operativos privados y sus versiones

Buscar los siguientes nombres en los archivos del proyecto o en la carpeta
**Fraccionamiento Mision jardines**. No están incorporados al repositorio.
Los identificadores indicados sirven para localizar la versión usada, no son rutas públicas.

| Nombre del archivo | Función | Versión usada en el cotejo |
| --- | --- | --- |
| `Hoja de cálculo sin título - Hojas de cálculo de Google  BASE DE DATOS MJ(2).pdf` | **Padrón oficial de referencia aportado por el usuario** para identificar viviendas reales | Adjuntado 10/oct/2026; `libfile_3662946461d481918c463bfde6df54bf`. 233 direcciones, incluida Jardines 142 marcada CASA NO EXISTE |
| `42-1.csv` | Lista de viviendas SQL sin TAG asociado, con controles y residente | Exportación recibida 10/oct/2026; `libfile_757585a06ed88191a437c68cfb5aefe8`. 36 filas |
| `42-2.csv` | Viviendas SQL con cantidad y números de TAGs asociados | Exportación recibida 10/oct/2026; `libfile_7c2c83f3555c8191b272530e909e8686`. 242 viviendas; 206 con TAG y 36 sin TAG |
| `42-3.csv` | TAGs sin asociación válida a vivienda | Exportación recibida 10/oct/2026; `libfile_a29aa50a161c8191b94b0c84f159ed94`. 9 TAGs con casa_id NULL |
| `Cotejo_viviendas_y_TAGs_2026-10-10.pdf` | Primer resumen de las 36 filas sin TAG | `libfile_09323c03e5d881918e553b02929acd80`. **Sustituido para clasificar viviendas reales por el cotejo actualizado** |
| `Cotejo_actualizado_padron_y_TAGs_2026-10-10.pdf` | Resultado de comparar el padrón oficial con los CSV | `libfile_7c8f312dda10819193307be7741748f7`. 27 viviendas del padrón sin TAG; 8 fuera del padrón y una marcada inexistente |

Cuando llegue otra versión, actualizar nombre, identificador, fecha y resultado;
no aplicar cifras de una exportación vieja a una base modificada después. No
necesita volver a adjuntarse un documento si ya puede localizarse entre los archivos.

## Estado del cotejo: fotografía del 10 de octubre

- Las 233 direcciones del padrón aparecen en `42-2.csv` al comparar calle/número
  normalizando acentos y Av. Esto no verifica todos los campos, pagos ni permisos físicos.
- De las 36 filas sin TAG, **27 aparecen en el padrón**, **8 no aparecen** y
  **Jardines 142 (ID 157)** figura como CASA NO EXISTE.
- Viviendas del padrón sin TAG: Atotonilco 752; Gardenias 3, 23, 28, 30;
  Guadalajara 789; Jardines 125, 145, 164, 285, 332, 335, 363;
  Lirios 6, 17, 23, 33; Magnolias 7, 31; Rosas 3, 9, 16, 18, 27, 39, 40, 41.
  Ser una vivienda real sin TAG no prueba que se le haya entregado uno.
- Fuera del padrón: Atotonilco 331 (ID 706), Atotonilco 728 (699), Guadalajara
  88.5 (704), Jardines 21 (176), 25 (177), 29 (178), 37 (195), Valle de México
  88.5 (701). Revisar referencias antes de depurar; no eliminados por este cotejo.
- Jardines 21/25/29/37 tienen residentes coincidentes con 201/205/209/307.
  Son **posibles duplicados**, no una autorización para fusionar automáticamente.
- Prueba TEST-001 (ID 738), TAG 5112343: asociación presente en CSV; exclusión
  intencional del padrón de casas reales. No usar el ID como constante en código.
- Lirios 7: usuario confirmó COMMIT de conservación del ID 113 y eliminación del
  duplicado 726. Jardines 12/120, 16/160, 36/360 y 38/380: usuario confirmó resueltos.
- Asociación de 35 TAGs a 20 viviendas: resultado previamente verificado;
  confirmación del COMMIT no documentada. Una nueva exportación puede resolver ese estado.
- Los 9 TAGs: usuario dijo resueltos, pero `42-3.csv` todavía muestra casa_id NULL.
  **Discrepancia abierta**: confirmar fecha del export y repetir consulta; no asumir que
  la corrección falló ni declarar la asociación actual confirmada.
- Rosas 33 (ID 97), TAGs 9909769 y 9909783: aparecen asociados en CSV, pero este
  archivo no incluye fechas. Sigue pendiente comprobar su fecha física del C3;
  la asociación no resuelve el diagnóstico previo de fecha final SQL vacía.
- Recargos históricos sin cortes identificados: pendiente de conciliación.

## Mapa de código y pruebas

| Área | Archivos clave |
| --- | --- |
| Meses, fechas y principal | `backend/src/services/pago-acceso-calculo.js`, `mensualidades-mantenimiento.js` |
| Recargos y cotización física | `backend/src/services/recargos-mantenimiento.service.js` |
| Registro financiero y diario | `backend/src/services/vigencia-mantenimiento.service.js`, `backend/src/controllers/pagos.controller.js` |
| Entrega/reintentos C3 | `backend/src/services/zkteco-vigencias.service.js` |
| TCP y operaciones de TAGs | `backend/src/services/zkteco-c3-client.service.js`, `zkteco-direct.service.js` |
| Inventario periódico de lectura | `backend/src/services/zkteco-autosync.service.js` |
| OCR servidor | `backend/src/services/comprobante-lector.service.js`, `comprobante-ocr.worker.js`, `backend/scripts/preparar-ocr.js` |
| Permisos | `backend/src/config/permissions.js`, `docs/assets/js/permissions.js` |
| Modelos centrales | `backend/src/models/Casa.js`, `ZkTarjeta.js`, `PagoAccesoC3.js`, `PagoAccesoTagC3.js` |
| Regresiones | `backend/test/pagos-acceso-c3.test.js`, `recargos-mantenimiento.test.js`, `zkteco-vigencias.test.js`, `zkteco-autosync.test.js`, `comprobante-lector.test.js`, `comprobante-parser.test.js`, `permissions.test.js`, `auth-permissions.test.js` |

Los comandos disponibles están en AGENTS.md. El PR #132 y sus comandos
`test:usuarios` / `test:flujos` fueron revertidos; no hay un workflow nuevo de
pruebas de cuentas activo por esa entrega. La conciliación por correo bancario
está propuesta, no implementada.

## SQL de referencia

Los scripts están en [backend/sql](../backend/sql/). Revisar contra el esquema
real antes de ejecutarlos: no constituyen un dump actual ni un plan de migración
universal. `zkteco_integracion_readonly.sql` documenta el espejo SQL del inventario;
`normalizar_calles_zkteco.sql` es una operación de datos, no un cotejo de solo lectura.
Los scripts de pagos, registro, visitas y reservas deben leerse junto con las
migraciones de arranque y los modelos actuales.

## Validación al crear este índice

El 10/oct/2026 se ejecutaron las pruebas de pagos-acceso-c3, recargos-mantenimiento,
zkteco-vigencias y zkteco-autosync: **35 aprobadas y 2 fallidas**. Los dos fallos están
al principio de `backend/test/zkteco-vigencias.test.js`: edición manual de fecha y
edición con cambio de asociación. En la simulación, EndTime conservó 20260910
cuando se esperaba 20261110. Son fallos existentes en el código/pruebas revisados;
esta entrega solo añade AGENTS.md y el índice, y no los corrige. No permiten
concluir por sí solos que el controlador de producción tenga ese comportamiento.
Pendiente diagnosticarlos antes de declarar esa parte de la suite aprobada.
