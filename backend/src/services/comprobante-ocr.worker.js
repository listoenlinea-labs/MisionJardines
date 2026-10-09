const { parentPort, workerData } = require('node:worker_threads');
const path = require('node:path');
const { createWorker, OEM, PSM } = require('tesseract.js');

(async () => {
  let worker;
  try {
    const codes = [...new Set(String(workerData.lang).split('+').map(code => code.trim()).filter(Boolean))];
    if (!codes.length || codes.some(code => !['spa', 'eng'].includes(code))) throw new Error('Idioma OCR no incluido');
    worker = await createWorker(codes.join('+'), OEM.LSTM_ONLY, {
      langPath: path.join(__dirname, '../../node_modules/.pagos-ocr-data'),
      cacheMethod: 'none', gzip: true, errorHandler: () => {}
    });
    await worker.setParameters({ tessedit_pageseg_mode: PSM.AUTO });
    const { data } = await worker.recognize(Buffer.from(workerData.bytes));
    await worker.terminate();
    worker = null;
    parentPort.postMessage({ ok: true, text: data.text });
  } catch (_) {
    if (worker) await worker.terminate().catch(() => {});
    parentPort.postMessage({ ok: false });
  }
})();
