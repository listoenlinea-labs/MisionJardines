# Guardar teléfono y correo desde el visor de recibos (04-nov-2026)

## Cambios
- El modal **Generar recibo** de Mantenimiento y Cuotas extraordinarias muestra botones **Guardar teléfono** y **Guardar correo** junto a los campos.
- Si el residente dicta un dato, el administrador puede guardarlo **explícitamente** para no volver a solicitarlo en recibos posteriores. **Enviar por WhatsApp** o **Enviar por correo** no guarda automáticamente la información.
- Se guarda de forma independiente el teléfono en `direcciones.telefono` (12 dígitos, con prefijo 52) y el email en `direcciones.correo` (máximo 150 caracteres), columnas que ya existen. No se modifican `usuarios`, `condominos`, cuotas, recibos ni TAGs.
- Los datos guardados de la vivienda tienen prioridad en el modal. Si no existen, se consultan los contactos vinculados de los residentes como hasta ahora.
- Los botones guardan mediante `PATCH /api/finanzas/viviendas/:casaId/contacto-recibo/:campo`, protegido por `autenticarToken` y `autorizarRoles('SUPER_ADMIN','ADMINISTRADOR')`. Un solo campo por petición, validación servidor y reporte de errores.
- Una confirmación de **Recibo enviado correctamente** aparece **en el centro de la pantalla**, sobre el modal, durante **4.2 segundos**, mostrando el correo de destino. Se presenta únicamente cuando el backend responde `enviado: true`, tras la aceptación SMTP. No se muestra en fallos.
- Envío y SMTP quedan intactos; el backend usa las variables Gmail separadas `MJ_GMAIL_SMTP_*` para recibos y conserva `SMTP_*` para otros correos de Listo en Línea.

## Comprobación rápida
1. Abrir recibo de una vivienda sin teléfono ni correo; escribir cada dato y pulsar **Guardar** junto a su campo. Esperar confirmación de guardado.
2. Cerrar y volver a abrir el recibo: deben aparecer ambos datos, incluso si existen otros usuarios vinculados.
3. Cambiar el correo solo para un envío sin presionar Guardar; el siguiente recibo debe conservar el correo registrado, no el temporal.
4. Enviar un recibo de prueba por correo; debe aparecer el aviso centrado durante unos cuatro segundos. Un fallo SMTP nunca debe mostrar ese aviso.
5. Verificar en MySQL las columnas de la casa, si hiciera falta: `SELECT id,calle,numero,telefono,correo FROM direcciones WHERE id = <casa_id>;`

**No requiere migraciones SQL ni variables nuevas de Hostinger.** Desplegar frontend de GitHub Pages y backend de Hostinger juntos para que el botón pueda conectarse a la nueva ruta. Confirma con el residente que autoriza guardar sus datos de contacto; no guardes números o correos de terceros sin verificar el destino.
