'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {mexico,fechaOperativaSpei,equivaleFechaSpei,resolverFechaCapturada}=require('../src/services/fecha-operativa-spei.service');
const {validarCamposExtraidos}=require('../src/services/comprobante-lector.service');
const banco=require('../src/services/banco-correo.service');
const viernesAntesCorte=new Date('2026-10-23T23:54:00Z'); // 17:54 Mexico
const viernesDespuesCorte=new Date('2026-10-24T00:54:00Z'); // 18:54 Mexico

test('SPEI cambia de dia operativo viernes a las 18:00 y muestra lunes',()=>{
 assert.deepEqual(mexico(viernesDespuesCorte),{fecha:'2026-10-23',hora:'18:54:00'});
 assert.equal(fechaOperativaSpei('2026-10-23','17:59:59'),'2026-10-23');
 assert.equal(fechaOperativaSpei('2026-10-23','18:00:00'),'2026-10-26');
 assert.equal(fechaOperativaSpei('2026-10-23','18:41:55'),'2026-10-26');
 assert.equal(fechaOperativaSpei('2026-10-22','18:41:55'),'2026-10-23');
 assert.equal(fechaOperativaSpei('2026-10-24','12:41:55'),'2026-10-26');
});

test('normaliza día SPEI cuando es verificable, y permite reportar otras fechas posteriores',()=>{
 assert.deepEqual(resolverFechaCapturada('2026-10-26','18:41:00',viernesDespuesCorte),{
  ok:true,fechaOperacion:'2026-10-23',fechaComprobante:'2026-10-26',ajusteSpei:true
 });
 for(const [fecha,hora,now] of [
  ['2026-10-26','18:41:00',viernesAntesCorte],
  ['2026-10-26','19:54:00',viernesDespuesCorte],
  ['2026-10-27','18:41:00',viernesDespuesCorte],
  ['2026-10-26','18:41:00',new Date('2026-10-24T13:00:00Z')],
  ['2026-11-03','12:00:00',viernesDespuesCorte],
 ]) {
  const data=resolverFechaCapturada(fecha,hora,now);
  assert.equal(data.ok,true);
  assert.equal(data.fechaOperacion,fecha);
  assert.equal(data.fechaPosterior,true);
  assert.equal(data.ajusteSpei,false);
 }
 assert.equal(resolverFechaCapturada('2026-10-23','18:41:00',viernesDespuesCorte).ajusteSpei,false);
 assert.equal(resolverFechaCapturada('2026-02-30','18:41:00',viernesDespuesCorte).ok,false);
});

test('OCR comprueba la fecha SPEI sin dejar pasar otras fechas',()=>{
 const campos={folioOperacion:'1769715857',fechaOperacion:'2026-10-23',horaOperacion:'18:41:00',monto:10};
 const extraido={folio:'1769715857',date:'2026-10-26',time:'18:41:00',amount:'10.00'};
 assert.doesNotThrow(()=>validarCamposExtraidos(campos,extraido,true));
 assert.throws(()=>validarCamposExtraidos(campos,{...extraido,date:'2026-10-27'},true),/fecha/i);
 assert.throws(()=>validarCamposExtraidos({...campos,horaOperacion:'17:41:00'},extraido,true),/fecha/i);
 assert.throws(()=>validarCamposExtraidos(campos,{...extraido,amount:'100.00'},true),/monto/i);
 assert.equal(equivaleFechaSpei('2026-10-23','2026-10-26','18:41:00'),true);
});

test('buzón admite fecha 23 o 26 SOLO si clave, monto, vivienda y autenticación coinciden',()=>{
 const pago={folioOperacion:'MBAN01002610260078204229',fechaOperacion:'2026-10-23',horaOperacion:'18:41:55',monto:10,casa:{calle:'Prueba',numero:'TEST-001'}};
 const aviso={autorizado:true,reciente:true,id:'mensaje-unico',tracking:'MBAN01002610260078204229',fecha:'2026-10-26',monto:10,cuenta:'409',concepto:'PRUEBA TEST 001'};
 assert.equal(banco.corresponde(pago,aviso,{PAGOS_DESTINO_ULTIMOS4:'4409'}),true);
 assert.equal(banco.corresponde(pago,{...aviso,fecha:'2026-10-23'},{PAGOS_DESTINO_ULTIMOS4:'4409'}),true);
 assert.equal(banco.corresponde(pago,{...aviso,fecha:'2026-10-27'},{PAGOS_DESTINO_ULTIMOS4:'4409'}),false);
 const pagoConFechaBancariaPosterior={...pago,fechaOperacion:'2026-10-26'};
 assert.equal(banco.corresponde(pagoConFechaBancariaPosterior,{...aviso,fecha:'2026-10-23'},{PAGOS_DESTINO_ULTIMOS4:'4409'}),true);
 assert.equal(banco.corresponde(pagoConFechaBancariaPosterior,{...aviso,fecha:'2026-10-22'},{PAGOS_DESTINO_ULTIMOS4:'4409'}),false);
 assert.equal(banco.corresponde(pago,{...aviso,tracking:'1769715857'},{PAGOS_DESTINO_ULTIMOS4:'4409'}),false);
 assert.equal(banco.corresponde(pago,{...aviso,monto:100},{PAGOS_DESTINO_ULTIMOS4:'4409'}),false);
 assert.equal(banco.corresponde(pago,{...aviso,autorizado:false},{PAGOS_DESTINO_ULTIMOS4:'4409'}),false);
});
