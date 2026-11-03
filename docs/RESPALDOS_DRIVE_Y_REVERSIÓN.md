# Finanzas: anulación segura, ZIP de recibos y respaldo Drive

## Configuración en Hostinger

Crear proyecto en Google Cloud, habilitar **Google Drive API** y configurar consentimiento OAuth. Crear un cliente OAuth de **Aplicación web**. URL de retorno autorizada idéntica al valor de la variable del servidor:

```env
GOOGLE_DRIVE_CLIENT_ID=...apps.googleusercontent.com
GOOGLE_DRIVE_CLIENT_SECRET=... 
GOOGLE_DRIVE_REDIRECT_URI=https://api-misionjardines.listoenlinea.host/api/finanzas/drive/callback
```

Conservar `JWT_SECRET` estable (se utiliza para cifrar tokens Drive almacenados en MySQL). **Nunca** colocar el secreto OAuth ni el refresh token en frontend, GitHub, screenshots o URL. OAuth solicita `drive.file` y `userinfo.email`; no lee indiscriminadamente el Drive. La conexión se guarda en `google_drive_respaldo`, cifrada con AES-256-GCM. El directorio `Misión Jardines - Respaldos` y las subcarpetas `AAAA-MM` se crean en el Drive conectado. El Excel de padrón se genera desde el mismo generador completo que la tarjeta «Casas en padrón», con las mismas gráficas. El respaldo sube un ZIP mensual de PDF y un Excel del período elegido; puede seleccionarse «todos los meses» para ZIP históricos.

**Límites operativos:** los respaldos de muchos meses pueden tardar más que el timeout HTTP de Hostinger. Hasta implementar trabajos persistentes asíncronos, utilice períodos individuales si el historial es grande. El respaldo devuelve error en caso de PDF pendiente de conciliación; no debe confundirse con un respaldo completo. El endpoint no elimina archivos anteriores: ejecuciones repetidas crean versiones nuevas en la carpeta.


## Nuevo destino: Drive existente / 02_Recibos_PDF / 2026

Cuando la administración use **Análisis de cuotas → Generar respaldo en Drive**, podrá seleccionar con Google Picker la carpeta ya existente:

```
Mision Jardines - Administración/
└── 02_Recibos_PDF/
    └── 2026/
        ├── MJ-OCT-2026-...-M.pdf
        ├── MJ-SEP-2026-...-M.pdf
        └── ...
```

- Se guarda el **PDF individual de cada vivienda y mes pagado**, no un ZIP, bajo la subcarpeta del año del recibo. Los meses de otros años crean `2025`, `2027`, etc.
- No se mueven ni borran las carpetas o archivos que ya existían.
- Los PDF generados por la aplicación se actualizan por el mismo nombre, evitando duplicados por reintentos.
- Los archivos Excel de padrón siguen guardándose en `Misión Jardines - Respaldos/AAAA-MM` (flujo histórico). Su ubicación no cambia.
- Un mes grande se sube en lotes de 10 PDF, con información de progreso. En caso de error, la operación se detiene e indica el problema; se puede reintentar sin duplicar los PDF guardados.
- La cuenta OAuth debe tener permiso para agregar archivos a la carpeta seleccionada. El backend valida que sea una carpeta accesible, que se llame exactamente `02_Recibos_PDF` y que tenga permiso de escritura.

**Variables de Hostinger adicionales a las tres credenciales OAuth ya configuradas:**

```env
GOOGLE_PICKER_API_KEY=CLAVE_PUBLICA_DE_GOOGLE_PICKER_RESTRINGIDA
GOOGLE_CLOUD_PROJECT_NUMBER=NUMERO_DE_PROYECTO_GOOGLE_CLOUD
```

Pasos Google Cloud:
1. Mantener habilitada **Google Drive API** y agregar **Google Picker API** en el mismo proyecto OAuth.
2. Ir a **APIs y servicios → Credenciales → Crear credenciales → Clave de API**. Limitar su uso a Google Picker API.
3. En restricciones para sitios web incluir `https://listoenlinea-labs.github.io/*` y `https://docs.google.com/*` (Google Picker utiliza un iframe alojado en docs.google.com). La clave es visible al navegador: **no se debe tratar como secreto**, pero debe restringirse.
4. Obtener el **número del proyecto** (no el ID de cliente) en el panel de Google Cloud.
5. Reiniciar el backend Node.js tras agregar las variables.

**Flujo:** Conectar con Google Drive → Autorizar → Generar respaldo en Drive → **Elegir carpeta 02_Recibos_PDF** → en Google Picker navegar a `Mision Jardines - Administración/02_Recibos_PDF`, seleccionar esa carpeta → elegir mes (o activar todos los meses) → Generar respaldo. Después, en Drive, aparecerá `02_Recibos_PDF/2026` y los PDF.

El permiso OAuth sigue siendo `drive.file`, no `drive` global. Como las carpetas existentes no son accesibles a la app automáticamente, Google Picker permite al usuario autorizar la carpeta específicamente. Se guarda su ID en `google_drive_respaldo.folder_id`, no sus credenciales. El token OAuth de corta duración para Picker se entrega solo a administradores autenticados y nunca se persiste en el navegador por la aplicación. La API de selector retorna `Cache-Control: no-store`.

Nuevas rutas administrativas:

- `GET /api/finanzas/drive/selector` devuelve temporalmente datos de Picker y token OAuth de corta duración.
- `POST /api/finanzas/drive/carpeta` con `{folderId}` valida y guarda la carpeta elegida.
- `POST /api/finanzas/drive/recibos` con `{periodo:"2026-10",offset:0}` sube el siguiente lote de hasta 10 PDF y devuelve `nextOffset,terminado,folderUrl`.
- `POST /api/finanzas/drive/respaldo` con `soloExcel:true` conserva exportación del padrón separada.

**Antes de desplegar:** probar selector en la misma cuenta Google, un período con pocas viviendas, un período con cientos y descarga/lectura de PDFs; revisar permisos, no duplicación por reintentos y vencimiento de tokens OAuth en modo Testing.

## Cómo anular un pago manual

En **Análisis de cuotas → Historial de mantenimiento**, presionar **Borrar** en un movimiento con referencia `MJMAN:...`. El botón solicita confirmación y palabra `ANULAR`. La API en una transacción revisa vivienda, referencia, meses, ausencia de pagos posteriores, instantáneas previas, estado del diario C3, y conserva auditoría en `pagos_anulaciones`.

- Las nuevas capturas guardan instantáneas de cuotas editadas/creadas en `pagos_cuotas_antes`; también las conciliaciones auxiliares quedan respaldadas.
- Las capturas **anteriores a esta versión** carecen de instantánea. Solo se permite eliminar automáticamente una cuota si hay evidencia suficiente de que se creó nueva en esa captura; de lo contrario se bloquea para evitar pérdida de historial.
- Se conserva auditoría de pago anulado y se marca su orden C3 como `ANULADO`. Se crea una orden `REVERSA` por cada vivienda con TAGs, usando el mes pagado anterior para calcular la fecha absoluta. El worker debe leer el C3, confirmar identidad, PIN, puertas y fecha antes de escribir el cambio. **MySQL confirmado no equivale a ZKTeco verificado**. Revisar estado `COMPLETADO`, fecha física de todos los TAGs y panel de Seguridad.
- No se borran los comprobantes bancarios, no se altera el padrón de residentes y no se revierten movimientos de extraordinarias o Casa Club.

## Caso de Rosas 10 (2-NOV-2026)

El historial proporcionado muestra que **octubre de 2026** fue un pago real ($300, referencia `MJ-2026-0367`) y el pago manual accidental cubrió **noviembre y diciembre de 2026**, $600, con referencia:

```
MJMAN:2027-01-10:4ef8d39c-9767-4238-9f61-f6c9c1c1d756
```

**Importante:** la interfaz presenta las fechas como DD-MON-AAAA; en MySQL se guarda `2027-01-10` en la referencia. Cotejar el UUID y el ID real de vivienda desde MySQL antes de operar. El sistema debe regresar a octubre de 2026 como último período pagado, y su vigencia esperada es 10-NOV-2026, *si no existen otros pagos válidos*. No modificar la fecha del TAG solo en la tabla SQL: también hay que comprobar el controlador físico C3.

Consulta de lectura recomendada:

```sql
SELECT d.id,d.calle,d.calle_correcta,d.numero
FROM direcciones d
WHERE LOWER(COALESCE(d.calle_correcta,d.calle))='rosas' AND d.numero='10';

SELECT c.id,c.casa_id,c.anio,c.mes,c.monto_pagado,c.estatus_pago,
       c.referencia,c.origen_importacion,c.creado_en,c.fecha_confirmacion
FROM cuotas c
JOIN direcciones d ON d.id=c.casa_id
WHERE LOWER(COALESCE(d.calle_correcta,d.calle))='rosas' AND d.numero='10'
ORDER BY c.anio DESC,FIELD(c.mes,'ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE') DESC;

SELECT p.id,p.casa_id,p.referencia,p.origen,p.estado,p.fecha_objetivo
FROM pagos_acceso_c3 p
WHERE p.referencia='MJMAN:2027-01-10:4ef8d39c-9767-4238-9f61-f6c9c1c1d756';

SELECT t.id,t.numero_tarjeta,t.fecha_fin,t.ultima_lectura FROM zk_tarjetas t
JOIN direcciones d ON d.id=t.casa_id
WHERE LOWER(COALESCE(d.calle_correcta,d.calle))='rosas' AND d.numero='10';
```

No se incluye una consulta DELETE automática para producción: primero respaldar y cotejar registros, sus referencias y cualquier cuota HIST previa. Una captura antigua que sobrescribió una cuota impide revertirla sin el respaldo original.

## Rutas

Todas las rutas de usuario, excepto el callback OAuth de Google firmado, requieren JWT y rol administrativo.

- `GET /api/finanzas/pagos-vivienda/:id/anulacion?referencia=...`: vista previa y bloqueos
- `POST /api/finanzas/pagos-vivienda/:id/anulacion`: `{referencia,confirmacion:"ANULAR"}`
- `GET /api/finanzas/recibos-masivos/periodos`: períodos registrados
- `GET /api/finanzas/recibos-masivos/zip?periodo=AAAA-MM`: descarga ZIP
- `GET /api/finanzas/drive/status`: estado de conexión
- `GET /api/finanzas/drive/conectar`: URL OAuth
- `POST /api/finanzas/drive/respaldo`: `{periodo,xlsx:<base64>,todos?:boolean}`

## Validación antes de producción

1. Ejecutar pruebas del backend y revisar que el inicio crea dos tablas de auditoría y tabla de tokens.
2. Probar ZIP de un mes pequeño y abrir cada PDF y el Excel en un entorno no productivo.
3. Verificar conexión OAuth en cuenta de prueba, permisos, reintento de autorización y creación de carpetas.
4. Simular anulación sin TAGs y con TAGs en controlador de prueba (antes/después y estados C3).
5. **No ejecutar anulación real de Rosas 10 hasta confirmar snapshot original o reconstrucción contable respaldada**.
