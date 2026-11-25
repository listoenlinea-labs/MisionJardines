# Recuperación de infraestructura (piloto)

La tarea existente de VirtualBox no se reemplaza. El panel se limita a ADMINISTRADOR y SUPER_ADMIN en Inicio y API. No se abren puertas ni se escriben TAGs, ni se reinician servicios activos. La IP se aprende mediante HTTPS saliente; no se utiliza la API administrativa de Hostinger. El backend conserva la dirección verificada en memoria, la vuelve a aprender al reiniciar y registra eventos en logs. El panel guarda los últimos 20 eventos en memoria, no es auditoría durable. Si el agente deja de reportar durante 3 minutos, el modo dinámico suspende las conexiones C3 hasta recuperar un reporte válido (los TAG existentes no se alteran).

## Despliegue en etapas

1. Fusionar y desplegar frontend y backend. Mantener INFRA_DYNAMIC_ZKTECO=false. Crear token dedicado aleatorio de 32 bytes como mínimo (por ejemplo 64 caracteres hex), en Hostinger INFRA_AGENT_TOKEN; no reutilizar JWT ni publicar en Git. Obtener la serie exacta del C3 desde la etiqueta o el diagnóstico existente y configurar INFRA_C3_SERIAL. No activar aún el modo dinámico.
2. Copiar agente.ps1 a C:\MisionJardines\infraestructura.ps1 y crear infraestructura.json allí, con la plantilla siguiente. Restringir los permisos NTFS del directorio y archivos: solo administradores, SYSTEM y cuenta propietaria de VirtualBox; el guardia no debe poder alterar scripts ni token. No enviar token por chat ni correo.

```json
{
  "api": "https://api-misionjardines.listoenlinea.host/api",
  "token": "REEMPLAZAR_LOCALMENTE",
  "zkLocal": "192.168.1.201",
  "ubuntu": "192.168.1.167",
  "sshKey": "",
  "knownHosts": ""
}
```

3. En el Programador de tareas crear una segunda tarea con el mismo usuario que registró VirtualBox, al inicio, retraso 1 minuto, repetir cada 1 minuto indefinidamente, no iniciar otra instancia, ejecutar aunque no haya sesión; acción powershell.exe con argumentos -NoProfile -NonInteractive -ExecutionPolicy RemoteSigned -File "C:\MisionJardines\infraestructura.ps1". Probar manualmente y después sin iniciar sesión. El modo S4U que funciona para VirtualBox puede restringir recursos de red: comprobar realmente el HTTPS saliente; si falla, usar una cuenta de servicio local con credenciales almacenadas y acceso controlado a la VM, tras una instalación planificada. Revisar infraestructura.log e Inicio. No deshabilitar el firewall.
4. Opcional pero requerido para diagnóstico y recuperación de servicios Ubuntu: generar en Windows una llave SSH exclusiva para esta tarea (sin contraseña interactiva, protegida por ACL), guardar su ruta privada en sshKey y un archivo knownHosts validado presencialmente con la huella del servidor en knownHosts. Instalar los dos scripts sh como root:root 0755 en las rutas indicadas. En authorized_keys de vboxuser agregar únicamente la nueva clave pública con prefijo restrict,command="/usr/local/sbin/mj-infra-ssh" (no sustituir claves existentes). Con visudo, conceder solo vboxuser ALL=(root) NOPASSWD: /usr/local/sbin/mj-infra-ubuntu recover. No conceder sudo general. Probar status y recover por SSH con esa llave, y comprobar rechazo de cualquier otra orden. La opción recover solo inicia servicios inactivos. La VM puede tardar en arrancar; si los servicios aún no responden, la orden informa fallo y se puede reintentar.
5. Cuando Inicio muestre agente en línea, configurar INFRA_DYNAMIC_ZKTECO=true y redeplegar una vez. El agente debe reportar una IPv4 pública coincidente con req.ip observado por Hostinger; si falla verificar proxy y salida IPv4, no relajar la validación. Hostinger debe normalizar X-Forwarded-For y no exponer Node directamente. Se valida protocolo C3 y serie antes de cambiar host. Mantener ZKTECO_DIRECT_PORT y el port forwarding actual. La serie se comprueba en cada sesión C3 en modo dinámico. Si el agente no confirma el puerto local, o la IP no responde desde Hostinger, no se cambia a un destino sin verificar.
6. Probar llamadas, ZKTeco mediante diagnóstico de solo lectura, reinicio controlado sin iniciar sesión, luego recuperación desde datos móviles y verificar que cambie la IP únicamente tras comprobación. Los botones no certifican audio, PSTN ni apertura física. El Grandstream queda sin verificar en este piloto (no se usa ping como prueba definitiva). La acción ZKTeco confirma TCP local; el estado separado del C3 desde Hostinger es la evidencia de reconexión.
7. Rollback: actualizar ZKTECO_DIRECT_HOST con la IP pública correcta, poner INFRA_DYNAMIC_ZKTECO=false, redesplegar. Deshabilitar solo la tarea de infraestructura si es necesario; no tocar la tarea de VirtualBox ni los servicios actuales.

Limitaciones: instancia única de Node; al reiniciar se pierde el historial/cola y la IP se reaprende con el próximo reporte. Requiere instalación local, credencial de agente y serie verificada; no está probado en el hardware ni en Hostinger. Si Telmex aplica CGNAT o se pierde el reenvío del puerto, actualizar IP no basta. Evolución recomendada: agente local/túnel autenticado que elimine exposición del puerto C3.
