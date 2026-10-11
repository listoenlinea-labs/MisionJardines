# Misión Jardines · Google Sheets históricos y validación de producción

## Qué puede hacer este PR

1. Corregir solo en celular el ancho de la gráfica de Inicio, presentación de fichas ZKTeco, tarjetas de Análisis/Casa Club/Calendario, selector de calles del Conmutador y los márgenes de Seguridad/Visitas.
2. Exponer una vista de **Seguridad → Cuotas por vivienda** que lee **MySQL**, autenticada para `SUPER_ADMIN`, `ADMINISTRADOR` y `SEGURIDAD`. Solo muestra **calle, número, estado, fecha último pago, último mes pagado**. No entrega nombres ni teléfonos.
3. Habilitar `Análisis de cuotas → Importar desde Google Sheets` para **consultar y preparar datos históricos** de `pagos`, `ingresos` y `egresos`. **No altera automáticamente** la contabilidad actual ni pagos validados, ni envía comandos a C3.

## Configurar Google Sheets en Hostinger (pasos exactos)

1. En [Google Cloud Console](https://console.cloud.google.com/), selecciona o crea un proyecto. Habilita **Google Sheets API**.
2. Crea una **cuenta de servicio**, genera una **clave JSON** y descárgala **solo a tu equipo**. No subas el JSON, su clave privada ni su Base64 a GitHub, Google Sheets pública ni al navegador.
3. Abre el Google Sheet de tu padre, pulsa **Compartir**, agrega como **Lector** el correo `client_email` del JSON de la cuenta de servicio. Un enlace para «cualquier persona con enlace» **no es necesario**.
4. Copia el identificador que figura entre `/d/` y `/edit` en la URL `https://docs.google.com/spreadsheets/d/ID/edit`.
5. En el **backend de Hostinger** (variables de entorno del servicio Node, o `backend/.env.production` en el servidor, **nunca** en `docs/`), configura:

```dotenv
GOOGLE_SHEETS_ENABLED=true
GOOGLE_SHEETS_SPREADSHEET_ID=EL_ID_DE_LA_URL
GOOGLE_SHEETS_SERVICE_ACCOUNT_JSON_BASE64=CONTENIDO_BASE64_DEL_JSON_DE_CUENTA_SERVICIO
GOOGLE_SHEETS_RANGO_PAGOS=Pagos!A1:H500
GOOGLE_SHEETS_RANGO_INGRESOS=Ingresos!A1:G500
GOOGLE_SHEETS_RANGO_EGRESOS=Egresos!A1:G500
```

Los rangos deben comenzar en fila 1 con **encabezados**; los nombres y columnas tienen que ser los reales de tu archivo. No uses los nombres de ejemplo si tus pestañas son diferentes. Cada fila siguiente representa un registro. Por seguridad, el backend admite como máximo 5,000 filas por tipo y 40 columnas.

Para generar el valor Base64 **localmente en PowerShell** (no pegues el resultado en este chat):

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('C:\\ruta\\cuenta-de-servicio.json'))
```

**IMPORTANTE:** deja `GOOGLE_SHEETS_ENABLED=false` (o sin definir) hasta que tengamos el archivo real y hayamos aplicado la migración opcional. Cuando esté lista la hoja, cambia el valor a `true` y reinicia el backend Node en Hostinger. No cambies `JWT_SECRET`, credenciales MySQL, el bridge ZKTeco ni `FRONTEND_URL` para configurar Sheets.

## Código exacto

- **Dónde se leen variables y rangos:** `backend/src/services/google-sheets.service.js` → `config()`, `assertType()`, `readSheet()`.
- **Dónde se leen/almacenan históricos:** `backend/src/controllers/google-sheets.controller.js` → `preview()`, `stage()` y `reviewList()`.
- **Dónde se autoriza el acceso:** `backend/src/routes/google-sheets.routes.js` (solo administrador/superadministrador).
- **Dónde se habilita la API:** `backend/src/app.js` → `app.use('/api/google-sheets', ...)`.
- **Dónde está el esquema de históricos:** `backend/src/models/GoogleSheetsHistorico.js`. La migración SQL se ejecuta **manualmente**, cuando configuremos Google Sheets: `backend/sql/google_sheets_historico_opcional.sql`. El arranque de la aplicación y del ZKTeco **no** crean esta tabla ni esperan su instalación.
- **Dónde se muestra en pantalla:** `docs/analisis-cuotas.html` y `docs/assets/js/google-sheets-historicos.js`.

## Flujo de datos / seguridad

```text
Google Sheet PRIVADO
        |
        v
Cuenta de servicio (solo backend Hostinger)
        |
        v
GET /api/google-sheets/preview?tipo=pagos
        |
        v
Vista previa (20 filas, solo admins)
        |
        +--- Confirmación explícita
        v
POST /api/google-sheets/preparar-historico
        |
        v
google_sheets_historico · PENDIENTE_REVISION
        |
        X   No se inserta en cuotas/pagos_reportados/egresos_fraccionamiento todavía.
```

La importación de históricos es **idempotente por hoja/tipo/fila**. Si una fila cambia entre lecturas, se reporta conflicto y se conserva la versión anterior para revisión. Esto evita que editar una celda del Sheet sobrescriba datos contables en silencio. Para cargar a tablas contables reales, se necesitará **mapeo y conciliación** con las columnas reales, fechas, calle/número o `casa_id`, recibos, pagos ya existentes, y autorización administrativa previa. No se debe inventar esa correspondencia.

## Consulta Seguridad: significados

- **AL_CORRIENTE:** cuota del mes actual en estado `PAGADO` y sin cuotas anteriores conocidas pendientes/parciales.
- **DEUDOR:** existe historial de cuotas pero la actual no está pagada, o hay pendientes anteriores.
- **SIN_DATOS:** no hay registros de cuotas para la vivienda. **Nunca** significa que se comprobó un adeudo.
- **Último mes pagado:** último periodo marcado `PAGADO`; no equivale necesariamente a fecha del banco.
- **Última fecha de pago:** mayor `fecha_pago` registrada en cuotas pagadas, o «Sin fecha».
- No se usa el estado del TAG para inferir pago. Importar Google Sheets a `google_sheets_historico` no cambiará estos estados hasta que se concilie.

## Checklist obligatorio previo a desplegar a producción

- [ ] Respaldar MySQL y probar primero en base **de pruebas**, sin producción.
- [ ] Confirmar roles autorizados con una sesión de administrador, seguridad y residente: el residente debe recibir HTTP 403 de ambas rutas privilegiadas.
- [ ] A 360, 390 y 430 px, verificar las diez capturas: gráfico Inicio completo sin scroll horizontal; ZKTeco botones visibles; donut legible; tarjetas compactas; pestañas del Conmutador; márgenes Seguridad/Visitas.
- [ ] En Seguridad comprobar casas **pagadas**, **pendientes** y **sin historial**, fecha y último mes pagado con comprobantes reales.
- [ ] En Google Sheets, probar una hoja pequeña primero y confirmar que los conteos coinciden con el Sheet; probar dos veces para verificar que no duplique filas; cambiar una fila y comprobar que reporta conflicto sin reescribirla.
- [ ] Revisar que cuotas, ingresos, egresos, recargos, balances, C3 y recibos **no cambian** por leer o preparar históricos.
- [ ] Revisar autorización y auditoría antes de reconciliar/validar pagos históricos.
- [ ] Ejecutar `node --test` desde `backend/` y `node --test tests/mobile-operativo.test.cjs` desde raíz (pruebas estáticas más pruebas en navegador real).

**Limitación:** sin el spreadsheet ID, la cuenta de servicio compartida, los nombres reales de pestañas y la estructura de columnas, ninguna conexión externa puede verificarse. Este PR no certifica por sí mismo que los servicios estén listos para producción.
