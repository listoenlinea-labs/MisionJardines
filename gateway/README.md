# Gateway local ZKTeco C3-200

Este proceso debe ejecutarse dentro de la misma LAN que el panel C3-200. No abre el puerto 4370 a Internet: el gateway consulta la API de Misión Jardines por HTTPS y después ejecuta el comando localmente.

## Variables locales

- API_BASE_URL=https://api-misionjardines.listoenlinea.host
- ZK_GATEWAY_TOKEN=el mismo token largo configurado en Hostinger
- ZKTECO_HOST=192.168.1.201
- ZKTECO_PORT=4370
- ZKTECO_COMM_PASSWORD= solo si el panel tiene clave de comunicación
- ZK_GATEWAY_POLL_SECONDS=2

La selección de puertas/salidas se configura en Hostinger con ZKTECO_GATE_OUTPUTS. No configures ese valor hasta confirmar en ZKAccess qué puerta corresponde físicamente a la pluma.

## Primera prueba

Instala Python 3.11+, ejecuta `pip install -r requirements.txt` y después `python zkteco_gateway.py`.

Para la prueba inicial conviene cerrar temporalmente el software ZKAccess del PC para evitar dos clientes simultáneos contra el panel.

Cuando el gateway reporte conectado, `GET /api/zkteco/estado` mostrará `gatewayOnline: true` y `dispositivoConectado: true`.
