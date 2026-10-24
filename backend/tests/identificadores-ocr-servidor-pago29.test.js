'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const ids=require('../src/services/identificadores-bancarios.service');
const parser=require('../src/services/comprobante-parser');
const bank=require('../src/services/banco-correo.service');
const diag=require('../src/services/banco-diagnostico.service');
const aviso={
 id:'titan:autenticado',autorizado:true,reciente:true,
 tracking:'MBAN01002610260078204229',referencia:'910260',folio:'',
 monto:10,cuenta:'409',fecha:'2026-10-26',concepto:'casa TEST-001'
};
const ocr=[
 'Transferencia exitosa','Monto transferido','$10.00',
 'Destino MARIA DEL ROCIO BAHENA JUAREZ cuenta 4409',
 'Referencia','0910260','Folio de operación','1769715857',
 'Fecha de operación','26 oct 2026, 18:41 h.'
].join('\n');
function recibo(){
 return {id:29,folioOperacion:'0910260',fechaOperacion:'2026-10-23',
  horaOperacion:'18:41:00',monto:10,textoOcr:ocr,
  casa:{calle:'Prueba',numero:'TEST-001'}};
}
test('identidad OCR del servidor se almacena y conserva el tipo referencia',()=>{
 const datos=ids.almacenarVerificados(parser.extract(ocr),'0910260');
 assert.equal(datos.origen,'OCR_SERVIDOR');
 assert.equal(datos.tipo,'referencia');
 assert.equal(datos.referencia,'910260');
 const payment={...recibo(),identificadoresVerificados:datos};
 assert.equal(ids.identificadoresPago(payment).referencia,'910260');
 assert.equal(bank.corresponde(payment,aviso,{PAGOS_DESTINO_ULTIMOS4:'4409'}),true);
});
test('registro anterior sin metadatos compara 0910260 con 910260',()=>{
 assert.equal(ids.coinciden(recibo(),aviso),true);
 assert.equal(diag.evaluar(recibo(),[aviso],[aviso]).etapa,'COINCIDENCIA_VERIFICADA');
});
test('la recuperación histórica no convierte folio en referencia',()=>{
 const payment={...recibo(),textoOcr:'Folio de operación\n910260'};
 assert.equal(ids.coinciden(payment,aviso),false);
});
test('referencia distinta 0921060 nunca se convierte en 910260',()=>{
 const payment={...recibo(),folioOperacion:'0921060',textoOcr:'Referencia\n0921060'};
 assert.equal(ids.coinciden(payment,aviso),false);
 assert.equal(diag.evaluar(payment,[aviso],[aviso]).etapa,'SIN_COINCIDENCIA');
});
test('OCR servidor no permite almacenar un valor distinto al identificado',()=>{
 assert.throws(()=>ids.almacenarVerificados(parser.extract(ocr),'0921060'),/no coinciden/i);
 assert.throws(()=>ids.almacenarVerificados(parser.extract(ocr),'1769715857'),/no coinciden/i);
});
test('importe, destinatario y autenticación siguen siendo obligatorios',()=>{
 const payment={...recibo(),identificadoresVerificados:ids.almacenarVerificados(parser.extract(ocr),'0910260')};
 assert.equal(bank.corresponde(payment,{...aviso,monto:100},{PAGOS_DESTINO_ULTIMOS4:'4409'}),false);
 assert.equal(bank.corresponde(payment,{...aviso,cuenta:'666'},{PAGOS_DESTINO_ULTIMOS4:'4409'}),false);
 assert.equal(bank.corresponde(payment,{...aviso,autorizado:false},{PAGOS_DESTINO_ULTIMOS4:'4409'}),false);
 assert.equal(bank.corresponde(payment,{...aviso,concepto:'Gardenias 8'},{PAGOS_DESTINO_ULTIMOS4:'4409'}),false);
 assert.equal(bank.corresponde(payment,{...aviso,fecha:'2026-10-30'},{PAGOS_DESTINO_ULTIMOS4:'4409'}),false);
});
test('diagnóstico permite saber dónde falta coincidencia sin divulgar valores',()=>{
 const payment={...recibo(),folioOperacion:'0921060',textoOcr:'Referencia\n0921060'};
 const status=diag.evaluar(payment,[aviso],[aviso]);
 assert.equal(status.diagnosticoReferencia.coincideFormularioAviso,false);
 assert.equal(status.diagnosticoReferencia.coincideFormularioOcr,true);
 assert.equal(status.diagnosticoReferencia.reconocidaEnOcr,true);
 assert.ok(!status.detalle.includes('910260'));
});
