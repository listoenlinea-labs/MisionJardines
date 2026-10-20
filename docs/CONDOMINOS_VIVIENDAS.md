# Condóminos y viviendas

El padrón representa personas en `condominos`, viviendas fijas en `direcciones` y
sus asociaciones en `condominos_viviendas`. Una persona puede tener varias viviendas
y una vivienda puede tener varias personas. Esto registra una relación con la vivienda,
no acredita propiedad legal.

## Esquema y compatibilidad

La tabla física aportada por el usuario usa `condomino_id INT UNSIGNED`,
`vivienda_id INT UNSIGNED`, clave primaria compuesta, `activo`, `creado_en` y
`actualizado_en`. Las llaves foráneas conservan las referencias con DELETE RESTRICT.
La copia fue ejecutada por el usuario y verificada mediante exportaciones del
19/oct/2026: 188 pares coincidentes y cero faltantes, con 236 viviendas distintas.
No se consultó MySQL en vivo ni se incluyeron datos personales en el repositorio.

`condominos.direccion_id` ya no forma parte del modelo ni de los servicios. La
vivienda inicial de una cuenta nueva es la primera asociación activa ordenada por ID;
Administración puede cambiar la principal de la cuenta durante la corrección sin
modificar a la persona. Ningún vínculo ausente o inactivo se recupera de la columna
heredada. La columna física se retira mediante las dos etapas SQL indicadas abajo.
`usuarios.casa_id` conserva el contexto principal; las autorizaciones de las cuentas
se siguen verificando exclusivamente contra vínculos activos en `usuarios_casas`.
No se alteran pagos, saldos, TAGs ni cuotas al cambiar asociaciones del padrón.

## Operaciones

- Padrón, conmutador, búsqueda, notificaciones de cuotas y tablero consultan las
  relaciones activas y personas activas. Las viviendas sin personas siguen existiendo.
- Gestionar vivienda permite crear un condómino o elegir una persona existente para
  vincularla explícitamente. Editar datos personales afecta a esa misma persona en
  todas sus viviendas y la pantalla lo indica. Vincular no cambia su identidad.
- Agregar una relación del padrón a una cuenta ya aceptada no concede permisos de
  login automáticamente. Sus accesos se administran desde Mis viviendas, con sus
  verificaciones y auditoría existentes.
- Crear usuarios mantiene la unicidad de `usuarios.condomino_id` y prepara un vínculo
  de cuenta inactivo por cada vivienda activa de la persona. Repetirlo conserva las
  cuentas existentes. Correo, nombre o teléfono parecidos no fusionan condóminos.
- La invitación enviada por SMTP muestra todos los domicilios. El enlace privado
  presenta todas las viviendas como texto sombreado y requiere escribir el número
  de cada una. El servidor comprueba el conjunto completo dentro de la transacción.
  Una confirmación solo de la principal no activa una cuenta con varias viviendas.
- Corregir un preregistro administra todas las viviendas seleccionadas, exige que
  incluyan la principal e invalida la invitación anterior. Los vínculos retirados se
  desactivan. Las pruebas solo admiten viviendas de pruebas y sus asociaciones se
  eliminan al borrar el conjunto ficticio, conservando las viviendas.

## Despliegue

1. Guardar respaldo y verificar la tabla intermedia. Ejecutar
   [01-preparar.sql](../backend/sql/2026-10-19-condominos-direccion-01-preparar.sql):
   permite NULL en la columna heredada. No omitirlo: el código nuevo no envía ese campo
   y fallaría al crear personas mientras la columna siga siendo obligatoria.
2. Desplegar este frontend/backend y retirar todas las instancias/trabajos antiguos.
   El código no hace ALTER TABLE automáticamente. Incluye el modelo Condomino sin el
   campo heredado y sin asociación singular casa, además de servicios de padrón/pruebas.
3. Probar con dos viviendas dedicadas a pruebas: crear una prueba, editarla marcando
   ambas y seleccionando una principal, generar enlace sin envío, abrirlo en incógnito,
   verificar todos los domicilios y confirmar ambos números. Comprobar acceso a ambas
   desde Mis viviendas y rechazo de otra vivienda no asignada.
4. Probar Reportar error, corrección, enlace reemplazado y borrado. No enviar invitaciones
   masivas como parte de esa prueba.
5. En ventana sin escrituras concurrentes, ejecutar
   [02-finalizar.sql](../backend/sql/2026-10-19-condominos-direccion-02-finalizar.sql).
   Comprueba que cada par heredado no nulo existe en la tabla intermedia (puede estar
   inactivo), descubre las FK reales y elimina la columna con sus FK salientes.
   Se detiene sin ALTER si faltan asociaciones o hay dependencias entrantes,
   FK/índices compuestos, vistas o triggers a revisar. No copia datos ni reactiva vínculos.
   ALTER TABLE confirma implícitamente; START TRANSACTION no permite deshacerlo.
6. Verificar columna_restante=0 y relaciones_huerfanas=0, y repetir alta/corrección de
   prueba. Si devuelve NO SE ELIMINO, revisar sus contadores antes de continuar.
7. Revisar las personas posiblemente duplicadas por separado antes de fusionarlas.

No hay sincronización automática que copie `direccion_id` a la tabla intermedia en
cada reinicio: eso restauraría asociaciones retiradas. Un proceso de importación externo
que escriba personas deberá escribir también sus vínculos. Revertir a código anterior
ocultaría viviendas adicionales, por lo que debe hacerse antes de utilizarlas o mediante
un plan de compatibilidad explícito. Después de retirar la columna no puede usarse
el código anterior que la seleccionaba/escribía; restaurar solo una versión compatible.

## Validación local

Desde la raíz:

```sh
DB_PORT=3306 node --test backend/test/auto-users*.test.js backend/test/residentes*.test.js backend/test/busqueda.test.js backend/test/viviendas*.test.js backend/test/auth-permissions.test.js backend/test/permissions.test.js
```

Las pruebas usan DB/SMTP simulados. Incluyen generación SQL real por Sequelize para
comprobar la tabla intermedia y filtros, confirmaciones completas, idempotencia,
corrección, conservación de accesos existentes y limpieza de pruebas. No prueban el
despliegue de Hostinger, la entrega de correo ni el C3 físico.
