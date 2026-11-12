const { parentPort, workerData } = require('node:worker_threads');
const path = require('node:path');
const { createWorker, OEM, PSM } = require('tesseract.js');
const parser = require('./comprobante-parser');
const cuentaOficial = require('./pagos-cuenta-oficial.service');

(async () => {
  let worker;
  try {
    const codes = [...new Set(String(workerData.lang).split('+').map(code => code.trim()).filter(Boolean))];
    if (!codes.length || codes.some(code => !['spa', 'eng'].includes(code))) throw new Error('Idioma OCR no incluido');
    worker = await createWorker(codes.join('+'), OEM.LSTM_ONLY, {
      langPath: path.join(__dirname, '../../node_modules/.pagos-ocr-data'),
      cacheMethod: 'none', gzip: true, errorHandler: () => {}
    });
    const image = Buffer.from(workerData.bytes);
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
    const { data } = await worker.recognize(image);
    const readings = [data.text || ''];
    const {titular,destinosUltimos4}=cuentaOficial.obtener();
    const necesitaOtraLectura=()=>{
      const texto=readings.join(parser.OCR_PASS_MARKER);
      const fields=parser.extract(texto);
      const destination=parser.verifyDestination(texto,titular,destinosUltimos4);
      return !destination.ok || !fields.amount || !fields.date || !fields.time ||
        !(fields.claveRastreo || fields.referencia || fields.folio || parser.candidatosOperacion(texto).length);
    };
    if (necesitaOtraLectura()) {
      // Misma captura, segundo modo OCR para recibos móviles de dos columnas.
      // El servicio valida después ambos pases SIN mezclar etiquetas/valores.
      try {
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SPARSE_TEXT });
        const second = await worker.recognize(image);
        if (second?.data?.text?.trim()) readings.push(second.data.text);
      } catch (_) { /* Conservar el resultado primario; nunca inventar datos. */ }
    }
    if(necesitaOtraLectura()){
      // Tercer modo para fotos con bloques bancarios y tipografía pequeña.
      try{
        await worker.setParameters({tessedit_pageseg_mode:PSM.SINGLE_BLOCK});
        const third=await worker.recognize(image);
        if(third?.data?.text?.trim())readings.push(third.data.text);
      }catch(_){ /* Un pase extra nunca puede invalidar la captura original. */ }
    }
    await worker.terminate();
    worker = null;
    parentPort.postMessage({ ok: true, text: readings.join(parser.OCR_PASS_MARKER) });
  } catch (_) {
    if (worker) await worker.terminate().catch(() => {});
    parentPort.postMessage({ ok: false });
  }
})();
