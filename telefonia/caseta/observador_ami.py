#!/usr/bin/env python3
"""Observador OPCIONAL de eventos de Asterisk (AMI). Solo lectura.

No origina, corta, transfiere ni altera llamadas. No registra destinos ni
telefonos. Si se detiene, el agente principal sigue funcionando como antes.
"""
import json
import os
import queue
import re
import socket
import threading
import time
from urllib.request import Request, build_opener, HTTPRedirectHandler
from urllib.parse import urlparse

UUID_RE = re.compile(r"^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$", re.I)
DESTINO_RE = re.compile(r"@6002(?:\b|$)")
FALLOS = {
    "NOANSWER": ("NO_CONTESTO", None),
    "BUSY": ("OCUPADO", None),
    "CHANUNAVAIL": ("FALLIDA", "CHANUNAVAIL"),
    "CONGESTION": ("FALLIDA", "CONGESTION"),
    "CANCEL": ("FALLIDA", "CANCEL"),
    "INVALIDARGS": ("FALLIDA", "INVALIDARGS"),
    "DONTCALL": ("FALLIDA", "DONTCALL"),
}
MAX_PENDIENTES = 200


def procesar_paquete(paquete):
    """Parser de AMI sin almacenar líneas originales ni identificadores SIP."""
    return {
        clave.strip().lower(): valor.strip()
        for linea in paquete.splitlines()
        if ":" in linea
        for clave, valor in [linea.split(":", 1)]
    }


class Correlador:
    def __init__(self, emitir, reloj=time.monotonic):
        self.emitir = emitir
        self.reloj = reloj
        self.canal_solicitud = {}
        self.link_solicitud = {}
        self.canal_destino = {}
        self.conectadas = {}
        self.terminadas = set()
        self.enviadas = set()

    def solicitud(self, evento):
        return (
            self.canal_solicitud.get(evento.get("channel", ""))
            or self.link_solicitud.get(evento.get("linkedid", ""))
            or self.canal_solicitud.get(evento.get("destchannel", ""))
        )

    def leer(self, evento):
        tipo = evento.get("event", "")
        canal = evento.get("channel", "")
        linked = evento.get("linkedid", "")
        if tipo == "varset":
            variable = evento.get("variable", "").lstrip("_")
            valor = evento.get("value", "")
            if variable == "MJ_SOLICITUD" and UUID_RE.fullmatch(valor):
                self.canal_solicitud[canal] = valor
                if linked:
                    self.link_solicitud[linked] = valor
            return
        solicitud = self.solicitud(evento)
        if tipo == "dialbegin":
            # Sólo seguir el tramo hacia el destino (FXO/6002); el primer Dial
            # a la extensión de caseta 6001 NO significa que el residente timbre.
            if solicitud and DESTINO_RE.search(evento.get("dialstring", "")):
                destino = evento.get("destchannel", "")
                if destino:
                    self.canal_destino[destino] = solicitud
            return
        # DialEnd suele identificar el canal emisor en Channel y el receptor
        # en DestChannel. No confundirlos con el tramo 6001 (caseta).
        destino = evento.get("destchannel", "") if tipo == "dialend" else canal
        solicitud = self.canal_destino.get(destino)
        if not solicitud:
            return
        if tipo == "newstate":
            estado = evento.get("channelstatedesc", "").lower()
            if estado in ("ringing", "ring"):
                self._emitir(solicitud, "TIMBRANDO")
            # "Up" del gateway no equivale por sí mismo a respuesta del
            # destinatario PSTN. Preferir puente o DialEnd(ANSWER).
        elif tipo == "bridgeenter":
            # SIP respondió / canal puenteado; puede no significar que una
            # persona atendió la línea PSTN detrás de un gateway.
            self._contestar(solicitud)
        elif tipo == "dialend":
            dialstatus = evento.get("dialstatus", "").upper()
            if dialstatus == "ANSWER":
                self._contestar(solicitud)
            elif dialstatus in FALLOS and solicitud not in self.conectadas:
                estado, motivo = FALLOS[dialstatus]
                self._emitir(solicitud, estado, motivo=motivo)
            if solicitud in self.terminadas:
                self.canal_destino.pop(destino, None)
        elif tipo == "hangup":
            if solicitud in self.conectadas:
                segundos = max(0, int(self.reloj() - self.conectadas[solicitud]))
                self._emitir(solicitud, "FINALIZADA", duracionSegundos=segundos)
            if solicitud in self.terminadas:
                self.canal_destino.pop(canal, None)

    def _contestar(self, solicitud):
        if solicitud not in self.conectadas:
            self.conectadas[solicitud] = self.reloj()
            self._emitir(solicitud, "CONTESTADA")

    def _emitir(self, solicitud, estado, motivo=None, duracionSegundos=None):
        clave = (solicitud, estado)
        if clave in self.enviadas or solicitud in self.terminadas:
            return
        self.enviadas.add(clave)
        payload = {"solicitud": solicitud, "evento": estado}
        if motivo:
            payload["motivo"] = motivo
        if duracionSegundos is not None:
            payload["duracionSegundos"] = duracionSegundos
        self.emitir(payload)
        if estado in ("FINALIZADA", "NO_CONTESTO", "OCUPADO", "FALLIDA"):
            self.terminadas.add(solicitud)


class SinRedirecciones(HTTPRedirectHandler):
    def redirect_request(self, request, fp, code, msg, headers, newurl):
        return None


def publicador(cola, api, token):
    cliente = build_opener(SinRedirecciones())
    while True:
        evento = cola.get()
        for intento in range(3):
            try:
                request = Request(api, json.dumps(evento).encode("utf-8"), {
                    "Authorization": "Bearer " + token,
                    "Content-Type": "application/json"
                }, method="POST")
                with cliente.open(request, timeout=5) as response:
                    if response.status == 204:
                        break
                # No registrar respuesta HTTP ni datos de llamadas.
            except (OSError, ValueError) as error:
                if intento == 2:
                    print("Observación no entregada (" + type(error).__name__ + ").", flush=True)
                else:
                    time.sleep(2)
        cola.task_done()


def escuchar_ami(usuario, clave, manejador, puerto=5038):
    with socket.create_connection(("127.0.0.1", puerto), timeout=5) as socket_ami:
        socket_ami.settimeout(None)
        socket_ami.sendall((
            "Action: Login\r\nUsername: " + usuario +
            "\r\nSecret: " + clave + "\r\nEvents: on\r\n\r\n"
        ).encode("utf-8"))
        with socket_ami.makefile("r", encoding="utf-8", errors="replace") as stream:
            bloque = []
            autorizado = False
            while True:
                linea = stream.readline()
                if not linea:
                    raise ConnectionError("Se interrumpió AMI")
                linea = linea.rstrip("\r\n")
                if linea:
                    if len(linea) <= 4096 and len(bloque) < 100:
                        bloque.append(linea)
                    continue
                evento = procesar_paquete("\n".join(bloque))
                bloque = []
                if evento.get("response", "").lower() == "success":
                    autorizado = True
                elif evento.get("response", "").lower() == "error":
                    raise PermissionError("AMI rechazó credenciales de solo lectura")
                elif autorizado and evento.get("event"):
                    manejador.leer(evento)


def main():
    if os.environ.get("MJ_CONMUTADOR_TELEMETRIA", "").lower() != "true":
        raise SystemExit("Observador desactivado. El conmutador continúa funcionando normalmente.")
    usuario = os.environ.get("MJ_AMI_USER", "")
    password = os.environ.get("MJ_AMI_PASSWORD", "")
    api = os.environ.get("MJ_CASETA_API", "").rstrip("/") + "/telemetria"
    token = os.environ.get("CONMUTADOR_CASETA_TOKEN", "")
    if not usuario or not password or len(token) < 32 or urlparse(api).scheme != "https":
        raise SystemExit("Falta configurar AMI y la conexión HTTPS al backend.")
    cola = queue.Queue(maxsize=MAX_PENDIENTES)

    def enviar(evento):
        try:
            cola.put_nowait(evento)
        except queue.Full:
            print("Cola de observaciones llena: un evento no se registró.", flush=True)

    threading.Thread(target=publicador, args=(cola, api, token), daemon=True).start()
    correlador = Correlador(enviar)
    while True:
        try:
            escuchar_ami(usuario, password, correlador)
        except (ConnectionError, OSError, PermissionError, ValueError) as error:
            # Nunca registrar el host, teléfono, canal ni respuestas crudas.
            print("Observador AMI reconectando (" + type(error).__name__ + ").", flush=True)
            time.sleep(5)


if __name__ == "__main__":
    main()
