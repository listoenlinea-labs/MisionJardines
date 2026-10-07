#!/usr/bin/env python3
"""
Administrador automático del ZKTeco PullSDK Bridge para Windows.

- Actualiza main.
- Compila el bridge win-x86.
- Copia las DLL del PullSDK.
- Genera BRIDGE_TOKEN solo en la primera ejecución.
- Reinicia el bridge y un Cloudflare Quick Tunnel.
- Detecta la URL *.trycloudflare.com.
- Actualiza Hostinger Node.js env vars de forma segura.
- Valida bridge local y público.

No requiere paquetes Python externos.
"""
from __future__ import annotations

import argparse
import getpass
import json
import os
import re
import secrets
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Any
from urllib import error, request

if os.name != "nt":
    raise SystemExit("Este administrador está diseñado para Windows.")

TOOL_DIR = Path(__file__).resolve().parent
REPO_ROOT = TOOL_DIR.parent.parent
BACKEND_DIR = REPO_ROOT / "backend"
STATE_DIR = TOOL_DIR / ".bridge-manager"
CONFIG_PATH = STATE_DIR / "config.json"
RUNTIME_PATH = STATE_DIR / "runtime.json"
LOG_DIR = STATE_DIR / "logs"
PUBLISH_DIR = TOOL_DIR / "publish"
PUBLISH_NEXT = TOOL_DIR / "publish-next"
PUBLISH_BACKUP = TOOL_DIR / "publish-backup"
CSPROJ = TOOL_DIR / "ZktecoPullSdkBridge.csproj"

HOSTINGER_BASE = "https://developers.hostinger.com"
DEFAULT_DOMAIN = "api-misionjardines.listoenlinea.host"
DEFAULT_C3_HOST = "192.168.1.201"
DEFAULT_C3_PORT = "4370"
DEFAULT_BRIDGE_URL = "http://127.0.0.1:5098"
BRIDGE_ENV_KEYS = {
    "ZKTECO_PULLSDK_BRIDGE_URL",
    "ZKTECO_PULLSDK_BRIDGE_TOKEN",
    "ZKTECO_PULLSDK_BRIDGE_TIMEOUT_MS",
}
URL_RE = re.compile(r"https://[a-z0-9-]+\.trycloudflare\.com", re.I)


class ManagerError(RuntimeError):
    pass


def banner(title: str) -> None:
    print("\n" + "=" * 72)
    print(title)
    print("=" * 72)


def run(cmd: list[str], *, cwd: Path | None = None, check: bool = True,
        capture: bool = False, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    shown = " ".join(f'"{x}"' if " " in x else x for x in cmd)
    print(f"> {shown}")
    cp = subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        check=False,
        text=True,
        capture_output=capture,
        env=env,
    )
    if check and cp.returncode != 0:
        detail = (cp.stderr or cp.stdout or "").strip()
        raise ManagerError(f"Falló el comando ({cp.returncode}): {shown}\n{detail}")
    return cp


def powershell(script: str, *, stdin: str = "", check: bool = True) -> str:
    cp = subprocess.run(
        ["powershell", "-NoProfile", "-NonInteractive", "-Command", script],
        input=stdin,
        text=True,
        capture_output=True,
        check=False,
    )
    if check and cp.returncode != 0:
        raise ManagerError((cp.stderr or cp.stdout or "PowerShell falló").strip())
    return cp.stdout.strip()


def protect_secret(value: str) -> str:
    # ConvertFrom-SecureString usa DPAPI del usuario actual cuando no se pasa una key.
    ps = (
        "$v=[Console]::In.ReadToEnd();"
        "$s=ConvertTo-SecureString $v -AsPlainText -Force;"
        "ConvertFrom-SecureString $s"
    )
    return powershell(ps, stdin=value)


def unprotect_secret(value: str) -> str:
    ps = (
        "$s=ConvertTo-SecureString ([Console]::In.ReadToEnd());"
        "[Net.NetworkCredential]::new('', $s).Password"
    )
    return powershell(ps, stdin=value)


def ensure_dirs() -> None:
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    LOG_DIR.mkdir(parents=True, exist_ok=True)


def save_json(path: Path, data: dict[str, Any]) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")


def load_json(path: Path) -> dict[str, Any]:
    if not path.exists():
        return {}
    return json.loads(path.read_text(encoding="utf-8"))


def ask(prompt: str, default: str | None = None) -> str:
    suffix = f" [{default}]" if default else ""
    value = input(f"{prompt}{suffix}: ").strip()
    return value or (default or "")


def yes_no(prompt: str, default: bool = False) -> bool:
    suffix = " [S/n]" if default else " [s/N]"
    value = input(prompt + suffix + ": ").strip().lower()
    if not value:
        return default
    return value in {"s", "si", "sí", "y", "yes"}


def parse_dotenv(path: Path) -> dict[str, str]:
    result: dict[str, str] = {}
    if not path.exists():
        return result
    for raw in path.read_text(encoding="utf-8", errors="replace").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip()
        value = value.strip()
        if not key:
            continue
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        result[key] = value
    return result


HOSTINGER_USER_AGENT = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/154.0.0.0 Safari/537.36"
)


def _parse_api_body(raw: str) -> Any:
    if not raw:
        return {}
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return {"raw": raw}


def _hostinger_request_curl(method: str, path: str, api_token: str,
                            payload: dict[str, Any] | None = None) -> Any:
    curl = shutil.which("curl.exe") or shutil.which("curl")
    if not curl:
        raise ManagerError(
            "Cloudflare bloqueó el cliente HTTP de Python y no encontré curl.exe para usar el fallback."
        )

    marker = "__HOSTINGER_HTTP_STATUS__:"
    cmd = [
        curl,
        "--silent",
        "--show-error",
        "--location",
        "--request", method,
        "--header", f"Authorization: Bearer {api_token}",
        "--header", "Accept: application/json",
        "--header", f"User-Agent: {HOSTINGER_USER_AGENT}",
        "--write-out", f"\\n{marker}%{{http_code}}",
        HOSTINGER_BASE + path,
    ]
    stdin_data = None
    if payload is not None:
        cmd.extend([
            "--header", "Content-Type: application/json",
            "--data-binary", "@-",
        ])
        stdin_data = json.dumps(payload)

    cp = subprocess.run(
        cmd,
        input=stdin_data,
        text=True,
        capture_output=True,
        check=False,
    )
    output = cp.stdout or ""
    if marker not in output:
        detail = (cp.stderr or output or "curl.exe no devolvió un estado HTTP").strip()
        raise ManagerError(f"Hostinger API vía curl falló: {detail}")

    raw, status_text = output.rsplit(marker, 1)
    raw = raw.rstrip("\r\n")
    try:
        status = int(status_text.strip())
    except ValueError as exc:
        raise ManagerError(f"Estado HTTP inválido devuelto por curl: {status_text!r}") from exc

    if cp.returncode != 0 or status >= 400:
        detail = raw or (cp.stderr or "").strip()
        raise ManagerError(f"Hostinger API HTTP {status}: {detail}")
    return _parse_api_body(raw)


def hostinger_request(method: str, path: str, api_token: str,
                      payload: dict[str, Any] | None = None) -> Any:
    body = None
    headers = {
        "Authorization": f"Bearer {api_token}",
        "Accept": "application/json",
        "User-Agent": HOSTINGER_USER_AGENT,
    }
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = request.Request(HOSTINGER_BASE + path, data=body, headers=headers, method=method)
    try:
        with request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8", errors="replace")
            return _parse_api_body(raw)
    except error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        # Hostinger está detrás de Cloudflare. Algunas versiones de Python/urllib
        # pueden disparar Error 1010 (browser_signature_banned). En ese caso
        # repetimos la solicitud con curl.exe, que además coincide con los
        # ejemplos oficiales de la API de Hostinger.
        if exc.code == 403 and (
            '"error_code":1010' in raw.replace(" ", "")
            or "browser_signature_banned" in raw
            or "Error 1010" in raw
        ):
            print("Hostinger bloqueó urllib (Cloudflare 1010); reintentando con curl.exe...")
            return _hostinger_request_curl(method, path, api_token, payload)
        raise ManagerError(f"Hostinger API HTTP {exc.code}: {raw or exc.reason}") from exc
    except error.URLError as exc:
        raise ManagerError(f"No se pudo conectar con Hostinger API: {exc.reason}") from exc


def hostinger_env_path(username: str, domain: str) -> str:
    return f"/api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/builds/settings/env"


def hostinger_restart_path(username: str, domain: str) -> str:
    return f"/api/hosting/v1/accounts/{username}/websites/{domain}/nodejs/server/restart"


def remote_env_keys(api_token: str, username: str, domain: str) -> set[str]:
    data = hostinger_request("GET", hostinger_env_path(username, domain), api_token)
    if not isinstance(data, list):
        raise ManagerError(f"Respuesta inesperada al leer variables Hostinger: {data!r}")
    return {str(item.get("key", "")).strip() for item in data if item.get("key")}


def build_production_env_cache(api_token: str, username: str, domain: str,
                               bridge_token: str) -> dict[str, str]:
    banner("PRIMERA CONFIGURACIÓN DE VARIABLES DE HOSTINGER")
    keys = remote_env_keys(api_token, username, domain)
    print(f"Hostinger reporta {len(keys)} variables configuradas.")
    local = parse_dotenv(BACKEND_DIR / ".env")
    use_local = False
    if local:
        covered = len(keys.intersection(local))
        print(f"Encontré backend/.env local con {covered}/{len(keys)} claves de Hostinger.")
        use_local = yes_no(
            "¿Usar los valores de backend/.env como base? "
            "Úsalo solo si esos valores corresponden a producción",
            default=False,
        )

    env: dict[str, str] = {}
    for key in sorted(keys):
        if key in BRIDGE_ENV_KEYS:
            continue
        if use_local and key in local:
            env[key] = local[key]
            continue
        env[key] = getpass.getpass(f"Valor de producción para {key} (no se mostrará): ")

    env["ZKTECO_PULLSDK_BRIDGE_URL"] = "PENDING_QUICK_TUNNEL"
    env["ZKTECO_PULLSDK_BRIDGE_TOKEN"] = bridge_token
    env["ZKTECO_PULLSDK_BRIDGE_TIMEOUT_MS"] = (
        local.get("ZKTECO_PULLSDK_BRIDGE_TIMEOUT_MS", "30000") if use_local else "30000"
    )
    return env


def find_sdk_dir(configured: str | None = None) -> Path:
    candidates: list[Path] = []
    if configured:
        candidates.append(Path(configured))
    home = Path.home()
    candidates.extend([
        home / "Downloads" / "ZKAcces" / "NewSDK",
        home / "Downloads" / "ZKAccess" / "NewSDK",
        home / "OneDrive" / "Escritorio" / "ZKAccess3.5-Install-Package-Build0008LATAM" / "NewSDK",
        home / "Desktop" / "ZKAccess3.5-Install-Package-Build0008LATAM" / "NewSDK",
    ])
    for candidate in candidates:
        if (candidate / "plcommpro.dll").exists():
            return candidate.resolve()

    print("No pude localizar automáticamente plcommpro.dll.")
    while True:
        entered = ask("Carpeta NewSDK que contiene plcommpro.dll")
        candidate = Path(entered.strip('"')).expanduser()
        if (candidate / "plcommpro.dll").exists():
            return candidate.resolve()
        print("No existe plcommpro.dll en esa carpeta. Intenta nuevamente.")


def find_cloudflared(configured: str | None = None) -> Path:
    candidates: list[Path] = []
    if configured:
        candidates.append(Path(configured))
    which = shutil.which("cloudflared")
    if which:
        candidates.append(Path(which))
    home = Path.home()
    candidates.extend([
        home / "Downloads" / "cloudflared-windows-amd64.exe",
        home / "Downloads" / "cloudflared.exe",
        TOOL_DIR / "cloudflared.exe",
    ])
    for candidate in candidates:
        if candidate.exists():
            return candidate.resolve()

    target = TOOL_DIR / "cloudflared.exe"
    print("cloudflared no fue encontrado. Descargando binario oficial...")
    url = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
    try:
        request.urlretrieve(url, target)
    except Exception as exc:
        raise ManagerError(f"No se pudo descargar cloudflared: {exc}") from exc
    return target.resolve()


def configure_first_run() -> dict[str, Any]:
    banner("PRIMERA EJECUCIÓN")
    print("Se generará un BRIDGE_TOKEN nuevo una sola vez.")
    print("También necesito un token de la API de Hostinger.")
    print("Créalo en: https://hpanel.hostinger.com/profile/api")
    api_token = getpass.getpass("HOSTINGER API token (no se mostrará): ").strip()
    if not api_token:
        raise ManagerError("Falta el token de API de Hostinger.")

    username = ask("Usuario de hosting Hostinger (formato u123456789)")
    if not username:
        raise ManagerError("Falta el usuario de hosting de Hostinger.")
    domain = ask("Dominio de la app Node.js", DEFAULT_DOMAIN)
    bridge_token = secrets.token_urlsafe(32)

    # Valida credenciales antes de pedir más datos.
    remote_env_keys(api_token, username, domain)

    sdk_dir = find_sdk_dir()
    cloudflared = find_cloudflared()
    prod_env = build_production_env_cache(api_token, username, domain, bridge_token)

    config = {
        "version": 1,
        "hostinger_username": username,
        "hostinger_domain": domain,
        "hostinger_api_token_protected": protect_secret(api_token),
        "bridge_token_protected": protect_secret(bridge_token),
        "production_env_protected": protect_secret(json.dumps(prod_env, ensure_ascii=False)),
        "sdk_dir": str(sdk_dir),
        "cloudflared_path": str(cloudflared),
        "c3_host": DEFAULT_C3_HOST,
        "c3_port": DEFAULT_C3_PORT,
        "created_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    }
    save_json(CONFIG_PATH, config)

    print("\n*** GUARDA ESTE TOKEN SOLO SI DESEAS TENER UNA COPIA DE EMERGENCIA ***")
    print(f"ZKTECO_PULLSDK_BRIDGE_TOKEN={bridge_token}")
    print("*** El administrador no volverá a imprimirlo en ejecuciones normales. ***")
    return config


def load_secrets(config: dict[str, Any]) -> tuple[str, str, dict[str, str]]:
    try:
        api_token = unprotect_secret(config["hostinger_api_token_protected"])
        bridge_token = unprotect_secret(config["bridge_token_protected"])
        prod_env = json.loads(unprotect_secret(config["production_env_protected"]))
    except Exception as exc:
        raise ManagerError(
            "No pude descifrar la configuración local. "
            "Debe ejecutarse con el mismo usuario de Windows que hizo la primera configuración."
        ) from exc
    if not isinstance(prod_env, dict):
        raise ManagerError("La caché de variables de Hostinger es inválida.")
    return api_token, bridge_token, {str(k): str(v) for k, v in prod_env.items()}


def reconfigure_hostinger(config: dict[str, Any]) -> dict[str, Any]:
    api_token, bridge_token, _ = load_secrets(config)
    username = str(config["hostinger_username"])
    domain = str(config["hostinger_domain"])
    prod_env = build_production_env_cache(api_token, username, domain, bridge_token)
    config["production_env_protected"] = protect_secret(json.dumps(prod_env, ensure_ascii=False))
    config["updated_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
    save_json(CONFIG_PATH, config)
    print("Caché segura de variables de Hostinger actualizada.")
    return config


def ensure_repo_updated() -> None:
    banner("ACTUALIZANDO REPOSITORIO")
    if not (REPO_ROOT / ".git").exists():
        raise ManagerError(f"No encontré .git en {REPO_ROOT}")
    tracked = run(
        ["git", "status", "--porcelain", "--untracked-files=no"],
        cwd=REPO_ROOT,
        capture=True,
    ).stdout.strip()
    if tracked:
        raise ManagerError(
            "Hay cambios locales en archivos versionados. No haré git pull para no sobrescribirlos.\n"
            + tracked
        )
    run(["git", "switch", "main"], cwd=REPO_ROOT)
    run(["git", "pull", "--ff-only", "origin", "main"], cwd=REPO_ROOT)


def build_bridge(sdk_dir: Path) -> None:
    banner("COMPILANDO BRIDGE")
    if not shutil.which("dotnet"):
        raise ManagerError("No encontré dotnet en PATH. Instala .NET 8 SDK.")
    if PUBLISH_NEXT.exists():
        shutil.rmtree(PUBLISH_NEXT)
    run([
        "dotnet", "publish", str(CSPROJ),
        "-c", "Release",
        "-r", "win-x86",
        "--self-contained", "false",
        "-o", str(PUBLISH_NEXT),
    ], cwd=REPO_ROOT)

    dlls = list(sdk_dir.glob("*.dll"))
    if not dlls:
        raise ManagerError(f"No encontré DLLs en {sdk_dir}")
    for dll in dlls:
        shutil.copy2(dll, PUBLISH_NEXT / dll.name)
    if not (PUBLISH_NEXT / "plcommpro.dll").exists():
        raise ManagerError("La compilación no contiene plcommpro.dll después de copiar NewSDK.")
    if not (PUBLISH_NEXT / "ZktecoPullSdkBridge.exe").exists():
        raise ManagerError("No se generó ZktecoPullSdkBridge.exe.")
    print(f"Build listo con {len(dlls)} DLL(s) del PullSDK.")


def process_rows() -> list[dict[str, Any]]:
    ps = (
        "Get-CimInstance Win32_Process | "
        "Where-Object { $_.Name -match 'ZktecoPullSdkBridge|cloudflared' } | "
        "Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress"
    )
    raw = powershell(ps, check=False)
    if not raw:
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return []
    return data if isinstance(data, list) else [data]


def stop_existing_processes() -> None:
    banner("DETENIENDO PROCESOS ANTERIORES")
    pids: set[int] = set()
    for row in process_rows():
        name = str(row.get("Name", "")).lower()
        cmd = str(row.get("CommandLine") or "").lower()
        pid = int(row.get("ProcessId") or 0)
        if not pid:
            continue
        if "zktecopullsdkbridge" in name:
            pids.add(pid)
        elif "cloudflared" in name and "tunnel" in cmd and "127.0.0.1:5098" in cmd:
            pids.add(pid)

    if not pids:
        print("No había bridge/Quick Tunnel previo que detener.")
        return
    for pid in sorted(pids):
        cp = subprocess.run(
            ["taskkill", "/PID", str(pid), "/T", "/F"],
            text=True, capture_output=True, check=False
        )
        if cp.returncode == 0:
            print(f"Proceso {pid} detenido.")
    time.sleep(1.0)


def activate_build() -> None:
    if PUBLISH_BACKUP.exists():
        shutil.rmtree(PUBLISH_BACKUP, ignore_errors=True)
    if PUBLISH_DIR.exists():
        PUBLISH_DIR.rename(PUBLISH_BACKUP)
    PUBLISH_NEXT.rename(PUBLISH_DIR)
    print(f"Bridge publicado en {PUBLISH_DIR}")


def creation_flags() -> int:
    return (
        getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
        | getattr(subprocess, "DETACHED_PROCESS", 0)
        | getattr(subprocess, "CREATE_NO_WINDOW", 0)
    )


def start_detached(cmd: list[str], log_path: Path, *,
                   env: dict[str, str] | None = None,
                   cwd: Path | None = None) -> int:
    log_path.parent.mkdir(parents=True, exist_ok=True)
    log = open(log_path, "ab", buffering=0)
    try:
        proc = subprocess.Popen(
            cmd,
            cwd=str(cwd) if cwd else None,
            env=env,
            stdin=subprocess.DEVNULL,
            stdout=log,
            stderr=subprocess.STDOUT,
            creationflags=creation_flags(),
            close_fds=True,
        )
        return proc.pid
    finally:
        log.close()


def http_json(url: str, *, bearer: str | None = None, timeout: int = 8) -> Any:
    headers = {"Accept": "application/json"}
    if bearer:
        headers["Authorization"] = f"Bearer {bearer}"
    req = request.Request(url, headers=headers, method="GET")
    with request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
        return json.loads(raw) if raw else {}


def wait_local_bridge(token: str, seconds: int = 25) -> None:
    deadline = time.time() + seconds
    last: Exception | None = None
    while time.time() < deadline:
        try:
            data = http_json(DEFAULT_BRIDGE_URL + "/health/controller", bearer=token, timeout=4)
            if data.get("ok") and data.get("controller"):
                print("Bridge local conectado al C3-200.")
                return
        except Exception as exc:
            last = exc
        time.sleep(1)
    raise ManagerError(f"El bridge no respondió correctamente en {seconds}s. Último error: {last}")


def wait_quick_tunnel(log_path: Path, seconds: int = 40) -> str:
    deadline = time.time() + seconds
    while time.time() < deadline:
        if log_path.exists():
            text = log_path.read_text(encoding="utf-8", errors="replace")
            matches = URL_RE.findall(text)
            if matches:
                return matches[-1].rstrip("/")
        time.sleep(0.75)
    tail = ""
    if log_path.exists():
        tail = "\n".join(log_path.read_text(encoding="utf-8", errors="replace").splitlines()[-20:])
    raise ManagerError(f"Cloudflare no publicó una Quick Tunnel URL.\n{tail}")


def start_services(config: dict[str, Any], bridge_token: str) -> tuple[int, int, str]:
    banner("INICIANDO BRIDGE Y CLOUDFLARE")
    bridge_env = os.environ.copy()
    bridge_env.update({
        "ZKTECO_HOST": str(config.get("c3_host", DEFAULT_C3_HOST)),
        "ZKTECO_PORT": str(config.get("c3_port", DEFAULT_C3_PORT)),
        "ZKTECO_COMM_PASSWORD": "",
        "BRIDGE_TOKEN": bridge_token,
        "ASPNETCORE_URLS": "http://0.0.0.0:5098",
    })
    bridge_log = LOG_DIR / "bridge.log"
    tunnel_log = LOG_DIR / "cloudflared.log"
    bridge_log.write_text("", encoding="utf-8")
    tunnel_log.write_text("", encoding="utf-8")

    bridge_exe = PUBLISH_DIR / "ZktecoPullSdkBridge.exe"
    bridge_pid = start_detached([str(bridge_exe)], bridge_log, env=bridge_env, cwd=PUBLISH_DIR)
    print(f"Bridge iniciado · PID {bridge_pid}")
    wait_local_bridge(bridge_token)

    cloudflared = find_cloudflared(str(config.get("cloudflared_path") or ""))
    cloud_pid = start_detached(
        [str(cloudflared), "tunnel", "--url", DEFAULT_BRIDGE_URL],
        tunnel_log,
        cwd=cloudflared.parent,
    )
    print(f"Cloudflare iniciado · PID {cloud_pid}")
    quick_url = wait_quick_tunnel(tunnel_log)
    print(f"Quick Tunnel: {quick_url}")

    save_json(RUNTIME_PATH, {
        "pids": [bridge_pid, cloud_pid],
        "bridge_pid": bridge_pid,
        "cloudflared_pid": cloud_pid,
        "quick_url": quick_url,
        "started_at": time.strftime("%Y-%m-%d %H:%M:%S"),
    })
    return bridge_pid, cloud_pid, quick_url


def update_hostinger(config: dict[str, Any], api_token: str, bridge_token: str,
                      cached_env: dict[str, str], quick_url: str) -> None:
    banner("ACTUALIZANDO HOSTINGER")
    username = str(config["hostinger_username"])
    domain = str(config["hostinger_domain"])
    current_keys = remote_env_keys(api_token, username, domain)
    cached_keys = set(cached_env)

    # Evita borrar/recrear variables desconocidas si alguien cambió Hostinger manualmente.
    remote_non_bridge = current_keys - BRIDGE_ENV_KEYS
    cached_non_bridge = cached_keys - BRIDGE_ENV_KEYS
    if remote_non_bridge != cached_non_bridge:
        added = sorted(remote_non_bridge - cached_non_bridge)
        missing = sorted(cached_non_bridge - remote_non_bridge)
        raise ManagerError(
            "Las claves de Hostinger cambiaron desde la configuración inicial. "
            "Por seguridad NO haré un reemplazo completo.\n"
            f"Nuevas en Hostinger: {added or 'ninguna'}\n"
            f"Faltantes en Hostinger: {missing or 'ninguna'}\n"
            "Ejecuta ACTUALIZAR-BRIDGE.cmd --reconfigure-hostinger para refrescar la caché."
        )

    env = dict(cached_env)
    env["ZKTECO_PULLSDK_BRIDGE_URL"] = quick_url
    env["ZKTECO_PULLSDK_BRIDGE_TOKEN"] = bridge_token
    env.setdefault("ZKTECO_PULLSDK_BRIDGE_TIMEOUT_MS", "30000")

    payload = {
        "env_vars": [{"key": key, "value": env[key]} for key in sorted(env)]
    }
    hostinger_request("PUT", hostinger_env_path(username, domain), api_token, payload)
    # La API de env ya reinicia Node.js; este restart adicional hace el flujo explícito.
    time.sleep(1)
    hostinger_request("POST", hostinger_restart_path(username, domain), api_token)

    # Guarda URL nueva en la caché cifrada para que el set de variables permanezca completo.
    config["production_env_protected"] = protect_secret(json.dumps(env, ensure_ascii=False))
    config["last_quick_url"] = quick_url
    config["updated_at"] = time.strftime("%Y-%m-%d %H:%M:%S")
    save_json(CONFIG_PATH, config)

    verified = remote_env_keys(api_token, username, domain)
    if verified != set(env):
        raise ManagerError("Hostinger respondió, pero el conjunto de claves no coincide después de actualizar.")
    print(f"Hostinger actualizado y Node.js reiniciado: {domain}")


def validate_public(quick_url: str, bridge_token: str) -> None:
    banner("VALIDACIÓN FINAL")
    deadline = time.time() + 25
    last: Exception | None = None
    while time.time() < deadline:
        try:
            data = http_json(quick_url + "/health/controller", bearer=bridge_token, timeout=8)
            if data.get("ok") and data.get("controller"):
                print("Quick Tunnel -> Bridge -> C3-200: OK")
                return
        except Exception as exc:
            last = exc
        time.sleep(1.5)
    raise ManagerError(f"No pude validar el bridge por la URL pública. Último error: {last}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Actualiza, compila y reinicia automáticamente el ZKTeco PullSDK Bridge."
    )
    parser.add_argument(
        "--reconfigure-hostinger",
        action="store_true",
        help="Vuelve a capturar de forma segura todas las variables de producción de Hostinger.",
    )
    parser.add_argument(
        "--skip-git-pull",
        action="store_true",
        help="No hace git switch/pull antes de compilar.",
    )
    args = parser.parse_args()

    ensure_dirs()
    first_run = not CONFIG_PATH.exists()
    config = configure_first_run() if first_run else load_json(CONFIG_PATH)
    if not config:
        raise ManagerError("No pude cargar la configuración local.")

    if args.reconfigure_hostinger and not first_run:
        config = reconfigure_hostinger(config)

    api_token, bridge_token, cached_env = load_secrets(config)
    sdk_dir = find_sdk_dir(str(config.get("sdk_dir") or ""))
    cloudflared = find_cloudflared(str(config.get("cloudflared_path") or ""))
    config["sdk_dir"] = str(sdk_dir)
    config["cloudflared_path"] = str(cloudflared)
    save_json(CONFIG_PATH, config)

    if not args.skip_git_pull:
        ensure_repo_updated()

    build_bridge(sdk_dir)
    stop_existing_processes()
    activate_build()

    bridge_pid = cloud_pid = 0
    quick_url = ""
    bridge_pid, cloud_pid, quick_url = start_services(config, bridge_token)
    update_hostinger(config, api_token, bridge_token, cached_env, quick_url)
    validate_public(quick_url, bridge_token)

    banner("LISTO")
    print(f"ZKTECO_PULLSDK_BRIDGE_URL={quick_url}")
    if first_run:
        print("El BRIDGE_TOKEN se generó y mostró una sola vez al inicio.")
    else:
        print("BRIDGE_TOKEN reutilizado (no se imprime).")
    print(f"Bridge PID: {bridge_pid}")
    print(f"Cloudflare PID: {cloud_pid}")
    print(f"Logs: {LOG_DIR}")
    print("Hostinger quedó actualizado automáticamente.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\nCancelado por el usuario.")
        raise SystemExit(130)
    except ManagerError as exc:
        print(f"\nERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
    except Exception as exc:
        print(f"\nERROR INESPERADO: {exc}", file=sys.stderr)
        raise
