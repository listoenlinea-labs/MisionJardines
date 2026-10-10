# Pruebas automatizadas con las cuentas de prueba

## Dos comandos

Desde `backend`, con Node.js 22 y dependencias instaladas (`npm ci`):

- `npm run test:flujos`: pruebas de permisos, verificación de cuentas, viviendas, pagos, recargos, folios duplicados, entrega al C3 y OCR. Usa modelos y controlador simulados, excepto el OCR que procesa una imagen sintética con Tesseract.js. No requiere credenciales de usuarios ni un C3 conectado.
- `npm run test:usuarios`: comprueba las tres cuentas existentes contra la API configurada. Verifica sesiones, roles, vivienda vinculada y permisos tanto permitidos como denegados. Hace 19 comprobaciones cuando todas las cuentas están correctamente configuradas. No envía comprobantes, valida pagos, edita viviendas ni modifica TAGs. El inicio de sesión sí actualiza el último acceso de cada cuenta.

Esto es una selección de pruebas de regresión; no ejecuta toda la suite histórica ni comprueba visualmente el navegador. Los pagos y la escritura física de TAGs se prueban con simulación, no con el equipo de producción.

## Preparación local (Windows, Linux o macOS)

1. Usa las tres cuentas ficticias que ya creaste: CONDOMINO, SEGURIDAD y ADMINISTRADOR. Deben estar ACTIVO y con el rol correspondiente. No uses cuentas personales de residentes.
2. Vincula activamente el condómino a la vivienda ficticia desde Mis viviendas. Obtén el ID de esa vivienda en `direcciones`; no uses el número del TAG ni el número de casa como ID.
3. Copia `backend/.env.pruebas.example` a `backend/.env.pruebas` y completa sus valores. `PRUEBAS_API_URL` debe apuntar al backend e incluir `/api`, por ejemplo `https://backend.example/api`. No pongas la URL de GitHub Pages. No hacen falta las credenciales de MySQL.
4. Abre una terminal en `backend` y ejecuta `npm run test:flujos`, seguido de `npm run test:usuarios`.
5. Revisa los mensajes OK/FALLO. El resultado local se guarda en `backend/reports/pruebas-usuarios.json`. Un fallo termina con código 1; un problema de configuración o conexión también. Las contraseñas, correos, tokens y datos de viviendas no se guardan en el informe.

La configuración completa se valida antes de iniciar sesión; HTTPS es obligatorio salvo localhost. No se siguen redirecciones. No se reintentan inicios de sesión automáticamente para evitar multiplicar solicitudes. Si falla el inicio de sesión, se omiten las comprobaciones de esa cuenta. Si el condómino no tiene vinculada la vivienda indicada, se detienen sus comprobaciones posteriores.

## GitHub Actions

El workflow **Pruebas de cuentas y pagos** ejecuta `test:flujos` en los PR que cambian el backend o los permisos compartidos. No usa secretos para esa parte.

Para comprobar las cuentas del servidor:

1. En Settings → Environments crea el entorno `pruebas`.
2. Agrega las variables `PRUEBAS_API_URL` y `PRUEBAS_CASA_ID` al entorno.
3. Agrega como secretos del entorno los seis valores de correo/clave del archivo de ejemplo: `PRUEBAS_CONDOMINO_CORREO`, `PRUEBAS_CONDOMINO_CLAVE`, `PRUEBAS_SEGURIDAD_CORREO`, `PRUEBAS_SEGURIDAD_CLAVE`, `PRUEBAS_ADMINISTRADOR_CORREO` y `PRUEBAS_ADMINISTRADOR_CLAVE`.
4. Tras hacer merge, ve a Actions → Pruebas de cuentas y pagos → Run workflow. Selecciona `main` y activa **Comprobar cuentas de prueba en el servidor configurado**.
5. Revisa el job `cuentas-servidor`. El informe se publica como artefacto durante siete días si la ejecución llegó a generarlo.

Las cuentas del servidor solo se usan en una ejecución manual desde `main`, después de aprobarse las pruebas simuladas. Los PR no reciben estos secretos.

## Alcance de pagos y ZKTeco

Las regresiones cubren el cálculo desde la fecha física, mensualidad de $300, recargos de $50 por cortes vencidos, adelantos sin recargo, remanentes, fechas distintas entre TAGs, folios repetidos y reintentos tras fallos de escritura. El flujo de carga conserva la validación administrativa y no activa accesos antes de validar. Este sistema no cambia las banderas de producción ni crea o elimina cuentas o pagos.

Para una comprobación con TAG físico, sigue usando una vivienda y TAG dedicados, un folio nuevo y la revisión administrativa. La prueba automatizada de cuentas no demuestra por sí sola que una pluma abra.
