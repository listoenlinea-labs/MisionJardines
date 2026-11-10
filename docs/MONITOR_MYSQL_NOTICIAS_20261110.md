# Monitor preventivo MySQL y noticias sin API key (10-nov-2026)

## Indicador de Inicio
- Solo aparece para ADMINISTRADOR y SUPER_ADMIN, en el extremo derecho de la barra superior.
- El endpoint `GET /api/monitor/mysql` exige JWT válido con rol de administración y **no ejecuta consultas SQL** para actualizar el medidor.
- Se revisa cada 60 segundos. Instrumenta `beforeConnect` (intentos de nueva conexión física) y `beforeQuery` (consultas de este proceso Node), agregados por minuto.
- El backend intenta leer `SHOW GRANTS` **una sola vez al iniciar** para conocer `MAX_CONNECTIONS_PER_HOUR` / `MAX_QUERIES_PER_HOUR` del usuario, cuando MySQL expone esos permisos.
- Si Hostinger no expone el límite, se puede indicar en Hostinger (backend, variables de entorno) `MYSQL_CONNECTIONS_PER_HOUR_LIMIT` y/o `MYSQL_QUERIES_PER_HOUR_LIMIT` con los límites reales que muestre hPanel o el error 1226. No poner valores arbitrarios; reiniciar para que se lean.
- El medidor indica **saldo estimado, no exacto**: MySQL no expone por una API estándar el saldo restante de las cuotas por cuenta de Hostinger. No contempla otros procesos, phpMyAdmin ni conexiones anteriores al reinicio. Si no se conoce el límite, muestra «Sin cuota / Límite no disponible» en lugar de fingir un saldo.
- Colores: verde/naranja/rojo según estimación. Es alerta preventiva, no cortacircuitos SQL y no garantiza evitar el bloqueo. Se redujo el reciclado del pool Sequelize: max 6, min 1, idle 120 segundos.
- Una caída temporal/503 durante la validación de sesión de Inicio **no elimina la sesión**. Solo las respuestas 401/403 fuerzan nuevo inicio.

## Noticias de Zapopan / Guadalajara
- FreeNewsApi exige token desde el 1 de noviembre de 2026. Sin credenciales no hacer llamadas que devuelven 401.
- Fuentes de respaldo: RSS de Google Noticias México para Zapopan, accidentes Guadalajara y vialidades cercanas (ventana de 7 días, fecha editorial real), sin API key y sin consultas MySQL adicionales para leer noticias externas.
- Opcional: definir `FREENEWSAPI_KEY` o `FNA_KEY` en Hostinger, **solo en backend**, para seguir usando FreeNewsApi. El backend envía `Authorization: Bearer ...`; nunca envía la llave al frontend.
- Si FreeNewsApi falla, el backend consulta automáticamente Google Noticias RSS.
- Se mantiene el filtrado de localidad y la deduplicación del módulo existente. Google Noticias puede no aportar imágenes originales; se utiliza la ilustración neutral ya implementada en frontend. No inventar fotografías.
- El contenido del feed depende de una fuente externa. Si RSS está temporalmente inaccesible, se conserva el mensaje de error y reintento.

## Verificación
`cd backend && node --test test/mysql-noticias-rss-20261110.test.js test/noticias-rss-fallback-20261110.test.js test/noticias-locales-ruta.test.js`

Verificar después del despliegue: administrador ve medidor sin consultar la base; un usuario Seguridad recibe 403 en el endpoint; Inicio no borra el token si MySQL responde 503; noticias cargan sin `FNA_KEY` y no generan 401; abrir la tarjeta de noticia desde Safari.
