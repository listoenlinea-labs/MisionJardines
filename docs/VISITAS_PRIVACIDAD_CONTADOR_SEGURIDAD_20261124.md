# Misión Jardines — Visitas: roles, privacidad y contador pendiente

## Flujo confirmado por diseño
1. **Condómino**: abre Visitas, selecciona su vivienda vinculada (obtenida del servidor), registra el nombre del visitante y demás datos de autorización. La API siempre asigna `casaId` desde la sesión verificada, ignorando cualquier casa diferente enviada por el navegador.
2. **Administrador / Super Admin / Mesa Directiva**: puede consultar las viviendas permitidas y crear autorizaciones.
3. **Seguridad**: no puede autorizar una visita ni consultar el padrón desde Visitas. Solo consulta los datos operativos **calle y número de casa, nombre del visitante y estado**, más un identificador interno necesario para registrar la entrada/salida.
4. Una visita creada inicia en `PROGRAMADA` y se incluye en el **contador de visitas pendientes de entrada**.
5. El guardia pulsa **Registrar entrada**. La API cambia atómicamente a `EN_CURSO` y guarda la fecha y operador en la base de datos; el contador disminuye. La misma visita queda en el historial con **Registrar salida**.
6. El guardia pulsa **Registrar salida**. La API cambia atómicamente a `FINALIZADA`; queda en el historial sin contarse como pendiente. Las visitas `CANCELADA` nunca cuentan.
7. Las autorizaciones pendientes de días pasados se siguen contando mientras no se registre entrada o cancelación, para no ocultar visitas pendientes sin procesar.

## Burbuja y actualización
- GET `/api/visitas/pendientes`: solo personal de Seguridad/Administración autorizado, devuelve `{ok:true,cantidad:N}` y **ningún dato personal**.
- En la barra lateral, únicamente para `SEGURIDAD`, aparece una burbuja junto a **Visitas** cuando hay pendientes. No aparece para otros roles.
- También hay una burbuja dentro de la pestaña de historial de Visitas del guardia.
- La vista del guardia consulta nuevamente la lista y el conteo cada **15 segundos** mientras esté visible. El menú revisa el conteo periódicamente.
- Al registrar entrada, salida o una nueva autorización se emite `mj:visitas-cambios`. En el portal con iframes, el evento se pasa al menú principal por un `postMessage` del mismo origen, verificado contra el iframe activo. Así el propio guardia ve disminuir el contador después de confirmar la entrada sin esperar al siguiente ciclo.
- En otros dispositivos, la actualización se observa en el siguiente sondeo de aproximadamente **15 segundos**. Este cambio no añade conexiones WebSocket ni procesos nuevos.

## Privacidad comprobable en backend
- `GET /api/visitas` desde `SEGURIDAD` utiliza proyección de columnas y responde exclusivamente `id`, `nombreVisitante`, `estatus` y `casa:{calle,numero}`.
- Las respuestas de `PATCH /api/visitas/:id/entrada` y `PATCH /api/visitas/:id/salida` están igualmente reducidas.
- El guardia **no recibe** `telefono`, `placas`, `identificacion`, `codigo`, `autorizadoPor`, `notas`, propietario o datos de residentes.
- No se usa `/api/casas` desde la vista de guardia. La consulta de viviendas para crear visitas, `GET /api/visitas/viviendas`, solo está disponible para emisores y devuelve calle, número e ID de sus viviendas autorizadas.
- La autorización y propiedad de vivienda se validan en servidor. Cambiar HTML, rol local o `casaId` del POST no concede acceso a otros domicilios.
- El cambio de estado es **condicional por estatus**. Dos guardias no pueden completar el mismo ingreso o salida dos veces; el segundo recibe 409 y debe actualizar el historial.

## Cambio de permisos respecto a la versión anterior
La implementación previa permitía crear visitas desde `SEGURIDAD`. Esta revisión restringe el alta a condóminos y administración para cumplir la separación solicitada. Seguridad conserva la búsqueda, las entradas y las salidas.

## Validación antes de fusionar
1. Ingresar como condómino, crear una visita para la vivienda propia; no debe permitirse cambiar a otra casa manipulando el POST.
2. Ingresar como administrador, crear otra visita para una vivienda distinta.
3. Entrar como guardia en celular y computadora: solo deberían verse **Casa / Visitante / Estado / Acciones**, sin código, teléfono, placas o datos de residentes. Revisar también la respuesta JSON en red.
4. Verificar burbuja = número total de `PROGRAMADA`, sin contar `EN_CURSO`, `CANCELADA` o `FINALIZADA`.
5. Registrar entrada: la burbuja baja y la fila muestra **Registrar salida**. Registrar salida: el estado queda `FINALIZADA`.
6. Abrir dos sesiones de guardia e intentar confirmar la misma entrada simultáneamente: solo una debe registrar éxito, la otra recibe conflicto 409.
7. Crear desde otro celular: la sección de guardia y su burbuja deben reflejar la visita en el próximo ciclo de actualización.
8. Verificar roles en menú y API; no modificar ni probar sobre datos de residentes reales sin autorización.

## Alcance técnico
No cambia base de datos ni requiere migración. No se modifican Pagos, comprobantes/OCR, Casa Club, ZKTeco, conmutador telefónico ni el agente de caseta.

Estas verificaciones se prepararon con pruebas simuladas del controlador y chequeos de sintaxis; falta comprobar interfaz real y persistencia MySQL en el despliegue de Hostinger.
