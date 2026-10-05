"""Outbound-only caseta agent. Python 3.10+, standard library only."""
import json
import os
import sqlite3
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse
from urllib.request import Request, urlopen


def validate_order(order):
    if order.get('puerta') not in (1, 2) or order.get('duracionSegundos') != 3:
        raise ValueError('Puerta o duración no autorizada')
    expiry = datetime.fromisoformat(order['venceEn'].replace('Z', '+00:00'))
    if expiry <= datetime.now(timezone.utc):
        raise ValueError('La orden ya venció')


def execute(order, mode, driver):
    try:
        validate_order(order)
    except (ValueError, KeyError, TypeError):
        return {'estado': 'FALLIDA', 'resultado': 'Orden vencida o parámetros inválidos; no se accionó el controlador'}
    if mode == 'SIMULACION':
        return {'estado': 'SIMULADA', 'resultado': 'Transporte probado; no se accionó el controlador'}
    if not driver:
        return {'estado': 'FALLIDA', 'resultado': 'Adaptador físico no instalado'}
    try:
        # An installed SDK adapter reads one JSON object and returns one JSON result.
        # shell=False: never interpret an incoming command as shell code.
        result = subprocess.run(driver, input=json.dumps({
            'id': order['id'], 'accion': 'ABRIR', 'puerta': order['puerta'],
            'duracionSegundos': 3, 'venceEn': order['venceEn']
        }), text=True, capture_output=True, timeout=8, check=False, shell=False)
        parsed = json.loads(result.stdout)
        if result.returncode == 0 and parsed.get('estado') == 'EJECUTADA':
            return {'estado': 'EJECUTADA', 'resultado': 'Adaptador confirmó la orden al controlador; posición física no verificada'}
        if result.returncode == 0 and parsed.get('estado') == 'FALLIDA':
            return {'estado': 'FALLIDA', 'resultado': 'Adaptador rechazó la operación sin accionarla'}
    except OSError:
        return {'estado': 'FALLIDA', 'resultado': 'No se pudo iniciar el adaptador físico'}
    except (subprocess.TimeoutExpired, ValueError):
        pass
    return {'estado': 'DESCONOCIDA', 'resultado': 'Sin confirmación fiable del adaptador; no repetir automáticamente'}


def api(base, token, path, body):
    req = Request(base + path, data=json.dumps(body).encode(),
                  headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json'})
    with urlopen(req, timeout=12) as response:
        result = json.load(response)
    if not result.get('ok'):
        raise RuntimeError('Respuesta de backend inválida')
    return result.get('data')


def run():
    base = os.environ['CASETA_API_URL'].rstrip('/')  # Include /api/caseta.
    token = os.environ['CASETA_AGENT_TOKEN']
    if urlparse(base).scheme != 'https' and not (
        os.environ.get('CASETA_ALLOW_LOCAL_HTTP') == '1' and urlparse(base).hostname in ('localhost', '127.0.0.1')):
        raise ValueError('La API requiere HTTPS')
    if len(token) < 32:
        raise ValueError('El token debe tener al menos 32 caracteres')
    mode = os.environ.get('CASETA_MODE', 'SIMULACION')
    if mode not in ('SIMULACION', 'FISICO'):
        raise ValueError('Modo inválido')
    driver = json.loads(os.environ.get('CASETA_DRIVER_COMMAND', '[]'))
    if not isinstance(driver, list) or any(not isinstance(x, str) for x in driver):
        raise ValueError('CASETA_DRIVER_COMMAND debe ser una lista JSON de argumentos')
    if mode == 'FISICO' and not driver:
        raise ValueError('Falta el adaptador físico: usa SIMULACION para probar el transporte')
    directory = Path(os.environ.get('CASETA_DATA_DIR', str(Path(__file__).parent / 'data')))
    directory.mkdir(parents=True, exist_ok=True)
    # One agent process per data directory; OS releases this lock on crash.
    lockfile = open(directory / 'agent.lock', 'a+b')
    lockfile.seek(0); lockfile.write(b'0'); lockfile.flush(); lockfile.seek(0)
    if os.name == 'nt':
        import msvcrt
        msvcrt.locking(lockfile.fileno(), msvcrt.LK_NBLCK, 1)
    else:
        import fcntl
        fcntl.flock(lockfile.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
    db = sqlite3.connect(directory / 'journal.sqlite')
    db.execute('PRAGMA synchronous=FULL')
    db.execute('CREATE TABLE IF NOT EXISTS journal (id TEXT PRIMARY KEY, claim TEXT NOT NULL, result TEXT NOT NULL, ack INTEGER NOT NULL DEFAULT 0)')
    db.commit()
    print('Agente iniciado en modo ' + mode, flush=True)
    while True:
        try:
            # Retry delivery of results, never execution of the physical action.
            pending = db.execute('SELECT id, claim, result FROM journal WHERE ack=0').fetchall()
            for identifier, claim, result in pending:
                api(base, token, '/agente/ordenes/' + identifier + '/resultado',
                    {**json.loads(result), 'reclamoId': claim})
                db.execute('UPDATE journal SET ack=1 WHERE id=?', (identifier,)); db.commit()
            order = api(base, token, '/agente/reclamar', {'modo': mode})
            if order:
                previous = db.execute('SELECT claim, result FROM journal WHERE id=?', (order['id'],)).fetchone()
                if previous:
                    if previous[0] != order['reclamoId']:
                        raise RuntimeError('Orden repetida con otro reclamo; requiere revisión')
                    result = json.loads(previous[1])
                else:
                    # Persist uncertainty BEFORE touching hardware. A crash is not a retry.
                    result = {'estado': 'DESCONOCIDA', 'resultado': 'Agente interrumpido; ejecución no confirmada'}
                    db.execute('INSERT INTO journal(id,claim,result) VALUES(?,?,?)',
                               (order['id'], order['reclamoId'], json.dumps(result))); db.commit()
                    result = execute(order, mode, driver)
                    db.execute('UPDATE journal SET result=? WHERE id=?', (json.dumps(result), order['id'])); db.commit()
                api(base, token, '/agente/ordenes/' + order['id'] + '/resultado', {**result, 'reclamoId': order['reclamoId']})
                db.execute('UPDATE journal SET ack=1 WHERE id=?', (order['id'],)); db.commit()
                print(order['id'] + ': ' + result['estado'], flush=True)
        except Exception as error:
            # Do not log tokens, HTTP request headers, or SDK output.
            print('Comunicación pendiente: ' + type(error).__name__, flush=True)
        time.sleep(3)


if __name__ == '__main__':
    run()
