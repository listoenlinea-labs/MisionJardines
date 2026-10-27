'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PagoReportado}=require('../src/models');
const lector=require('../src/services/comprobante-lector.service');
const parser=require('../src/services/comprobante-parser');
const ids=require('../src/services/identificadores-bancarios.service');
const bankWorker=require('../src/services/banco-correo-worker.service');
const {releerComprobante}=require('../src/services/pagos-relectura-ocr.service');

const img='data:image/png;base64,AAAA';
const base=()=>({
 id:32,casaId:738,estatus:'PENDIENTE_VALIDACION',
 comprobanteData:img,folioOperacion:'0910260',
 fechaOperacion:'2026-10-26',horaOperacion:'17:53:00',monto:'10.00',
 verificacionBancaria:{etapa:'REINTENTO_OCR',reintentos:1,historialReintentos:[{etapa:'FALLIDO'}]}
});
const extraido={referencia:'0910260',claveRastreo:'',folio:'',amount:'10.00',date:'2026-10-26',time:'17:53:00'};
function stub(t,pago,ext=extraido){
 const changes=[];
 t.mock.method(PagoReportado,'findByPk',async()=>pago);
 t.mock.method(PagoReportado,'update',async(data,options)=>{
   changes.push({data,options});
   return [1];
 });
 t.mock.method(lector,'reconocerImagen',async image=>{
   assert.equal(image,img);
   return 'Monto transferido\\n$10.00\\nReferencia 0910260';
 });
 t.mock.method(lector,'validarCamposExtraidos',()=>{});
 t.mock.method(parser,'verifyDestination',()=>({ok:true}));
 t.mock.method(parser,'extract',()=>ext);
 t.mock.method(ids,'almacenarVerificados',()=>({
   version:1,origen:'OCR_SERVIDOR',tipo:'referencia',referencia:'910260'
 }));
 t.mock.method(bankWorker,'programarRevision',()=>{});
 return changes;
}
test('relee el original mediante OCR y después activa Titan sin acreditar',async t=>{
 const changes=stub(t,base());
 const result=await releerComprobante(32);
 assert.equal(result.etapa,'REINTENTO_TITAN');
 assert.equal(lector.reconocerImagen.mock.callCount(),1);
 assert.equal(bankWorker.programarRevision.mock.callCount(),1);
 assert.equal(changes.length,1);
 assert.equal(changes[0].data.verificacionBancaria.etapa,'REINTENTO_TITAN');
 assert.equal(changes[0].data.verificacionBancaria.reintentos,1);
 assert.ok(changes[0].data.textoOcr.includes('Monto'));
 assert.equal(changes[0].data.estatus,undefined);
 assert.equal(changes[0].data.monto,undefined);
 assert.equal(changes[0].data.folioOperacion,undefined);
});
test('si la nueva lectura altera el importe, rechaza sin actualizar datos ni consultar Titan',async t=>{
 const changes=stub(t,base(),{...extraido,amount:'20.00'});
 const result=await releerComprobante(32);
 assert.equal(result.etapa,'REINTENTO_OCR_FALLIDO');
 assert.equal(changes[0].data.estatus,'RECHAZADO');
 assert.equal(changes[0].data.textoOcr,undefined);
 assert.equal(bankWorker.programarRevision.mock.callCount(),0);
});
test('no vuelve a leer comprobantes validados ni reintentos ya pasados a Titan',async t=>{
 const changes=stub(t,{...base(),verificacionBancaria:{etapa:'REINTENTO_TITAN'}});
 assert.equal(await releerComprobante(32),undefined);
 assert.equal(lector.reconocerImagen.mock.callCount(),0);
 assert.equal(changes.length,0);
});
test('el modal expone etapas del OCR, banco, errores inline y sondeo automático',()=>{
 const js=fs.readFileSync(path.resolve(__dirname,'../../docs/assets/js/pagos.js'),'utf8');
 const html=fs.readFileSync(path.resolve(__dirname,'../../docs/pagos.html'),'utf8');
 const bank=fs.readFileSync(path.resolve(__dirname,'../src/services/banco-correo-worker.service.js'),'utf8');
 assert.match(js,/REINTENTO_OCR/);
 assert.match(js,/REINTENTO_TITAN/);
 assert.match(js,/retryFeedback/);
 assert.match(js,/receiptDetailsPolling/);
 assert.match(html,/receipt-retry-spinner/);
 assert.match(bank,/if\(datosReintento\(pago\.verificacionBancaria\)\.etapa==='REINTENTO_OCR'\)continue/);
});
