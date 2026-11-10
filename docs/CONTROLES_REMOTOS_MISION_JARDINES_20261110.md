# Misión Jardines · Controles remotos PO1000 (10-nov-2026)

## Alcance exacto del PR
Se mantienen íntegros los IDs, endpoints, callbacks y lógica de TAGs del ZKTeco C3-200, incluido el control de pluma, vigencias, sincronización, bloqueo y consulta por vivienda. La nueva pestaña **Controles** tiene una API independiente y **no está integrada con pagos, mantenimiento, adeudos ni ZKTeco**.

El nuevo inventario está inicialmente vacío: cada vivienda aparece con **0 controles**. El administrador podrá registrar código de control, vivienda, asignaciones administrativas de botones A/B/C/D, activar/bloquear cada control o todos los de la vivienda, vigencias individuales y por vivienda, eliminar y consultar historial. Se conserva paginación, filtros y orden. Los registros se almacenan en tablas nuevas `controles_remotos_mj` y `controles_remotos_eventos_mj`.

**Advertencia importante:** los cambios son SOLO ADMINISTRATIVOS en MySQL. Los bloqueos, activaciones, eliminación, vigencias y asignación de botones **NO se transmiten al receptor PO1000**. El control puede seguir abriendo físicamente. No debe ofrecerse como revocación efectiva de accesos hasta realizar y documentar una prueba física con hardware compatible. La pestaña y las respuestas de API advierten expresamente este estado.

## Despliegue
1. Fusionar PR y desplegar `docs/` en GitHub Pages y `backend/` en Hostinger.
2. El backend crea exclusivamente las **dos nuevas tablas** al recibir la primera solicitud de Controles, si el usuario MySQL tiene permiso `CREATE`. Si Hostinger restringe permisos, ejecutar **una sola vez** `backend/sql/2026-11-10-controles-remotos-mj.sql` en phpMyAdmin. El script es idempotente.
3. Ingresar a ZKTeco > **Controles**. Se mostrarán las viviendas visibles con **0 controles**. No tocar «Sincronizar ZKTeco» para Controles: el botón original permanece exclusivamente en TAGs.
4. Probar agregar CT-PRUEBA a una vivienda de prueba autorizada, asignar A/B, editar vigencia, bloquear, activar, consultar historial, eliminar y comprobar que la pestaña TAGs permanece exactamente igual. Esta prueba no afecta el portón físico.
5. Retirar el registro CT-PRUEBA al terminar. Validar permisos: administradores y mesa directiva editan; Seguridad no tiene acceso a API de Controles.

## Preguntas concretas para administración/instalador
**Infraestructura**
1. ¿Cuántos portones físicos existen, cómo se llaman y cuáles son de entrada y salida?
2. ¿Cuántos receptores PO1000 hay físicamente, dónde se encuentran y qué portón alimenta cada uno?
3. ¿Cada PO1000 abre directamente la tarjeta BFT mediante relé o pasa por una controladora ZKTeco C3-200? ¿Tenemos diagrama o foto del cableado completo?
4. ¿Cuáles son marca, modelo, frecuencia y versión de firmware de receptores PO1000 y controles de cuatro botones?
5. ¿Los receptores tienen puerto para administración por red, puerto serie, bus, USB, Wiegand u otra interfaz de datos? Solicitar manual técnico o ficha del fabricante.
6. ¿Cuántas entradas y salidas libres quedan en C3-200? ¿Las dos puertas ya están asignadas a la pluma principal?
7. ¿Hay alimentación, red Ethernet y gabinete protegido cerca de cada receptor?

**Operación y reglas**
8. ¿Qué abre exactamente cada botón A/B/C/D, en cada portón y en cada control?
9. ¿Se puede programar un mismo botón para distintos receptores? ¿Qué regla se desea por vivienda?
10. ¿Cómo se identifica hoy cada control (número de memoria, serial, código RF)? ¿Existe padrón exportable o sólo el teclado Add/Delete/Block?
11. ¿Un control puede estar asociado a más de una casa? ¿Cuántos controles máximos se permiten por casa?
12. ¿Qué se hace actualmente cuando un control se pierde o se roba? ¿Hay forma de bloquear *solo ese control* sin borrar los demás?
13. ¿La administración autoriza los bloqueos y reactivaciones? ¿Seguridad solo consulta o también puede solicitarlos?
14. ¿Las vigencias son indefinidas, por fecha o temporales? ¿Se bloquea por pérdida, cambio de residente u otra causa? **Por ahora NO están vinculadas con adeudos/pagos.**
15. ¿Se requiere historial verificable de cada apertura (identidad, botón, portón, fecha y hora) o únicamente altas/bajas? Es imposible garantizar auditoría individual si el receptor solo envía un pulso anónimo.

**Prueba controlada**
16. ¿Podemos disponer de dos controles y una ventana de mantenimiento, con instalador autorizado y resguardo del paso, para probar alta, bloqueo y reactivación?
17. ¿Quién autorizó cambios físicos y quién provee acceso a receptores, diagramas y manuales?
18. ¿Se requiere conservar todos los controles PO actuales sin sustituirlos o se acepta instalar receptor/controles nuevos si el PO1000 no tiene interfaz administrable?

## Condición de integración física
Para automatizar el permiso por control/botón, el dispositivo debe proporcionar a nuestra plataforma una **identidad única por control y botón** y ser capaz de impedir el accionamiento cuando se revoca. Un relé Wi-Fi simple abriría el portón pero **no identificaría qué control solicitó el acceso**. Hasta confirmar manual y protocolo PO1000, no se puede garantizar programación por botón ni bloqueo remoto real.

No intervenir el gabinete BFT energizado. El motor indica alimentación de red y el cierre de portón puede causar lesiones. Toda prueba eléctrica debe estar a cargo de un técnico competente y mantener los dispositivos de seguridad y la operación manual de emergencia.
