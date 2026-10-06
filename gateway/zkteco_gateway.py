import json
import os
import time
import urllib.error
import urllib.request

from c3 import C3, controldevice
from c3 import consts

API=(os.getenv("API_BASE_URL") or "https://api-misionjardines.listoenlinea.host").rstrip("/")
TOKEN=os.getenv("ZK_GATEWAY_TOKEN","").strip()
HOST=os.getenv("ZKTECO_HOST","192.168.1.201").strip()
PORT=int(os.getenv("ZKTECO_PORT","4370"))
PASSWORD=os.getenv("ZKTECO_COMM_PASSWORD","").strip() or None
POLL_SECONDS=max(1,int(os.getenv("ZK_GATEWAY_POLL_SECONDS","2")))

if not TOKEN:
    raise SystemExit("Falta ZK_GATEWAY_TOKEN")

def request(path, method="GET", payload=None):
    data=None if payload is None else json.dumps(payload).encode("utf-8")
    req=urllib.request.Request(
        API+path,
        data=data,
        method=method,
        headers={
            "x-zk-gateway-token":TOKEN,
            "content-type":"application/json"
        }
    )
    try:
        with urllib.request.urlopen(req, timeout=12) as response:
            if response.status==204:
                return None
            raw=response.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        if exc.code==204:
            return None
        raw=exc.read().decode("utf-8",errors="ignore")
        raise RuntimeError(f"API HTTP {exc.code}: {raw}") from exc

def connect_panel():
    panel=C3(HOST,PORT)
    if not panel.connect(PASSWORD):
        raise RuntimeError(f"No se pudo conectar al C3-200 {HOST}:{PORT}")
    return panel

def heartbeat(panel=None,error=None):
    body={
        "dispositivoConectado":bool(panel and panel.is_connected()),
        "serial":panel.serial_number if panel and panel.is_connected() else None,
        "firmware":panel.firmware_version if panel and panel.is_connected() else None,
        "lockCount":panel.nr_of_locks if panel and panel.is_connected() else None,
        "ultimoError":str(error)[:2000] if error else None,
    }
    request("/api/zkteco/gateway/heartbeat","POST",body)

def execute(panel, command):
    action=command["accion"]
    outputs=[int(v) for v in command.get("salidas",[])]
    pulse=max(1,min(30,int(command.get("pulsoSegundos",3))))
    if not outputs:
        raise RuntimeError("El comando no contiene salidas configuradas")
    # Cada salida representa un contacto momentáneo del controlador de la pluma.
    # La API cloud decide qué salida corresponde a ABRIR y cuál a CERRAR.
    duration=pulse
    results=[]
    for output in outputs:
        if output<1 or output>panel.nr_of_locks:
            raise RuntimeError(f"Salida {output} fuera de rango; el panel reporta {panel.nr_of_locks} puertas")
        cmd=controldevice.ControlDeviceOutput(
            output,
            consts.ControlOutputAddress.DOOR_OUTPUT,
            duration
        )
        panel.control_device(cmd)
        results.append({"salida":output,"duracion":duration})
    return {"accion":action,"salidas":results}

def main():
    panel=None
    last_heartbeat=0
    while True:
        try:
            if panel is None or not panel.is_connected():
                panel=connect_panel()
                print(f"[ZK] conectado a {HOST}:{PORT}; puertas={panel.nr_of_locks}")
            now=time.time()
            if now-last_heartbeat>=10:
                heartbeat(panel)
                last_heartbeat=now
            item=request("/api/zkteco/gateway/comandos/siguiente")
            if item and item.get("data"):
                command=item["data"]
                try:
                    result=execute(panel,command)
                    request(f"/api/zkteco/gateway/comandos/{command['id']}/finalizar","POST",{"ok":True,"resultado":result})
                    print("[ZK] comando completado",command["id"],command["accion"])
                except Exception as command_error:
                    request(f"/api/zkteco/gateway/comandos/{command['id']}/finalizar","POST",{"ok":False,"resultado":{"message":str(command_error)}})
                    print("[ZK] comando con error",command_error)
        except Exception as exc:
            print("[ZK] error",exc)
            try:
                heartbeat(None,exc)
            except Exception:
                pass
            try:
                if panel:
                    panel.disconnect()
            except Exception:
                pass
            panel=None
            time.sleep(5)
        time.sleep(POLL_SECONDS)

if __name__=="__main__":
    main()
