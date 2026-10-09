const fs = require('node:fs');
const path = require('node:path');
const destination = path.join(__dirname, '..', 'node_modules', '.pagos-ocr-data');
fs.mkdirSync(destination, { recursive: true });
for (const code of ['spa', 'eng']) {
  const pack = require(`@tesseract.js-data/${code}`);
  fs.copyFileSync(path.join(pack.langPath, `${code}.traineddata.gz`), path.join(destination, `${code}.traineddata.gz`));
}
console.log('OCR: idiomas spa y eng preparados localmente.');
