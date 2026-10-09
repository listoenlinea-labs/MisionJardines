const { spawn } = require('node:child_process');
const parser = require('./comprobante-parser');

let running = 0;
const MAX_CONCURRENT = 2;
const MAX_OCR_OUTPUT = 50000;

function reconocerImagen(imageData) {
  if (running >= MAX_CONCURRENT) {
    const error = new Error('El lector de comprobantes está ocupado. Vuelve a intentarlo en unos segundos.');
    error.status = 503;
    return Promise.reject(error);
  }
  const match = /^data:image\/(?:jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(String(imageData || ''));
  if (!match) return Promise.reject(Object.assign(new Error('Comprobante en formato inválido'), { status: 400 }));
  const bytes = Buffer.from(match[1], 'base64');
  if (!bytes.length || bytes.length > 1200000) {
    return Promise.reject(Object.assign(new Error('El comprobante procesado excede el límite permitido'), { status: 413 }));
  }
  running++;
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.PAGOS_TESSERACT_BIN || 'tesseract',
      ['stdin', 'stdout', '-l', process.env.PAGOS_OCR_LANG || 'spa+eng', '--psm', '3'],
      { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
    let finished = false, output = '', errInfo = '', timedOut = false;
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 30000);
    function finish(error, result) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      running--;
      if (error) reject(error); else resolve(result);
    }
    child.on('error', error => finish(Object.assign(
      new Error(error.code === 'ENOENT'
        ? 'El OCR del servidor no está instalado. Administración debe configurar Tesseract; ningún comprobante será registrado sin verificación.'
        : 'No se pudo iniciar la verificación OCR del servidor.'), { status: 503 }));
    child.stdout.on('data', chunk => {
      output += chunk.toString('utf8');
      if (output.length > MAX_OCR_OUTPUT) child.kill('SIGKILL');
    });
    child.stderr.on('data', chunk => { errInfo = (errInfo + chunk.toString('utf8')).slice(-2000); });
    child.on('close', code => {
      if (timedOut) return finish(Object.assign(new Error('Se agotó el tiempo de lectura del comprobante. Intenta con una imagen más clara.'), { status: 503 }));
      if (code !== 0 || output.length > MAX_OCR_OUTPUT) return finish(Object.assign(
        new Error('No fue posible leer el archivo en el servidor. Comprueba que Tesseract tenga los idiomas spa y eng disponibles.'), { status: 503 }));
      finish(null, output);
    });
    child.stdin.on('error', () => {});
    child.stdin.end(bytes);
  });
}

async function comprobarDestino({ comprobanteData, folioOperacion, fechaOperacion, horaOperacion, monto }) {
  const texto = await reconocerImagen(comprobanteData);
  const titular = process.env.PAGOS_TITULAR || 'MARIA DEL ROCIO BAHENA JUAREZ';
  const terminacion = process.env.PAGOS_DESTINO_ULTIMOS4 || '4409';
  const verificacion = parser.verifyDestination(texto, titular, terminacion);
  if (!verificacion.ok) throw Object.assign(new Error(verificacion.message + ' No se registró el pago.'), { status: 422 });
  const extraido = parser.extract(texto);
  // Check bank-labelled data when detected, not untrusted OCR text supplied by the browser.
  const same = (provided, detected) => !detected || String(provided).trim().toUpperCase() === String(detected).trim().toUpperCase();
  if (!same(folioOperacion, extraido.folio)) throw Object.assign(new Error('El folio no coincide con Folio de operación del comprobante.'), { status: 422 });
  if (!same(fechaOperacion, extraido.date)) throw Object.assign(new Error('La fecha no coincide con Fecha de operación del comprobante.'), { status: 422 });
  if (extraido.time && String(horaOperacion).slice(0, 5) !== extraido.time.slice(0, 5)) throw Object.assign(new Error('La hora no coincide con Fecha de operación del comprobante.'), { status: 422 });
  if (extraido.amount && Number(monto).toFixed(2) !== extraido.amount) throw Object.assign(new Error('El monto no coincide con el monto transferido que aparece en el comprobante.'), { status: 422 });
  return { texto: texto.slice(0, 12000), extraido };
}

module.exports = { reconocerImagen, comprobarDestino };
