# Permisos de acceso

- SUPER_ADMIN y ADMINISTRADOR: todas las secciones.
- SEGURIDAD: Inicio, Residentes, Mapa, Visitas, Conmutador, Reportes, Seguridad y Conexión.
- CONDOMINO: Cuotas, Pagos, Anuncios, Calendario y Directorio; entrada en Cuotas.
- Mi cuenta y cerrar sesión: disponibles para todos los roles reconocidos.
- Mesa directiva y Mantenimiento conservan su navegación anterior.
- Conexión permite consulta a Seguridad; guardar configuración sigue reservado a administradores. Ver una sección no concede funciones administrativas.
- Las cuotas de condóminos siguen limitadas a su vivienda.

## Despliegue

Publicar docs y desplegar backend juntos. El backend incluye su política en src/config/permissions.js y puede desplegarse sin la carpeta docs. Una prueba comprueba que coincide con la política de navegación.
Al iniciar el servidor se ejecuta una migración transaccional de una sola vez que asigna SUPER_ADMIN a la cuenta EXISTENTE vladiir.rod96@gmail.com. Se registra el ID en app_migrations; no se crea cuenta ni contraseña ni se reactiva una cuenta suspendida. Si no existe, queda pendiente y se registra aviso.
Los permisos del JWT se actualizan consultando el usuario y rol activos en cada petición. No existe una excepción permanente por correo.

## Verificación

node --test backend/test/*.test.js
Probar con cuentas reales de cada rol: navegación, URL directa, API 403, cambios de rol con JWT antiguo y acceso a datos de otra vivienda.
Anuncios, Directorio y Reportes conservan su almacenamiento actual en el navegador; esta entrega no los migra a MySQL. Las páginas estáticas son descargables públicamente: la protección de datos del servidor se realiza en la API.

Si la migración de administrador falla, se registra como pendiente sin detener la API ni conceder privilegios. Revisar el registro de arranque y los permisos de MySQL; se reintenta al reiniciar.
