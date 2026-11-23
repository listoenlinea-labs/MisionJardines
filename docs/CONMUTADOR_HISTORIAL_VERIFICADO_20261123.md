# Historial de llamadas con confirmación real de caseta

## Problema corregido
Antes el sistema registraba la vivienda al aceptar el **POST de solicitud**, incluso cuando el agente no la recogía, expiraba, tenía un error de red o el navegador abría el marcador telefónico. Por lo tanto, el historial podía parecer una lista de llamadas realizadas aunque solo fuera una lista de intentos.

## Nueva regla
- `conmutador_intentos_llamada`: se conserva **sin cambios**, como bitácora histórica de intentos. No contiene teléfonos ni nombres. No permite deducir el resultado de llamadas anteriores.
- `conmutador_llamadas_seguimiento`: **nueva** tabla que asocia cada solicitud de caseta con UUID y un estado del servidor. Se crea automáticamente al consultar o registrar historial. Un POST válido inicia `PENDIENTE`.
- El agente autenticado reporta `ENVIADA`, `FINALIZADA` o `ERROR`. La API actualiza **en la misma transacción** tanto el estado de caseta como la tabla de seguimiento, y solo tras una confirmación aceptada para el UUID/reclamo correspondiente.
- El historial del Conmutador **solo muestra filas con estado `ENVIADA` o `FINALIZADA` y `confirmado_en` no nulo**. `PENDIENTE`, `ERROR`, caducadas y registros previos sin prueba no cuentan.
- La consulta de último día y los saltos con flechas se hacen exclusivamente entre fechas con órdenes confirmadas. Sigue **sin paginación** y sin filtrar por número de teléfono.
- No se recrean ni modifican resultados históricos desconocidos: las entradas anteriores al despliegue permanecen conservadas como intentos, pero **no aparecerán como confirmadas**.
- Ni `ENVIADA` ni `FINALIZADA` demuestran conversación o respuesta del residente. Solo sabemos que el agente alcanzó el paso correspondiente con Asterisk. Para confirmar conexión se necesitarían CDR/eventos de Asterisk, fuera de este cambio.

## Integridad y seguridad
- El inserto de solicitud y bitácora ocurre dentro de la misma transacción de MySQL. Si falla, la solicitud completa se revierte.
- La confirmación de estado conserva el token secreto de agente, los identificadores de solicitud y reclamo y los permisos actuales.
- Resultados duplicados o con UUID/reclamo inválido no cambian el historial.
- No se toca el código de `telefonia/caseta/agente.py`, `telefonia/asterisk`, HT813, ZKTeco, Casa Club, Pagos ni OCR.
- La tabla nueva no requiere ALTER ni eliminación de datos; el SQL de creación está en `backend/sql/2026-11-23-conmutador-llamadas-seguimiento.sql`. Se crea automáticamente en el backend.

## Verificación y despliegue
- Pruebas simuladas del historial incluyen un día con envíos confirmados y días posteriores con PENDIENTE, ERROR o antiguos sin verificar; la pantalla no muestra esos días ni los usa como fecha inicial.
- La prueba del endpoint de caseta valida que el POST crea PENDIENTE y solo el reporte autenticado ENVIADA/FINALIZADA confirma.
- En Hostinger, después del despliegue, hacer una llamada de prueba desde el iPhone del guardia. Verificar que solo aparezca en el historial cuando el agente confirme el envío; provocar un intento no confirmado y revisar que **no** aparezca en la lista principal.
- **Advertencia de alcance:** no se garantiza una llamada contestada o audio completado. Para identificar conexiones contestadas/rechazadas necesitaríamos integrar registros CDR de Asterisk.
