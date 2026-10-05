import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest
from datetime import datetime, timedelta, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from agent import execute


def order(seconds=15):
    return {'id': 'test-order', 'reclamoId': 'test-claim', 'puerta': 1, 'duracionSegundos': 3,
            'venceEn': (datetime.now(timezone.utc) + timedelta(seconds=seconds)).isoformat()}


class AgentTests(unittest.TestCase):
    def test_simulation_never_invokes_driver(self):
        self.assertEqual(execute(order(), 'SIMULACION', ['nonexistent'])['estado'], 'SIMULADA')

    def test_invalid_or_expired_orders_never_actuate(self):
        for data in [order(-1), {**order(), 'puerta': 3}, {**order(), 'duracionSegundos': 255}]:
            self.assertEqual(execute(data, 'FISICO', ['nonexistent'])['estado'], 'FALLIDA')

    def test_physical_adapter_is_required(self):
        self.assertEqual(execute(order(), 'FISICO', [])['estado'], 'FALLIDA')

    def test_malformed_adapter_response_is_unknown(self):
        self.assertEqual(execute(order(), 'FISICO', [sys.executable, '-c', 'print("bad response")'])['estado'], 'DESCONOCIDA')

    def test_valid_adapter_result(self):
        driver = [sys.executable, '-c', 'import json,sys; d=json.load(sys.stdin); assert d["puerta"]==1; print(json.dumps({"estado":"EJECUTADA"}))']
        self.assertEqual(execute(order(), 'FISICO', driver)['estado'], 'EJECUTADA')

    def test_http_transport_and_persistent_result(self):
        results = []
        received = threading.Event()
        issued = False
        class Handler(BaseHTTPRequestHandler):
            def log_message(self, *args): pass
            def do_POST(self):
                nonlocal issued
                self.assert_auth = self.headers.get('Authorization') == 'Bearer ' + 'x' * 64
                body = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
                if not self.assert_auth:
                    self.send_error(401); return
                if self.path.endswith('/reclamar'):
                    data = None if issued else order(); issued = True
                else:
                    results.append(body); received.set(); data = {}
                self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers()
                self.wfile.write(json.dumps({'ok': True, 'data': data}).encode())
        server = HTTPServer(('127.0.0.1', 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True); thread.start()
        try:
            with tempfile.TemporaryDirectory() as tmp:
                env = {**os.environ, 'CASETA_API_URL': f'http://127.0.0.1:{server.server_port}/api/caseta',
                       'CASETA_AGENT_TOKEN': 'x' * 64, 'CASETA_ALLOW_LOCAL_HTTP': '1', 'CASETA_MODE': 'SIMULACION', 'CASETA_DATA_DIR': tmp}
                process = subprocess.Popen([sys.executable, str(Path(__file__).with_name('agent.py'))], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                try:
                    self.assertTrue(received.wait(8), 'Agent failed to return result')
                    self.assertEqual(results[0]['estado'], 'SIMULADA')
                    self.assertEqual(results[0]['reclamoId'], 'test-claim')
                    self.assertTrue((Path(tmp) / 'journal.sqlite').exists())
                finally:
                    process.terminate(); process.wait(timeout=5)
        finally:
            server.shutdown(); server.server_close()


if __name__ == '__main__':
    unittest.main()
