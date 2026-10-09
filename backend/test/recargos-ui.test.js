const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname,'../../docs/assets/js/pagos.js'),'utf8');
function setup() {
  const elements = new Map(), requests = [];
  const $ = id => {
    if (!elements.has(id)) elements.set(id,{ value:'', textContent:'', classList:{ toggle(){} } });
    return elements.get(id);
  };
  const context = { $, requests, money:v => '$'+Number(v).toFixed(2), headers:()=>({}), config:null, selectedExtra:null };
  const summary = source.slice(source.indexOf('    async function updatePaymentSummary()'),source.indexOf('    function setTab'));
  const preview = source.slice(source.indexOf('    function updatePreview()'),source.indexOf('    let pendingItems'));
  vm.runInNewContext(`let quote=null,quoteRevision=0,paymentType='MANTENIMIENTO';
    const api = url => new Promise((resolve,reject)=>requests.push({url,resolve,reject}));
    ${summary}\n${preview}
    this.summary=updatePaymentSummary;this.preview=updatePreview;this.current=()=>quote;
    this.extra=()=>paymentType='EXTRAORDINARIO';`,context);
  return { $, context, requests };
}
test('la respuesta antigua no reemplaza la cotización de la fecha seleccionada', async()=>{
 const { $, context:c, requests }=setup();
 $('operationDate').value='2026-10-11';const first=c.summary();
 $('operationDate').value='2026-10-12';const second=c.summary();
 requests[1].resolve({data:{recargo:0,minimo:300,saldoParcial:0,fechaFinalC3:'2026-11-10'}});await second;
 requests[0].resolve({data:{recargo:50,minimo:350,saldoParcial:0,fechaFinalC3:'2026-10-10'}});await first;
 assert.equal(c.current().fechaOperacion,'2026-10-12');assert.equal($('summaryLate').textContent,'$0.00');assert.equal($('amount').min,'300');
});
test('la estimación usa el recargo del servidor y saldo a favor, no el día del depósito',async()=>{
 const {$,context:c,requests}=setup();$('operationDate').value='2026-10-12';$('amount').value='50';
 const call=c.summary();requests[0].resolve({data:{recargo:0,minimo:50,saldoParcial:250,fechaFinalC3:'2027-02-10'}});await call;
 assert.match($('paymentPreview').textContent,/1 mensualidad/);assert.match($('paymentPreview').textContent,/\$0.00 de recargos/);
});
test('un fallo del C3 elimina la cotización utilizable y muestra la causa',async()=>{
 const {$,context:c,requests}=setup();$('operationDate').value='2026-10-12';
 const call=c.summary();requests[0].reject(Error('C3 desconectado'));await call;
 assert.equal(c.current(),null);assert.equal($('paymentPreview').textContent,'C3 desconectado');
});
