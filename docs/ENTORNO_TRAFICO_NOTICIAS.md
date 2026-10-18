# Tráfico en vivo y noticias cercanas

La tarjeta **Entorno en vivo** en Inicio muestra las condiciones viales cercanas
a Misión Jardines y noticias públicas de Guadalajara y Zapopan. No consulta ni
modifica ninguna tabla de MySQL.

## Buscador de noticias y prioridad de vialidades

La tarjeta abre **Noticias** por defecto (primera pestaña, a la izquierda);
**Tráfico e incidencias** queda a la derecha y conserva el mapa al pulsarla.
La pestaña **Noticias** ofrece un buscador por palabras clave (2 a 80 caracteres).
Se consulta `GET /api/entorno/noticias?q=...` desde una sesión autenticada, con
resultados publicados en los **últimos siete días**. Al borrar la búsqueda
vuelve la cobertura predeterminada. El navegador espera 450 ms tras escribir,
aborta consultas anteriores y solo pinta la última respuesta, para evitar
resultados desordenados mientras se escribe.

La portada busca cobertura de Zapopan, Guadalajara, choques, marchas y los nombres de las
siguientes vialidades: **Calle Atotonilco, Avenida Valle de México, Avenida
Guadalajara, Avenida Acueducto, Avenida Base Aérea y Avenida Aviación**.
El backend descarta noticias sin evidencia textual de Zapopan, Guadalajara o
sus calles/barrios conocidos, y titulares que claramente sitúan los hechos en
otras ciudades (por ejemplo, Monterrey). La mención genérica a «Guadalajara»,
«Valle de México» o «aviación» no se confunde con una avenida; tampoco se toma
la autopista México–Guadalajara como ubicación local por sí sola.

El selector reserva espacio para **vialidades cercanas**, **choques, marchas,
manifestaciones y bloqueos** y **Tráfico ZMG** cuando hay notas válidas de ese
medio. Después de elegir hasta 12 artículos, **se ordenan siempre por fecha
de publicación, de más recientes a más antiguos**, sin fijar los artículos
prioritarios antiguos sobre los más recientes. Las notas de calles cercanas
se distinguen con una tarjeta verde pastel y los titulares usan un peso de
letra moderado para facilitar la lectura.

En celulares, Noticias muestra una cuadrícula compacta de **tres columnas**
con tarjetas de igual ancho, títulos de hasta cinco líneas y metadatos
reducidos sin perder contraste. En pantallas de **360 px o menos** utiliza
dos columnas para mantener los textos legibles. Las tarjetas siguen siendo
enlaces completos. En móvil, la sección **crece con todas las filas de noticias**
y utiliza el desplazamiento vertical de la página, sin recortar las últimas
tarjetas por una altura fija o por un segundo scroll interno. En escritorio
se conserva el desplazamiento interno del listado.

En celulares, la alternancia entre **Noticias** y **Tráfico e incidencias**
no usa el giro 3D: Safari de iPhone podía mostrar invertida una barra del mapa
sobre las noticias. Solo se pinta la cara seleccionada; el mapa conserva su
espacio de diseño y se actualiza al abrir Tráfico. En escritorio se conserva
la animación de volteo.

La fuente externa sigue siendo Free News API, sin nueva clave; búsquedas con
respuesta exitosa se conservan por 15 minutos, con un máximo de 40 entradas
en memoria y 15 solicitudes por usuario/minuto en el backend. La disponibilidad
de una noticia depende de que el medio haya publicado y el agregador la haya
indexado: **la búsqueda no garantiza cobertura de cada vialidad**.

## Activación del mapa de congestión

Configura **una** de estas variables en el entorno del backend de Hostinger:

- `GOOGLE_MAPS_BROWSER_API_KEY`: habilita Maps JavaScript API y restringe la
  clave por dominio/referrer al dominio real de la aplicación. Usa la capa
  `TrafficLayer` de Google Maps para pintar el tráfico vial.
- `TOMTOM_API_KEY`: alternativa cuando no hay clave de Google. El backend obtiene
  la ubicación con TomTom, carga el mapa base de OpenStreetMap y superpone
  **raster flow tiles `relative0`** (velocidad actual comparada con velocidad
  libre) de TomTom. La API key permanece en el backend: cada tesela se descarga
  mediante `/api/entorno/trafico/tesela/:zoom/:x/:y` con JWT y se conserva
  en memoria durante 60 segundos (máximo 200 entradas, hasta 120 solicitudes
  por usuario y minuto para proteger la cuota del servicio externo).

El orden de prioridad es Google Maps → TomTom → mapa básico. Si ambos servicios
fallan o no están configurados, **no se colorean calles con datos inventados**.
El enlace **Tráfico en Google Maps ↗** abre la capa de tráfico real en la web
de Google Maps, incluso sin claves del backend.

Para consultar incidencias, TomTom Traffic Incident Details requiere el parámetro
`language=es`: `es-MX` no está soportado y generaba una respuesta HTTP 400.
La reparación se realiza en el backend; no hace falta cambiar la clave en
Hostinger. Después de fusionar el PR es necesario desplegar **también el backend**
para que entre en vigor, y el frontend para activar el buscador.

Los colores de TomTom representan velocidad relativa a la habitual en ese
segmento: verde (fluido), naranja (lento) y rojo (muy lento). El tráfico es
estimado y no siempre cubre todas las calles. La leyenda solo se muestra cuando
la capa de tráfico está activada. Se consultan teselas en las inmediaciones de
Zapopan, a zoom 12–17; no se ofrece un proxy global. Las rutas requieren una
sesión válida como el resto del panel.

### Verificación después del despliegue

1. Publicar frontend y backend. Abrir Inicio como usuario autenticado.
2. En **Tráfico e incidencias** comprobar que se muestra «Tráfico en vivo» con
   proveedor Google Maps o TomTom y la leyenda. Revisar avenidas principales;
   si están fluidas pueden aparecer verdes o no destacarse en Google.
3. Si aparece «Mapa de ubicación · sin capa de tráfico», verificar las claves,
   las APIs autorizadas, las restricciones del dominio y los errores de red.
4. Abrir «Tráfico en Google Maps ↗» y verificar la capa de tráfico externa.
5. Comprobar que al abrir Inicio ya se ve **Noticias**, con las pestañas
   Noticias a la izquierda y Tráfico e incidencias a la derecha. En Noticias,
   verificar tarjetas pastel, títulos de peso medio, orden cronológico y
   desplazamiento vertical en escritorio y móvil.
6. Buscar «Aviación» y «Atotonilco», confirmar el filtro de siete días, la
   etiqueta de avenida cuando corresponda, el aviso sin resultados y el botón
   de limpiar. Buscar «Monterrey» y comprobar que no presenta resultados sin
   relación expresa con Zapopan o Guadalajara; verificar que haya más espacio
   para choques y marchas publicados por Tráfico ZMG cuando existan.

Pruebas de servidor sin red ni base de datos:

```sh
cd backend
DB_PORT=3306 node --test test/noticias-locales.test.js test/noticias-locales-ruta.test.js test/noticias-ui.test.js test/incidencias-idioma.test.js test/trafico-teselas-ruta.test.js
```
