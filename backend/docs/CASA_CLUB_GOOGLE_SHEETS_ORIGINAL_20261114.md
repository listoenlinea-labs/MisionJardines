# Casa Club ↔ Google Sheets original (RESERVACIONES)
14 de noviembre de 2026

## Documento único

Esta integración NO crea hojas, no copia el archivo, no altera filas anteriores ni necesita mover el Google Drive:
- Spreadsheet ID: `11y3DX6IFiAs9Azps8k3lJs_-lxvR8g01MTlDwsgKIY`
- Pestaña: `RESERVACIONES`
- Columnas originales A:J: FOLIO, FECHA REGISTRO, CORREO, NO. CASA, CALLE, NOMBRE SOLICITANTE, TELÉFONO, PROPIETARIO, FECHA RESERVACIÓN, MES.
- Cuenta de servicio: `mision-jardines-casa-club@mision-jardines-respaldos.iam.gserviceaccount.com` (compartida como Editor).

## Variables Hostinger (backend Node.js)

```dotenv
CASA_CLUB_GOOGLE_SYNC_ENABLED=false
CASA_CLUB_GOOGLE_SHEETS_ID=11y3DX6IFiAs9Azps8k3lJs_-lxvR8g01MTlDwsgKIY
CASA_CLUB_GOOGLE_SHEETS_TAB=RESERVACIONES
CASA_CLUB_GOOGLE_CREDENTIALS_BASE64=CONTENIDO_BASE64_DEL_JSON_PRIVADO
```

**Dejar en false hasta desplegar y verificar este PR.** Cambiar a `true` y reiniciar la app cuando se apruebe. El token OAuth usa alcance de lectura/escritura Sheets pero solo accede a los documentos compartidos con la cuenta de servicio.

## Flujos

### Google original → MySQL

- Lectura A1:J5000 cada 2 minutos, antes de confirmar una reserva local y también cuando el administrador pulsa Actualizar.
- Importa sólo fechas no pasadas con folio `MJ-yyyymmdd-número` y vivienda **inequívoca por calle y número**.
- Marca `estatus=PENDIENTE`, `pagado=false`, `fecha_limite_pago=NULL`, `fecha_bloqueada=fecha`. Se muestran **amarillas (En revisión)** y como tarjetas de revisión en Administración.
- No se envían comprobantes, no se validan depósitos, no se convierten fechas antiguas en rojas ni se modifica ningún registro activo ya existente.
- Si no se logra identificar una vivienda, la fecha se bloquea como En revisión mientras Google esté disponible, se avisa en logs y no se inventan datos de dirección.
- Si MySQL ya tiene una reserva de esa fecha, conserva su estado actual. El conflicto se registra para conciliación manual.
- Reservas antes del día actual y reservas canceladas/rechazadas previamente NO se reimportan.
- Importación idempotente por folio y fecha única.

### MySQL → Google original

- Ambas rutas de Casa Club (liga libre y login) escriben primero en MySQL y conservan su validación de pago, reglamento y adeudos.
- Se escribe sólo una nueva fila por folio `CC-<id>` mediante `values.append` al final de la pestaña RESERVACIONES (sin modificar datos históricos).
- Un reintento lee primero el Google Sheet; si el folio CC-id ya está allí, no lo vuelve a agregar.
- Las reservas importadas del formulario antiguo no se exportan otra vez.
- Si el envío a Google falla tras insertar en MySQL, la reserva local queda guardada y el worker reintentará. No debe hacerse una segunda reserva.

### Colores del calendario

- Verde disponible.
- Amarillo En revisión = PENDIENTE, sin importar origen.
- Rojo Reservada = APROBADA.
- Gris No disponible por calendario.
- Las fechas pendientes y aprobadas no se pueden seleccionar en la Casa Club libre ni con login.

## Límite importante: formulario antiguo de Apps Script

**Este PR no modifica la URL antigua de Apps Script ni su código**. Aunque MySQL importe su solicitud a los pocos minutos, el formulario anterior podría aceptar provisionalmente una fecha ya ocupada en MySQL. Para bloquear en AMBAS DIRECCIONES es imprescindible modificar el Apps Script original, antes de que escriba la fila, para consultar la API pública:

```javascript
function fechaDisponibleEnMisionJardines(fechaISO) {
  const base = 'https://TU_HOSTINGER/api/casa-club/publico/fechas';
  const url = base+'?desde='+encodeURIComponent(fechaISO)+'&hasta='+encodeURIComponent(fechaISO);
  const resp = UrlFetchApp.fetch(url,{muteHttpExceptions:true});
  if(resp.getResponseCode()!==200) throw new Error('No se pudo confirmar disponibilidad; no aceptar fecha');
  const body = JSON.parse(resp.getContentText());
  if(!body.ok) throw new Error('Calendario no disponible');
  return !body.ocupadas.some(x=>x.fecha===fechaISO);
}
```

Añadir `if (!fechaDisponibleEnMisionJardines(fechaISO)) throw Error('Fecha no disponible');` **en el servidor del Apps Script justo antes de escribir la fila**. Para reducir carreras, usar `LockService` en la misma sección de guardado. La consulta remota por sí sola NO garantiza atomicidad entre Google Sheet y MySQL; la solución definitiva es que ambos formularios reserven mediante el mismo endpoint en MySQL.

## Verificaciones antes de activar

1. Confirmar que variables no estén expuestas en GitHub ni en el navegador.
2. Comprobar columnas y pestaña `RESERVACIONES` originales; si cambian, el backend detiene sincronización.
3. En entorno de pruebas, crear reserva desde enlace libre. Confirmar folio `CC-id` único en Google Sheet y `PENDIENTE` en MySQL.
4. Crear reserva desde login; confirmar otra fila sin duplicados.
5. Ingresar fila antigua en Google para una fecha libre con calle y vivienda existentes; comprobar `PENDIENTE`, calendario amarillo y tarjeta en Aprobación de reservas tras Actualizar.
6. Introducir fecha ya ocupada en Google; comprobar que no modifique estado de reserva anterior.
7. Desconectar Google temporalmente: el frontend debe impedir crear nuevas reservas mientras se desconoce el estado de Google; la consola del administrador conserva las reservas MySQL para gestión.
8. No asumir que la salida de Google implica confirmación de pago: `pagado` siempre permanece falso en importación.

## Limitaciones actuales
- Solo procesa solicitudes antiguas con folio `MJ-yyyymmdd-número`.
- No resuelve automáticamente filas con calle/número ambiguos ni casos no conciliables.
- Sin modificación del Apps Script antiguo, ese formulario no tiene comprobación inmediata de MySQL.
- La lectura está limitada a 5000 filas: revisar antes de alcanzar ese número.
