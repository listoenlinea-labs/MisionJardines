#!/usr/bin/env python3
"""Pruebas sintéticas sin Asterisk real ni marcación."""
import importlib.util
import pathlib
import unittest

archivo = pathlib.Path(__file__).with_name("observador_ami.py")
spec = importlib.util.spec_from_file_location("observador_ami", archivo)
ami = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ami)
SOLICITUD = "12345678-1234-1234-1234-123456789abc"


def paquete(tipo, **campos):
    data = {"event": tipo.lower(), "linkedid": "linked-1", "channel": "Local/s@conmutador-0001;1"}
    data.update(campos)
    return data


class PruebaObservador(unittest.TestCase):
    def setUp(self):
        self.reportados = []
        self.tiempo = 100.0
        self.monitor = ami.Correlador(self.reportados.append, lambda: self.tiempo)
        self.monitor.leer(paquete("VarSet", variable="__MJ_SOLICITUD", value=SOLICITUD))
        self.destino = "PJSIP/6002-000002"
        self.monitor.leer(paquete("DialBegin", dialstring="PJSIP/3312345678@6002",
                                  destchannel=self.destino))

    def test_timbrando_contestada_finalizada_duracion(self):
        self.monitor.leer(paquete("Newstate", channel=self.destino, channelstatedesc="Ringing"))
        self.monitor.leer(paquete("Newstate", channel=self.destino, channelstatedesc="Up"))
        # El gateway Up por sí mismo NO confirma que haya conversación.
        self.assertEqual([m["evento"] for m in self.reportados], ["TIMBRANDO"])
        self.monitor.leer(paquete("BridgeEnter", channel=self.destino))
        self.tiempo += 65
        self.monitor.leer(paquete("Hangup", channel=self.destino))
        self.assertEqual([m["evento"] for m in self.reportados],
                         ["TIMBRANDO", "CONTESTADA", "FINALIZADA"])
        self.assertEqual(self.reportados[-1]["duracionSegundos"], 65)
        self.assertNotIn("3312345678", str(self.reportados))

    def test_ocupado_en_dialend_destchannel(self):
        self.monitor.leer(paquete("DialEnd", dialstatus="BUSY", destchannel=self.destino))
        self.assertEqual([m["evento"] for m in self.reportados], ["OCUPADO"])

    def test_no_contesto_en_dialend_destchannel(self):
        self.monitor.leer(paquete("DialEnd", dialstatus="NOANSWER", destchannel=self.destino))
        self.assertEqual([m["evento"] for m in self.reportados], ["NO_CONTESTO"])

    def test_falla_con_causa_sin_datos_privados(self):
        self.monitor.leer(paquete("DialEnd", dialstatus="CHANUNAVAIL", destchannel=self.destino))
        self.assertEqual(self.reportados[-1]["evento"], "FALLIDA")
        self.assertEqual(self.reportados[-1]["motivo"], "CHANUNAVAIL")

    def test_caseta_6001_no_significa_residente_timbrando(self):
        captured = []
        m = ami.Correlador(captured.append)
        m.leer(paquete("VarSet", variable="MJ_SOLICITUD", value=SOLICITUD))
        m.leer(paquete("DialBegin", dialstring="PJSIP/6001",
                       destchannel="PJSIP/6001-00001"))
        m.leer(paquete("Newstate", channel="PJSIP/6001-00001",
                       channelstatedesc="Ringing"))
        self.assertEqual(captured, [])

    def test_sin_correlacion_no_emite_datos(self):
        m = ami.Correlador(self.reportados.append)
        m.leer(paquete("DialBegin", dialstring="PJSIP/3312345678@6002",
                       destchannel="PJSIP/6002-sin-id", linkedid="otro"))
        m.leer(paquete("Newstate", channel="PJSIP/6002-sin-id",
                       channelstatedesc="Ringing", linkedid="otro"))
        self.assertEqual(self.reportados, [])

    def test_parser_ami(self):
        entry = ami.procesar_paquete(
            "Event: DialEnd\r\nChannel: Local/s@caseta;2\r\nDialStatus: BUSY\r\n")
        self.assertEqual(entry["event"], "DialEnd")
        self.assertEqual(entry["dialstatus"], "BUSY")


if __name__ == "__main__":
    unittest.main()
