const parser = require('./comprobante-parser');

let running = 0;
const MAX_CONCURRENT = 2;
const MAX_OCR_OUTPUT = 50000;

async function reconocerImagen(imageData) {
  if (running >= MAX_CONCURRENT) throw Object.assign(new Error('El OCR está ocupado. Reintenta en unos segundos.'), { status: 503 });
  const match = /^data:image\/(?:jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/i.exec(String(imageData || ''));
  if (!match) throw Object.assign(new Error('Comprobante inválido'), { status: 400 });
  const bytes = Buffer.from(match[1], 'base64');
  if (!bytes.length || bytes.length > 1200000) throw Object.assign(new Error('Imagen demasiado grande'), { status: 413 });
  running++;
  let worker;
  try {
    const { createWorker } = require('tesseract.js');
    worker = await createWorker(process.env.PAGOS_OCR_LANG || 'spa+eng', 1, { cachePath: process.env.PAGOS_OCR_CACHE_DIR || undefined });
    const result = await Promise.race([
      worker.recognize(bytes),
      new Promise((_, reject) => setTimeout(() => reject(Object.assign(new Error('La lectura del comprobante tardó demasiado.'), { status: 503 })), 45000))
    ]);
    return String(result?.data?.text || '').slice(0, MAX_OCR_OUTPUT);
  } catch (error) {
    if (error.status) throw error;
    throw Object.assign(new Error('No se pudo iniciar OCR de Node. Verifica la descarga de modelos y permisos del servidor.'), { status: 503 });
  } finally {
    if (worker) await worker.terminate().catch(() => {});
    running--;
  }
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
