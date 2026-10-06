# Gateway local ZKTeco C3-200

Este proceso debe ejecutarse dentro de la misma LAN que el panel C3-200. No abre el puerto 4370 a Internet: el gateway consulta la API de Misión Jardines por HTTPS y después ejecuta el comando localmente.

## Variables locales

- API_BASE_URL=https://api-misionjardines.listoenlinea.host
- ZK_GATEWAY_TOKEN=el mismo token largo configurado en Hostinger
- ZKTECO_HOST=192.168.1.201
- ZKTECO_PORT=4370
- ZKTECO_COMM_PASSWORD= solo si el panel tiene clave de comunicación
- ZK_GATEWAY_POLL_SECONDS=2

La selección de puertas/salidas se configura en Hostinger con `ZKTECO_GATE_OPEN_OUTPUTS` y, solo si existe un contacto físico independiente para cierre, `ZKTECO_GATE_CLOSE_OUTPUTS`. No configures esos valores hasta confirmar en ZKAccess y físicamente qué puerta/relé mueve la pluma.

## Primera prueba

Instala Python 3.11+, ejecuta `pip install -r requirements.txt` y después `python zkteco_gateway.py`.

Para la prueba inicial conviene cerrar temporalmente el software ZKAccess del PC para evitar dos clientes simultáneos contra el panel.

Cuando el gateway reporte conectado, `GET /api/zkteco/estado` mostrará `gatewayOnline: true` y `dispositivoConectado: true`.
