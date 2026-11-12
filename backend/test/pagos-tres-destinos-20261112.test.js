'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const official=require('../src/services/pagos-cuenta-oficial.service');
const server=require('../src/services/comprobante-parser');
const browser=require('../../docs/assets/js/comprobante-parser');
const bank=require('../src/services/banco-correo.service');
const cfg={PAGOS_BANCO:'BANCO DE PRUEBA',PAGOS_TITULAR:'BENEFICIARIO DE PRUEBA',
 PAGOS_CUENTA:'00000000002440',PAGOS_CLABE:'000000000000004409',
 PAGOS_TARJETA:'0000000000004884',PAGOS_DESTINO_ULTIMOS4:'4409'};
const allowed=official.obtener(cfg).destinosUltimos4;
test('terminaciones autorizadas derivadas de identificadores oficiales',()=>{
 assert.deepEqual(allowed,['4409','4884','2440']);
 assert.equal(allowed.includes('9999'),false);
});
for(const [name,parser] of [['backend',server],['navegador',browser]]){
 for(const ending of allowed)test(name+': admite '+ending+' solo con el beneficiario',()=>{
  const text='Transferencia exitosa\nOrigen Cuenta -9999\nDestino BENEFICIARIO DE PRUEBA\nCuenta receptora -'+ending+'\nReferencia 1234567';
  const result=parser.verifyDestination(text,cfg.PAGOS_TITULAR,allowed);
  assert.equal(result.ok,true);
  assert.equal(result.matchedSuffix,ending);
 });
 test(name+': rechazo de cuenta ajena o confusión con origen',()=>{
  assert.equal(parser.verifyDestination('Destino BENEFICIARIO DE PRUEBA -9999',cfg.PAGOS_TITULAR,allowed).ok,false);
  assert.equal(parser.verifyDestination('Origen BENEFICIARIO DE PRUEBA -4884\nDestino PERSONA AJENA -2440',cfg.PAGOS_TITULAR,allowed).ok,false);
 });
}
test('aviso autenticado y datos bancarios deben coincidir',()=>{
 const pago={monto:2000,fechaOperacion:'2026-11-12',horaOperacion:'10:30:00'};
 for(const ending of allowed){
  const noticia={id:'test',autorizado:true,reciente:true,cuenta:ending,monto:2000,fecha:'2026-11-12'};
  assert.equal(bank.coincideDatosBancarios(pago,noticia,cfg),true);
  assert.equal(bank.coincideDatosBancarios(pago,{...noticia,autorizado:false},cfg),false);
  assert.equal(bank.coincideDatosBancarios(pago,{...noticia,monto:1999},cfg),false);
 }
});
