import json
import os
import time
import urllib.error
import urllib.request
from datetime import datetime

from pyzkaccess import ZKAccess, ZK200

API=(os.getenv("API_BASE_URL") or "https://api-misionjardines.listoenlinea.host").rstrip("/")
TOKEN=os.getenv("ZK_GATEWAY_TOKEN","").strip()
HOST=os.getenv("ZKTECO_HOST","192.168.1.201").strip()
PORT=int(os.getenv("ZKTECO_PORT","4370"))
PASSWORD=os.getenv("ZKTECO_COMM_PASSWORD","").strip()
POLL_SECONDS=max(3,int(os.getenv("ZK_GATEWAY_POLL_SECONDS","3")))

if not TOKEN:
    raise SystemExit("Falta ZK_GATEWAY_TOKEN")

def api(path, method="GET", payload=None):
    data=None if payload is None else json.dumps(payload).encode("utf-8")
    request=urllib.request.Request(
        API+path,
        data=data,
        method=method,
        headers={"x-zk-gateway-token":TOKEN,"content-type":"application/json"}
    )
    try:
        with urllib.request.urlopen(request,timeout=15) as response:
            if response.status==204:
                return None
            raw=response.read().decode("utf-8")
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as exc:
        if exc.code==204:
            return None
        raw=exc.read().decode("utf-8",errors="ignore")
        raise RuntimeError(f"API HTTP {exc.code}: {raw}") from exc

def connection_string():
    return f"protocol=TCP,ipaddress={HOST},port={PORT},timeout=5000,passwd={PASSWORD}"

def connect_panel():
    zk=ZKAccess(connstr=connection_string(),device_model=ZK200)
    _=zk.parameters.serial_number
    return zk

def safe_param(obj,name):
    try:
        value=getattr(obj,name)
        return None if value is None else str(value)
    except Exception:
        return None

def heartbeat(zk=None,error=None):
    connected=zk is not None
    api("/api/zkteco/gateway/heartbeat","POST",{
        "dispositivoConectado":connected,
        "serial":safe_param(zk.parameters,"serial_number") if connected else None,
        "firmware":safe_param(zk.parameters,"firmware_version") if connected else None,
        "lockCount":len(zk.doors) if connected else None,
        "ultimoError":str(error)[:2000] if error else None
    })

def execute_gate(zk,command):
    action=command["accion"]
    outputs=[int(v) for v in command.get("salidas",[])]
    pulse=max(1,min(30,int(command.get("pulsoSegundos",3))))
    if not outputs:
        raise RuntimeError("El comando no contiene puertas")
    results=[]
    for door_number in outputs:
        index=door_number-1
        if index<0 or index>=len(zk.doors):
            raise RuntimeError(f"Puerta {door_number} fuera de rango")
        duration=pulse if action=="ABRIR" else 0
        zk.doors[index].relays.switch_on(duration)
        results.append({"puerta":door_number,"duracion":duration})
    return {"accion":action,"puertas":results}

def iso(value):
    if value is None:
        return None
    if hasattr(value,"strftime"):
        return value.strftime("%Y-%m-%d")
    text=str(value).strip()
    return text[:10] if text else None

def sync_users(zk):
    usuarios=[]
    for record in zk.table("User"):
        usuarios.append({
            "numeroTarjeta":str(record.card or "").strip(),
            "pin":str(record.pin or "").strip() or None,
            "departamento":str(record.group or "").strip() or None,
            "fechaInicio":iso(record.start_time),
            "fechaFin":iso(record.end_time)
        })
    return usuarios

def parse_date(value):
    if not value:
        return None
    return datetime.strptime(str(value),"%Y-%m-%d")

def execute_access(zk,command):
    kind=command["tipo"]
    payload=command.get("payload") or {}
    if kind=="SINCRONIZAR_USUARIOS":
        users=sync_users(zk)
        return {"usuarios":users,"total":len(users)}
    if kind=="ACTUALIZAR_VIGENCIA":
        card=str(payload.get("numeroTarjeta") or "").strip()
        if not card:
            raise RuntimeError("Número de tarjeta vacío")
        rows=list(zk.table("User").where(card=card))
        if not rows:
            raise RuntimeError(f"Tarjeta {card} no encontrada en el C3-200")
        record=rows[0]
        record.start_time=parse_date(payload.get("fechaInicio"))
        record.end_time=parse_date(payload.get("fechaFin"))
        record.save()
        return {
            "numeroTarjeta":card,
            "fechaInicio":payload.get("fechaInicio"),
            "fechaFin":payload.get("fechaFin")
        }
    raise RuntimeError(f"Comando de acceso no soportado: {kind}")

def process_gate(zk):
    item=api("/api/zkteco/gateway/comandos/siguiente")
    if not item or not item.get("data"):
        return
    command=item["data"]
    try:
        result=execute_gate(zk,command)
        api(f"/api/zkteco/gateway/comandos/{command['id']}/finalizar","POST",{"ok":True,"resultado":result})
        print("[ZK] pluma completada",command["id"],command["accion"])
    except Exception as exc:
        api(f"/api/zkteco/gateway/comandos/{command['id']}/finalizar","POST",{"ok":False,"resultado":{"message":str(exc)}})
        raise

def process_access(zk):
    item=api("/api/zkteco/gateway/accesos/siguiente")
    if not item or not item.get("data"):
        return
    command=item["data"]
    try:
        result=execute_access(zk,command)
        api(f"/api/zkteco/gateway/accesos/{command['id']}/finalizar","POST",{"ok":True,"resultado":result})
        print("[ZK] acceso completado",command["id"],command["tipo"])
    except Exception as exc:
        api(f"/api/zkteco/gateway/accesos/{command['id']}/finalizar","POST",{"ok":False,"resultado":{"message":str(exc)}})
        raise

def main():
    zk=None
    last_heartbeat=0
    while True:
        try:
            if zk is None:
                zk=connect_panel()
                print(f"[ZK] conectado a {HOST}:{PORT}; puertas={len(zk.doors)}")
            now=time.time()
            if now-last_heartbeat>=10:
                heartbeat(zk)
                last_heartbeat=now
            process_gate(zk)
            process_access(zk)
        except Exception as exc:
            print("[ZK] error",exc)
            try:
                heartbeat(None,exc)
            except Exception:
                pass
            try:
                if zk is not None:
                    zk.disconnect()
            except Exception:
                pass
            zk=None
            time.sleep(5)
        time.sleep(POLL_SECONDS)

if __name__=="__main__":
    main()
