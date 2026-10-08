# Diagnóstico seguro: Gardenias 5 «No confirmado en C3»
## Qué significa
La pantalla utiliza `zk_tarjetas.en_controlador`, un reflejo local del inventario C3.
`false` NO prueba que la credencial fuera eliminada físicamente. El lector podía
marcarla `false` tras UNA lectura parcial. Tampoco hay equivalencia entre «presente
en user» y «autorizado en userauthorize»: un tag bloqueado puede seguir existiendo.

## Corrección
- Interpretar campos por nombre independientemente de mayúsculas y guiones
  (p. ej. `CardNo`, `CARD_NO`, `CardNumber`).
- Una coincidencia positiva con `user.CardNo` confirma `en_controlador=true`
  aunque estuviera previamente en false. Un registro que NO aparezca en una sola
  lectura NO se elimina ni se pone en false.
- Si el C3 responde 0 usuarios pero existen credenciales locales, rechazar la
  lectura y mantener estados. Si no hay números de tarjeta identificables,
  rechazar también. Con `userauthorize` inaccesible o inesperadamente vacío,
  preservar los bloqueos locales, sin afirmar cambios.
- Si `StartTime` o `EndTime` no se lee, conservar la última fecha guardada.
- Botón **Comprobar C3** por casa: GET
  `/api/zkteco/diagnostico/viviendas/:id` (solo SUPER_ADMIN,
  ADMINISTRADOR, MESA_DIRECTIVA). Consulta `user` y `userauthorize`
  directamente, muestra serie, número de filas físicas y estado de cada tag.
  La consulta NO escribe, no crea credenciales, no desbloquea puertas.
- El refresco sigue siendo automático y manual; si un tag está realmente en la
  lectura, la conciliación positiva lo restaura visualmente. Las discrepancias
  permanecen explícitas y se requiere diagnóstico cuando la lectura no prueba presencia.

## Comprobación en producción (después del merge)
1. Publicar backend en Hostinger y reiniciar Node; desplegar docs en GitHub Pages.
2. Entrar como Administrador a ZKTeco, buscar **Gardenias 5** y pulsar
   **Comprobar C3** sin usar Agregar ni Eliminar.
3. Verificar que **serie C3** corresponda al C3-200 real, y que los 4 números
   210073, 3277920, 5112343 y 9917503 estén en la tabla user del panel.
4. Comprobar qué credenciales tienen `userauthorize` y cuál es la fecha final
   efectiva `EndTime`. «Presente sin autorización» es un bloqueo, no ausencia.
5. Si los cuatro aparecen como presentes, pulsar **Sincronizar ZKTeco**:
   el reflejo local se volverá a confirmar sin agregar duplicados.
6. Si la serie es inesperada, usuarios=0 o ninguno aparece: verificar
   `ZKTECO_DIRECT_HOST`, `ZKTECO_DIRECT_PORT`, el túnel/conexión TCP,
   la tabla física de usuarios en ZKAccess y los logs del backend. NO usar
   «Agregar en C3» sobre un tag potencialmente existente, ni cambiar
   `en_controlador` a true manualmente sin prueba física.

### Consulta de inspección sin escritura
```sql
SELECT d.id AS casa_id, d.calle, d.numero, z.numero_tarjeta,
       z.en_controlador, z.bloqueado, z.ultima_lectura, z.fecha_fin,
       z.pin_dispositivo
FROM u327351184_fracc_mj.direcciones d
LEFT JOIN u327351184_fracc_mj.zk_tarjetas z ON z.casa_id = d.id
WHERE d.calle = 'Gardenias' AND d.numero = '5'
ORDER BY z.numero_tarjeta;
```
La columna `en_controlador` es cache local: solo las lecturas directas
del C3 prueban presencia. No ejecutar UPDATE para hacerlas parecer activas.

## Pruebas
- Escenario simulado con los 4 números de Gardenias 5 presentes en USER,
  algunos sin autorización: presencia y bloqueo separados.
- Inventario parcial de 1/4: los otros 3 no se degradan a ausentes.
- Inventario vacío sospechoso: lectura rechazada sin modificar SQL.
- Campos `END_TIME` ausentes: no borrar la vigencia local.
- Tabla `userauthorize` vacía: no bloquear masivamente.
- Diagnóstico: solo lectura, no muta SQL ni C3.

No hay conexión desde el desarrollo a la red del dispositivo de producción:
las pruebas simuladas no confirman que actualmente estén los cuatro TAGs en
el C3. Esa comprobación se hace con el modal y el número de serie.
