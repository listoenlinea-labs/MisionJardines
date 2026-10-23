'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const banco=require('../src/services/banco-correo.service');
const config={PAGOS_BANK_FORWARD_FROM_ADDRESS:'administrador@correo.example',PAGOS_DESTINO_ULTIMOS4:'1234'};
// Datos sintéticos: conserva la estructura del aviso sin publicar la operación real.
const details='\n08/Oct/2026, 12:50:00\nA tu cuenta ***234\nBeneficiario\nPersona de prueba\nConcepto\nCalle Prueba 1\nDe la cuenta\nBANCO EMISOR ***999\nTipo de operación\nSPEI\nComisión (incluye IVA)\n$0\nReferencia\n1111111\nClave de rastreo\nPRUEBA000000000000001';
function notice(content){return banco.datosAviso({id:'aviso-sintetico',receivedDateTime:new Date().toISOString(),
 from:{emailAddress:{address:'administrador@correo.example'}},subject:'RV: Notificación Banco Azteca',
 internetMessageHeaders:[{name:'Authentication-Results',value:'dkim=pass dmarc=pass header.from=correo.example'}],body:{content}},config);}
const pago={folioOperacion:'PRUEBA000000000000001',fechaOperacion:'2026-10-08',monto:300,casa:{calle:'Calle Prueba',numero:'1'}};
test('lee $300 en una fila debajo de Recibiste de otro banco y no toma la comisión de $0',()=>{
 const n=notice('Recibiste de otro banco\n\n$300\n'+details);
 assert.equal(n.monto,300);assert.equal(n.fecha,'2026-10-08');assert.equal(n.cuenta,'234');assert.equal(n.autorizado,true);
 assert.equal(banco.corresponde(pago,n,config),true);
 assert.equal(banco.corresponde({...pago,monto:0},n,config),false);
});
test('lee filas HTML del aviso y conserva importe y centavos a través de celdas y etiquetas',()=>{
 const html='<table><tr><td>Recibiste de otro banco</td></tr><tr><td><strong>$300.50</strong></td></tr></table>'+details.replaceAll('\n','<br>');
 const n=notice(html);assert.equal(n.monto,300.5);
 assert.equal(banco.corresponde({...pago,monto:300.5},n,config),true);
 assert.equal(banco.corresponde(pago,n,config),false);
});
test('conserva formato en una línea, otra cuenta, separador de miles y espacios HTML',()=>{
 for(const [body,value] of [['Recibiste de otro banco $300',300],['Recibiste de otra cuenta\r\n$1,234.56',1234.56],
  ['Recibiste de otro banco&nbsp;<br>\t$&nbsp;300.00',300],['Recibiste de otro banco\n'+' '.repeat(500)+'$300',300]]){
  assert.equal(notice(body+details).monto,value);
 }
});
test('si falta el monto recibido no busca el importe en comisión, saldo u otro campo',()=>{
 for(const field of ['Comisión (incluye IVA)','Saldo','Concepto','A tu cuenta ***234']){
  const n=notice('Recibiste de otro banco\n'+field+'\n$300'+details);
  assert.equal(n.monto,null,field);assert.equal(banco.corresponde(pago,n,config),false);
 }
 assert.equal(notice('Comisión\n$300'+details).monto,null);
});
test('montos monetarios mal formados no se truncan a una cantidad válida',()=>{
 for(const value of ['$300.5','$300.500','$1,23','$300,00','$300.00.00'])assert.equal(notice('Recibiste de otro banco\n'+value+details).monto,null,value);
});
test('avisos con importes recibidos distintos quedan ambiguos, no se elige uno arbitrariamente',()=>{
 const n=notice('Recibiste de otro banco\n$300\nRecibiste de otro banco\n$600'+details);
 assert.equal(n.monto,null);assert.equal(banco.corresponde(pago,n,config),false);
});
test('copias de texto/HTML del mismo importe no duplican el depósito',()=>{
 const n=notice('Recibiste de otro banco\n$300\nRecibiste de otro banco\n$300.00'+details);
 assert.equal(n.monto,300);
});
