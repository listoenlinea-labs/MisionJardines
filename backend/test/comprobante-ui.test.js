const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const frontend = path.join(__dirname, '../../docs/assets/js');
const source = fs.readFileSync(path.join(frontend, 'pagos.js'), 'utf8');
const runOcr = source.slice(source.indexOf('    async function runOcr()'), source.indexOf("    $('proofInput').addEventListener"));

async function scan(text, failure = false, userRole = 'ADMINISTRADOR') {
  const fields = new Map();
  const $ = id => {
    if (!fields.has(id)) fields.set(id, { value: '', style: {}, disabled: false, textContent: '' });
    return fields.get(id);
  };
  const calls = [];
  const Tesseract = {
    PSM: { AUTO: '3' },
    createWorker: async (languages, engine) => {
      calls.push(['create', languages, engine]);
      return {
        setParameters: async parameters => { calls.push(['parameters', parameters.tessedit_pageseg_mode]); },
        recognize: async image => {
          calls.push(['recognize', image]);
          if (failure) throw new Error('OCR failed');
          return { data: { text } };
        },
        terminate: async () => { calls.push(['terminate']); }
      };
    }
  };
  const context = {
    window: { Tesseract }, Tesseract, $, proofData: 'synthetic-image', role: () => userRole,
    scanRevision: 0, proofConfirmed: false, ocrText: '',
    config: { titular: 'PERSONA DE PRUEBA', destinoUltimos4: '1234' },
    toast() {}, setDestinationStatus() {}, updatePaymentSummary() {}
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(frontend, 'comprobante-parser.js'), 'utf8'), context);
  context.MJComprobante = context.window.MJComprobante;
  vm.runInContext(runOcr, context);
  await context.runOcr();
  return { $, context, calls };
}

test('detecta bloques de distinto tamaño antes de leer y libera el worker', async () => {
  const { $, context, calls } = await scan('Transferencia exitosa\nMonto transferido\n$300.00\nOrigen Cuenta -9876\nDestino PERSONA DE PRUEBA Cuenta -1234');
  assert.equal(context.proofConfirmed, true);
  assert.equal($('amount').value, '300.00');
  assert.deepEqual(calls, [
    ['create', 'spa+eng', 1], ['parameters', '3'],
    ['recognize', 'synthetic-image'], ['terminate']
  ]);
});

test('libera el worker y mantiene el comprobante sin confirmar si falla el OCR', async () => {
  const { context, calls } = await scan('', true);
  assert.equal(context.proofConfirmed, false);
  assert.deepEqual(calls.at(-1), ['terminate']);
});

test('OCR del navegador llena monto depositado con el importe, sin intercambiarlo con destino', async () => {
  const { $, context } = await scan([
    'Monto transferido Cuenta destino -1234',
    'Monto pagado: $650.00',
    'Destino PERSONA DE PRUEBA -1234',
    'Folio de operación 0000012345',
    'Fecha de operación 12 oct 2026 12:49'
  ].join('\n'));
  assert.equal(context.proofConfirmed, true);
  assert.equal($('amount').value, '650.00');
  assert.equal($('operationFolio').value, '0000012345');
  assert.equal($('operationDate').value, '2026-10-12');
  assert.equal($('operationTime').value, '12:49:00');
});

test('si el monto no es legible, el formulario deja el importe vacío en vez de usar la cuenta', async () => {
  const { $, context } = await scan('Monto transferido\nDestino PERSONA DE PRUEBA Cuenta -1234');
  assert.equal(context.proofConfirmed, true);
  assert.equal($('amount').value, '');
});

test('condómino: muestra los cuatro datos leídos y permite reportar', async () => {
  const { $, context } = await scan('Monto transferido $300.00\nDestino PERSONA DE PRUEBA Cuenta -1234\nFolio de operación 0000098765\nFecha de operación 12 oct 2026 12:49:23', false, 'CONDOMINO');
  assert.equal(context.proofConfirmed, true);
  assert.equal($('amount').value, '300.00');
  assert.equal($('operationFolio').value, '0000098765');
  assert.equal($('operationDate').value, '2026-10-12');
  assert.equal($('operationTime').value, '12:49:23');
});

test('condómino: una lectura incompleta no habilita reportar ni pide edición manual', async () => {
  const { $, context } = await scan('Monto transferido\nDestino PERSONA DE PRUEBA Cuenta -1234', false, 'CONDOMINO');
  assert.equal(context.proofConfirmed, false);
  assert.equal($('submitPayment').disabled, true);
  assert.equal($('amount').value, '');
  assert.match($('ocrState').textContent, /Lectura incompleta/);
});

test('campos de comprobante visibles y readonly por defecto; solo administración puede editarlos', () => {
  const html = fs.readFileSync(path.join(frontend, '../../pagos.html'), 'utf8');
  for (const id of ['operationFolio', 'amount', 'operationDate', 'operationTime']) {
    assert.match(html, new RegExp('<input[^>]*id="' + id + '"[^>]*readonly[^>]*>'));
  }
  const setup = source.slice(source.indexOf("      const canEditProof ="), source.indexOf("      $('adminExtraBox').hidden", source.indexOf('    async function init()')));
  for (const userRole of ['CONDOMINO', 'ADMINISTRADOR', 'SUPER_ADMIN']) {
    const fields = new Map();
    vm.runInNewContext(setup, { role: () => userRole, $: id => {
      if (!fields.has(id)) fields.set(id, {});
      return fields.get(id);
    } });
    for (const id of ['operationFolio', 'amount', 'operationDate', 'operationTime']) assert.equal(fields.get(id).readOnly, userRole === 'CONDOMINO');
  }
});
