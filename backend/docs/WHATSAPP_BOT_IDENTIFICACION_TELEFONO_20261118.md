# WhatsApp — identificación automática por teléfono registrado

## Qué cambia
- Se toma el remitente `message.from` del webhook de WhatsApp firmado por Meta y se normaliza al formato internacional para buscarlo en `usuarios.telefono`. Para México se consideran variantes `52`, `521` y los 10 dígitos, como hace el servicio existente `telefono-cuenta.service.js`.
- **Coincidencia única, usuario activo, rol CONDOMINO y una sola asociación activa en `usuarios_casas`:** no pedir calle ni número de casa para consultar adeudos, registrar pagos o visitas ni reservar Casa Club. La vivienda se resuelve en el backend.
- **Vínculo de WhatsApp aún vigente (24 horas):** continúa directamente con los trámites autorizados. Si no existe o venció, la persona abre una vez el enlace HTTPS de acceso y pone correo/contraseña allí, nunca en WhatsApp. La página selecciona automáticamente la única vivienda asociada. Después, botón «Ya ingresé» en el chat.
- **Más de una vivienda o número duplicado:** nunca seleccionar arbitrariamente una casa. Para números registrados se ofrece inicio de sesión seguro, con selección de la vivienda autorizada en la página HTTPS si corresponde.
- **Número no encontrado en `usuarios`:** para Casa Club sigue el flujo de calles/número; para Adeudos, Pagos y Visitas ahora pregunta calle y número y luego exige comprobar que el usuario tenga permisos sobre esa vivienda. Conocer el domicilio nunca concede acceso.
- Adeudos: se genera un PDF **privado** con desglose por período/concepto y total para mantenimiento, cuotas extraordinarias y Casa Club, más las instrucciones bancarias oficiales.
- Pago: conserva las opciones de Mantenimiento, Proyectos y Casa Club, OCR y conciliación Titan. Una fotografía sola no acredita el pago.
- Visitas: continúa utilizando el controlador real y la casa del usuario autorizado.

## Privacidad
**Un teléfono registrado NO es una contraseña.** El número puede perderse, reasignarse o compartirse. Ningún saldo, fecha vinculada a una casa, recibo privado ni autorización de acceso se entrega únicamente por coincidencia telefónica. La vinculación segura comprueba Usuario activo, rol, UsuarioCasa, sesionVersion y caducidad; se puede cerrar escribiendo CERRAR SESION.

Si `usuarios.telefono` no es único, el usuario está suspendido o no tiene una relación activa con `usuarios_casas`, el bot **no** revela ni inventa su vivienda. Se requiere acceso legítimo y en algunos casos asistencia de Administración.

## Despliegue
1. Sin SQL nuevo, ni variables nuevas de Hostinger: fusionar PR y desplegar backend Node.js.
2. Probar con número `52` / `521` registrado a una única vivienda. Desde WhatsApp enviar Menú → Reservar Casa Club → seleccionar fecha: debe pasar al reglamento si está vinculado; si no, pedir **solo inicio de sesión HTTPS**, no domicilio.
3. Probar Menú → Revisar mis deudas: enviar PDF exclusivamente al vínculo validado; revisar los tres conceptos.
4. Probar Menú → Reportar pago y Menú → Registrar visita, sin preguntas de calle/casa para cuenta autorizada.
5. Probar número desconocido: debe preguntar dirección y requerir autenticación antes de permitir consultas o visitas.
6. Probar teléfono duplicado y usuario con varias casas: sin selección automática insegura.
7. Comprobar enlace de sesión expirado, usuario suspendido, vivienda desvinculada y contraseña cambiada: negar información privada.
8. Hacer pruebas controladas en Hostinger/WhatsApp antes de ofrecer el flujo a los residentes; no se ha realizado un ensayo completo con Meta/Titan desde este PR.

## Alcance
Este PR **no elimina** los requisitos de verificación empresarial de Meta para publicar el calendario WhatsApp Flow. La opción de escribir fecha sigue disponible si el Flow no puede publicarse.
