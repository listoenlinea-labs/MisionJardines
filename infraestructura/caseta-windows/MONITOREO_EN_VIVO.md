# Monitoreo en vivo de Infraestructura (instalación adicional)
No sustituir ni detener la tarea **Recuperar Conmutador Mision Jardines**. El monitor es una segunda tarea pasiva, no inicia servicios ni consume órdenes de recuperación. Se requiere desplegar backend y frontend primero. El modo antiguo sigue enviando reportes; se indica como periódico mientras no llegue la primera muestra del nuevo monitor.

## Ubuntu (primero)
Descargar ubuntu-infra.sh y ubuntu-forced-command.sh de la revisión fusionada, verificar contenido y guardar en /tmp. Instalar con sudo install -o root -g root -m 755 hacia /usr/local/sbin/mj-infra-ubuntu y /usr/local/sbin/mj-infra-ssh respectivamente. Antes de actualizar el comando forzado, editar con sudo visudo -f /etc/sudoers.d/mj-infraestructura y dejar exactamente:
```
vboxuser ALL=(root) NOPASSWD: /usr/local/sbin/mj-infra-ubuntu status, /usr/local/sbin/mj-infra-ubuntu recover
```
Validar sudo visudo -c. Solo se autorizan esos dos comandos fijos, no shell ni sudo general. Probar status desde Windows con la llave existente; debe mostrar CLI y contactos sin contraseña. Probar id (exit 2). No cambiar authorized_keys.

## Windows (después)
Descargar agente.ps1 de la revisión fusionada a C:\MisionJardines\monitor-infraestructura.ps1 y descargar instalar-monitor.ps1 a C:\MisionJardines\instalar-monitor.ps1. Mantener la ACL restringida del directorio y el JSON actual; no imprimir el token. Ejecutar en PowerShell elevado:
```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\MisionJardines\instalar-monitor.ps1"
```
El instalador conserva el principal S4U de la tarea existente. Si no usa S4U, no registra la tarea. La nueva tarea arranca con Windows, se mantiene ejecutando y no permite instancias duplicadas. Revisar Get-ScheduledTask -TaskName "Monitoreo Infraestructura Mision Jardines"; Running es normal. En Infraestructura debe aparecer En vivo tras el primer reporte. Actualizar estado solicita UUID nuevo; espera confirmación de una muestra posterior, no inicia servicios. Si no llega, muestra error. La muestra local suele tomarse cada 10 s si la red responde; IP consultada cada 60 s o tras HTTP 422; C3 remoto sigue limitado a verificación periódica, cambio de IP y solicitud manual con intervalo mínimo 45 s; la lectura completa de inventario sigue bajo Reintentar conexión ZKTeco. No equivale a confirmar audio ni apertura física.

## Pruebas y rollback
Sin detener servicios de producción, comprobar estado y botón; verificar que el reporte se actualice sin ejecutar tarea manual. Probar monitor detenido: después de 30 s se debe indicar comunicación interrumpida, sin mostrar estados locales antiguos como activos. Recuperación existente sigue independiente. Restaurar el monitor con Start-ScheduledTask. Para desactivar monitor, Stop-ScheduledTask y Disable-ScheduledTask de la nueva tarea; el agente de recuperación sigue operativo y el panel indica interrupción del monitor hasta reinstalarlo. El diagnóstico C3 muestra la fecha real, no se realizan lecturas de inventario cada 10 s. No cambiar variables Hostinger ni llave. La instalación no se ha validado físicamente.
