const { Worker } = require('node:worker_threads');
const path = require('node:path');
const parser = require('./comprobante-parser');
const { equivaleFechaSpei } = require('./fecha-operativa-spei.service');

let running = 0;
const MAX_CONCURRENT = 2;
const MAX_OCR_OUTPUT = 50000;

function reconocerImagen(imageData) {
  if (running >= MAX_CONCURRENT) {
    return Promise.reject(Object.assign(new Error('El lector de comprobantes está ocupado. Vuelve a intentarlo en unos segundos.'), { status: 503 }));
  }
  const match = /^data:image\/(?:jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(String(imageData || ''));
  if (!match) return Promise.reject(Object.assign(new Error('Comprobante en formato inválido'), { status: 400 }));
  const bytes = Buffer.from(match[1], 'base64');
  if (!bytes.length || bytes.length > 1200000) {
    return Promise.reject(Object.assign(new Error('El comprobante procesado excede el límite permitido'), { status: 413 }));
  }
  running++;
  return new Promise((resolve, reject) => {
    let worker, timer, finished = false;
    // The outer worker lets us stop initialization as well as recognition.
    // Its nested Tesseract worker is terminated when this thread exits.
    async function finish(error, result) {
      if (finished) return;
      finished = true;
      clearTimeout(timer);
      try { if (worker) await worker.terminate(); } catch (_) { /* already exited */ }
      running--;
      if (error) reject(error); else resolve(result);
    }
    const unavailable = () => Object.assign(new Error('No fue posible leer el comprobante con el OCR del servidor. Intenta de nuevo con una imagen clara; si persiste, Administración debe revisar el despliegue de Tesseract.js.'), { status: 503 });
    try {
      worker = new Worker(path.join(__dirname, 'comprobante-ocr.worker.js'), {
        workerData: { bytes, lang: process.env.PAGOS_OCR_LANG || 'spa+eng' }
      });
      timer = setTimeout(() => finish(Object.assign(new Error('Se agotó el tiempo de lectura del comprobante. Intenta con una imagen más clara.'), { status: 503 })), 30000);
      worker.once('message', message => {
        if (!message.ok || typeof message.text !== 'string' || message.text.length > MAX_OCR_OUTPUT) return finish(unavailable());
        finish(null, message.text);
      });
      worker.once('error', () => finish(unavailable()));
      worker.once('exit', () => { if (!finished) finish(unavailable()); });
    } catch (_) { finish(unavailable()); }
  });
}

async function comprobarDestino({ comprobanteData, folioOperacion, fechaOperacion, horaOperacion, monto, exigirCampos = false }) {
  const texto = await reconocerImagen(comprobanteData);
  const titular = process.env.PAGOS_TITULAR || 'MARIA DEL ROCIO BAHENA JUAREZ';
  const terminacion = process.env.PAGOS_DESTINO_ULTIMOS4 || '4409';
  const verificacion = parser.verifyDestination(texto, titular, terminacion);
  if (!verificacion.ok) throw Object.assign(new Error(verificacion.message + ' No se registró el pago.'), { status: 422 });
  const extraido = parser.extract(texto);
  validarCamposExtraidos({ folioOperacion, fechaOperacion, horaOperacion, monto }, extraido, exigirCampos);
  return { texto: texto.slice(0, 12000), extraido };
}

function validarCamposExtraidos({ folioOperacion, fechaOperacion, horaOperacion, monto }, extraido, exigirCampos = false) {
  if (exigirCampos && (!(extraido.claveRastreo || extraido.folio) || ['date', 'time', 'amount'].some(field => !extraido[field]))) {
    throw Object.assign(new Error('No se pudieron leer todos los datos bancarios del comprobante. Adjunta una imagen más clara o solicita ayuda a Administración. No se registró el pago.'), { status: 422 });
  }
  // Check bank-labelled data when detected, not untrusted OCR text supplied by the browser.
  const same = (provided, detected) => !detected || String(provided).trim().toUpperCase() === String(detected).trim().toUpperCase();
  if (extraido.claveRastreo && !same(folioOperacion, extraido.claveRastreo)) throw Object.assign(new Error('La clave de rastreo no coincide con la leída en el comprobante.'), { status: 422 });
  if (!extraido.claveRastreo && !same(folioOperacion, extraido.folio)) throw Object.assign(new Error('El folio no coincide con Folio de operación del comprobante.'), { status: 422 });
  // BBVA puede mostrar el día operativo SPEI (lunes) en vez del viernes real
  // en una transferencia de las 18:00 en adelante. Se exige equivalencia exacta,
  // nunca se acepta una fecha futura arbitraria ni se ignora el OCR.
  if (!same(fechaOperacion, extraido.date) && !equivaleFechaSpei(fechaOperacion, extraido.date, horaOperacion))
    throw Object.assign(new Error('La fecha no coincide con la fecha real ni con el día operativo SPEI mostrado en el comprobante.'), { status: 422 });
  if (extraido.time && String(horaOperacion).slice(0, 5) !== extraido.time.slice(0, 5)) throw Object.assign(new Error('La hora no coincide con Fecha de operación del comprobante.'), { status: 422 });
  if (exigirCampos && (String(horaOperacion).length === 5 ? horaOperacion + ':00' : String(horaOperacion)) !== extraido.time) throw Object.assign(new Error('La hora no coincide con Fecha de operación del comprobante.'), { status: 422 });
  if (extraido.amount && Number(monto).toFixed(2) !== extraido.amount) throw Object.assign(new Error('El monto no coincide con el monto transferido que aparece en el comprobante.'), { status: 422 });
}

module.exports = { reconocerImagen, comprobarDestino, validarCamposExtraidos };
