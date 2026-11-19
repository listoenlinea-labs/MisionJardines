#!/usr/bin/env python3
"""Entrega solicitudes de Misión Jardines al spool local de Asterisk."""

import json
import os
from pathlib import Path
import re
import tempfile
import time
from urllib.request import HTTPRedirectHandler, Request, build_opener
from urllib.parse import urlparse


class SinRedirecciones(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def enviar_call_file(orden, spool):
    destino = orden["destino"]
    if not re.fullmatch(r"[2-9][0-9]{9}", destino):
        raise ValueError("Destino nacional inválido")

    contenido = (
        "Channel: Local/s@conmutador-caseta-entrada/n\n"
        "Callerid: Conmutador <6001>\n"
        "WaitTime: 20\n"
        "MaxRetries: 0\n"
        "Context: conmutador-caseta\n"
        "Extension: s\n"
        "Priority: 1\n"
        f"Setvar: MJ_DESTINO={destino}\n"
    )
    # Mismo sistema de archivos: Asterisk solo ve el archivo completo.
    with tempfile.NamedTemporaryFile(
        mode="w", encoding="ascii", dir=spool, prefix=".mj-caseta-", delete=False
    ) as temporal:
        archivo = Path(temporal.name)
        try:
            temporal.write(contenido)
            temporal.close()
            os.replace(archivo, spool / "outgoing" / (orden["solicitud"] + ".call"))
        finally:
            archivo.unlink(missing_ok=True)


def ejecutar():
    api = os.environ["MJ_CASETA_API"].rstrip("/")
    token = os.environ["CONMUTADOR_CASETA_TOKEN"]
    spool = Path(os.environ.get("ASTERISK_SPOOL_DIR", "/var/spool/asterisk"))
    if urlparse(api).scheme != "https" or len(token) < 32:
        raise SystemExit("Configura una URL HTTPS y una clave de al menos 32 caracteres.")
    if not (spool / "outgoing").is_dir():
        raise SystemExit("No se encontró el directorio outgoing de Asterisk.")
    cliente = build_opener(SinRedirecciones())
    cabeceras = {"Authorization": "Bearer " + token, "Content-Type": "application/json"}

    def solicitar(ruta, datos):
        peticion = Request(api + ruta, json.dumps(datos).encode(), cabeceras, method="POST")
        with cliente.open(peticion, timeout=8) as respuesta:
            return None if respuesta.status == 204 else json.load(respuesta)

    uuid = r"[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}"
    entregadas = {}
    while True:
        try:
            for solicitud, reclamo in list(entregadas.items()):
                archivo = spool / "outgoing" / (solicitud + ".call")
                if not archivo.exists():
                    solicitar("/resultado", {
                        "solicitud": solicitud, "reclamo": reclamo, "estado": "FINALIZADA"
                    })
                    del entregadas[solicitud]
            inicio = time.monotonic()
            orden = solicitar("/siguiente", {})
            if orden:
                solicitud, reclamo = orden["solicitud"], orden["reclamo"]
                if not (re.fullmatch(uuid, solicitud) and re.fullmatch(uuid, reclamo)):
                    raise ValueError("Identificador de solicitud inválido")
                estado = "ERROR"
                try:
                    # Descuenta conservadoramente todo el viaje HTTPS.
                    if time.monotonic() - inicio < int(orden["vigencia_ms"]) / 1000:
                        enviar_call_file(orden, spool)
                        estado = "ENVIADA"
                        entregadas[solicitud] = reclamo
                except (OSError, ValueError, TypeError) as error:
                    print(f"No se pudo preparar la llamada ({type(error).__name__}).", flush=True)
                solicitar("/resultado", {"solicitud": solicitud, "reclamo": reclamo, "estado": estado})
            time.sleep(2)
        except (OSError, ValueError, KeyError, TypeError) as error:
            # No se vuelve a publicar una llamada si falló la confirmación HTTP.
            print(f"No se pudo consultar o reportar a Hostinger ({type(error).__name__}).", flush=True)
            time.sleep(10)


if __name__ == "__main__":
    ejecutar()
