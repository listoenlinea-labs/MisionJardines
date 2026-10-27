'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const parser=require('../src/services/comprobante-parser');
const browser=require('../../docs/assets/js/comprobante-parser');
const ids=require('../src/services/identificadores-bancarios.service');
const bank=require('../src/services/banco-correo.service');
const diag=require('../src/services/banco-diagnostico.service');

const original=[
 'Transferencia exitosa',
 'Transferiste $10.00',
 'Enviado a MARIA DEL ROCIO BAHENA JUAREZ 4409',
 '26 oct 2026, 17:53 h.',
 'Movimiento confirmado',
 'MBAN01002610260078204229',
 'Operacion exitosa',
 '0910260',
 'Cuenta origen 9669',
 'CLABE destino 127180000000004409',
 'Comision $0.00'
].join('\n');
const aviso={
 id:'titan-auth-id',autorizado:true,reciente:true,
 referencia:'910260',tracking:'MBAN01002610260078204229',
 folio:'',monto:10,cuenta:'409',fecha:'2026-10-26'
};
for(const [name,p] of [['server',parser],['browser',browser]]){
 test(name+' extrae códigos sin etiqueta sin confundir cuentas y comisiones',()=>{
   const c=p.candidatosOperacion(original);
   assert.ok(c.includes('MBAN01002610260078204229'));
   assert.ok(c.includes('0910260'));
   assert.ok(!c.includes('127180000000004409'));
   assert.ok(!c.includes('9669'));
   assert.equal(p.verifyDestination(original,'MARIA DEL ROCIO BAHENA JUAREZ','4409').ok,true);
   assert.equal(p.extract(original).amount,'10.00');
 });
}
test('código OCR sin etiqueta requiere exactamente un aviso bancario compatible',()=>{
 const extracted=parser.extract(original);
 const meta=ids.almacenarVerificados(extracted,'0910260',original);
 assert.equal(meta.tipo,'candidato');
 const pago={folioOperacion:'0910260',monto:10,fechaOperacion:'2026-10-26',
   horaOperacion:'17:53:00',textoOcr:original,identificadoresVerificados:meta};
 assert.equal(ids.coinciden(pago,aviso),true);
 assert.equal(bank.corresponde(pago,aviso,{PAGOS_DESTINO_ULTIMOS4:'4409'}),true);
 assert.equal(diag.evaluar(pago,[aviso],[aviso]).etapa,'COINCIDENCIA_VERIFICADA');
 for(const bad of [
   {...aviso,monto:15},{...aviso,cuenta:'888'},
   {...aviso,autorizado:false},{...aviso,fecha:'2026-10-20'},
   {...aviso,referencia:'2222222',tracking:'OTRACLAVE123456789'}
 ]) assert.equal(bank.corresponde(pago,bad,{PAGOS_DESTINO_ULTIMOS4:'4409'}),false);
 assert.equal(diag.evaluar(pago,[aviso,{...aviso,id:'duplicado'}],[aviso,{...aviso,id:'duplicado'}]).etapa,'COINCIDENCIA_AMBIGUA');
});
test('código de cuenta sin etiqueta no pasa como identificador',()=>{
 const text='Transferiste $10.00\nCuenta origen 123456789012\nCuenta destino 127180000000004409\n26 oct 2026';
 assert.deepEqual(parser.candidatosOperacion(text),[]);
 assert.throws(()=>ids.almacenarVerificados(parser.extract(text),'123456789012',text),{status:422});
});
test('no reasignar folio etiquetado como referencia',()=>{
 const avisoReferencia={...aviso,referencia:'9911223344',tracking:''};
 const p={textoOcr:'Folio de operacion 9911223344',folioOperacion:'9911223344'};
 assert.equal(ids.coinciden(p,avisoReferencia),false);
});
test('correo con otro encabezado bancario mantiene lectura tipificada',()=>{
 const from='Recibiste de otro banco $10.00 26/Oct/2026, 17:53 A tu cuenta ****4409\nNumero de operacion\n9999988888';
 const data=bank.datosAviso({
  id:'m-id',receivedDateTime:new Date().toISOString(),subject:'Notificación Banco Azteca',
  from:{emailAddress:{address:'autorizado@example.test'}},
  body:{content:from}
 },{PAGOS_BANK_FORWARD_FROM_ADDRESS:'autorizado@example.test',
    PAGOS_BANK_MAIL_SUBJECT:'Notificación Banco Azteca',PAGOS_BANK_MAIL_MAX_DIAS:7});
 assert.equal(data.folio,'9999988888');
});
