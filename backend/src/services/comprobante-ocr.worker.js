const { parentPort, workerData } = require('node:worker_threads');
const path = require('node:path');
const { createWorker, OEM, PSM } = require('tesseract.js');
const parser = require('./comprobante-parser');
const { localizarRenglon, leerNumero } = require('./comprobante-ocr-renglon');
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
    if (workerData.renglonComprobante) {
      let rectangle;
      for (const mode of [PSM.AUTO, PSM.SPARSE_TEXT]) {
        await worker.setParameters({ tessedit_pageseg_mode: mode });
        const { data } = await worker.recognize(image, {}, { blocks: true });
        rectangle = localizarRenglon(data.blocks);
        if (rectangle) break;
      }
      let text = '';
      if (rectangle) {
        // La línea no contiene palabras. El modelo inglés distingue # del
        // dígito inicial en capturas donde spa+eng los confunde.
        if (codes.join('+') !== 'eng') await worker.reinitialize('eng', OEM.LSTM_ONLY);
        await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE });
        const result = await worker.recognize(image, { rectangle });
        text = leerNumero(result.data.text);
      }
      await worker.terminate();
      worker = null;
      parentPort.postMessage({ ok: true, text });
      return;
    }
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
