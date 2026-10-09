# Tablas por módulo y gestión de residentes

Inventario del código del backend y las páginas, actualizado con esta entrega. Los nombres son los declarados en los modelos y consultas; no implica una conexión a la base de producción. Todos los endpoints autenticados consultan `usuarios`, `roles` y los vínculos activos de `usuarios_casas` para validar permisos y vivienda.

| Módulo | Tablas propias o consultadas | Uso |
| --- | --- | --- |
| Residentes | `direcciones`, `condominos`, `permisos_acceso_vivienda` | Viviendas, padrón activo y permisos mostrados por `/api/casas`. |
| Gestión de residentes (esta entrega) | `direcciones`, `condominos` | Alta/edición del padrón y contactos de la vivienda. |
| Inicio / dashboard | `cuotas`, `visitas_programadas`, `accesos_seguridad`, `condominos`, `direcciones`, `eventos` | Indicadores y actividad. Las consultas SQL del dashboard usan `eventos`; el módulo Calendario usa `calendario`. Es una diferencia existente que debe verificarse contra el esquema real. |
| Registro, login y Mi cuenta | `usuarios`, `roles`, `direcciones`, `solicitudes_cuenta`, `verificaciones_cuenta`, `solicitudes_rol`, `invitaciones_casa`, `usuarios_casas`, `historial_vinculos` | Credenciales, solicitudes de acceso/rol, cambios de correo y pertenencia a viviendas. |
| Verificación de cuentas | `solicitudes_cuenta`, `usuarios`, `roles`, `direcciones`, `usuarios_casas`, `historial_vinculos` | Aprobar/rechazar/revocar cuentas y asignar vivienda y rol. |
| Mis viviendas | `usuarios_casas`, `direcciones`, `usuarios`, `roles`, `invitaciones_casa`, `historial_vinculos` | Miembros, responsables, invitaciones y desvinculación. |
| Pagos y recibos | `pagos_reportados`, `cuotas_extraordinarias`, `folios_consecutivos`, `direcciones`, `usuarios`, `cuotas`, `zk_tarjetas`, `pagos_acceso_c3`, `pagos_acceso_tags_c3`, `recargos_mantenimiento` | Comprobantes, aprobación, recibos e incrementos desde la fecha real del C3; SQL conserva el diario de aplicación. |
| Cuotas | `cuotas`, `direcciones`, `usuarios`, `folios_consecutivos`, `zk_tarjetas`, `pagos_acceso_c3`, `pagos_acceso_tags_c3` | Cobros por vivienda y confirmación de incrementos de acceso. |
| Análisis financiero | `direcciones`, `cuotas`, `pagos_reportados`, `egresos_fraccionamiento`, `reservas_casa_club` | Ingresos, egresos y recuperación de cuotas de Casa Club. |
| ZKTeco | `zk_tarjetas`, `direcciones`, `zk_error_logs`, `pagos_acceso_c3`, `pagos_acceso_tags_c3`; lectura de adeudos en `cuotas` | Inventario, asociación a casas, errores y aplicación de nuevos pagos. `vigencias_mantenimiento` queda como referencia heredada y no proporciona fechas al controlador. El C3 mantiene su propio `user` y `userauthorize`, accesibles por TCP, no mediante SQL de Hostinger. |
| Visitas / QR | `visitas_programadas`, `direcciones`, `usuarios` | Visitas, códigos y estado. |
| Seguridad / registro de entradas | `accesos_seguridad`, `direcciones`, `usuarios` | Entradas/salidas y persona que las registra. |
| Calendario | `calendario`, `usuarios` | Eventos y responsable que los crea. |
| Casa Club | `reservas_casa_club`, `direcciones`, `usuarios`, `usuarios_casas` | Reservas y sus movimientos. |
| Conexión | `configuraciones_conexion` | Configuración de integraciones. La telefonía también usa variables de entorno. |
| Conmutador | `condominos_importacion` (búsqueda actual de teléfono), más tablas de autenticación | El teléfono se consulta en la tabla de importación; dar de alta un residente en `condominos` no actualiza esta fuente heredada. El motor de telefonía usa configuración de entorno, sin una tabla propia de llamadas. |
| Búsqueda general | `direcciones`, `condominos`, `cuotas`, `pagos_reportados`, `visitas_programadas`, `accesos_seguridad`, `calendario` | Resultados según rol. |
| Calles | `direcciones` | Catálogo obtenido del padrón de viviendas. |
| Anuncios | Sin tabla propia; `localStorage` del navegador | La sesión se valida contra el backend, pero los anuncios se almacenan localmente. |
| Reportes y detalle de reporte | Sin tabla propia; `localStorage` del navegador | Los tickets no están persistidos en MySQL. |
| Directorio y mapa | Datos definidos en las páginas; autenticación del backend | No tienen un módulo propio de persistencia en MySQL. |

## Relación central

`direcciones.id` identifica la vivienda. `condominos.direccion_id` vincula a las personas del padrón. `usuarios_casas.casa_id` vincula cuentas de acceso. Cuotas, pagos, vigencias y TAGs usan `casa_id`. Un residente de padrón no es una cuenta con contraseña; ambas entidades tienen operaciones diferentes.

## Operación desde Residentes

- **Gestionar vivienda:** único botón superior, en naranja. Selecciona una vivienda existente y captura nombre, teléfono y correo para dar de alta una persona. Puede convertirse en el contacto principal de la casa. No crea ni aprueba una cuenta de login.
- **Editar inquilino:** disponible en cada fila del padrón. Actualiza ese mismo registro; cuando cambia el inquilino, se sustituyen los datos de la persona anterior por los de la nueva. También permite actualizar renta, observaciones y contacto principal. No existe un selector de operaciones ni un flujo separado de cambio de inquilino.
- Las cuentas de acceso y sus vínculos se gestionan en Mis viviendas y Verificación de cuentas. La edición del padrón no modifica sus credenciales ni desvincula cuentas.
- Los pagos históricos, adeudos, fecha base financiera, controles y autorizaciones del C3 permanecen asociados a la vivienda. Este formulario no escribe al C3. Al cambiar de inquilino, Administración debe revisar quién conserva físicamente los TAGs.
- La persona entrante puede crear su propia cuenta mediante el registro y recibir aprobación/vinculación en Verificación de cuentas; para cuentas existentes, Mis viviendas permite vincularlas.

Endpoints nuevos, exclusivos de `SUPER_ADMIN` y `ADMINISTRADOR`:

```text
GET  /api/casas/:id/residentes
POST /api/casas/:id/residentes
```

El POST admite `modo=ALTA|EDITAR`, `nombreCompleto`, `telefono`, `correo`, `enRenta`, `observaciones`, `actualizarContacto`; EDITAR requiere `residenteId`. El backend valida campos, vivienda y residente activo; guarda la operación en una transacción y bloquea la vivienda para serializar cambios concurrentes desde esta función. El modo CAMBIO se rechaza.

No agrega tablas ni columnas. Usa `direcciones` y `condominos` existentes. Debe desplegarse el backend junto con el frontend.

## Verificación de entrega

1. Como administrador, dar de alta una persona de prueba en una vivienda del padrón; comprobar su aparición tras recargar.
2. Editar contacto y renta. Verificar qué cambia en `condominos` y `direcciones` según la selección de contacto principal.
3. Usar Editar inquilino para sustituir sus datos. Verificar que conserva el mismo ID activo y que no se crea un residente adicional ni se modifican cuentas vinculadas.
4. Comprobar que cuotas, pagos, vigencia y TAGs no cambian por esta operación.
5. Como Seguridad o Condómino, verificar ausencia de botones de administración y respuesta 403 de los endpoints.

Las pruebas automatizadas usan modelos simulados; no escriben en producción ni comprueban la posesión física de los TAGs.
