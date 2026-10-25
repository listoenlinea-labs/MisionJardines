'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {calcularAdeudoVivienda}=require('../src/services/adeudo-vivienda-analisis.service');
const {estadoPeriodoMantenimiento,estadoSeguridadDesdeAnalisis}=require('../src/services/estado-mantenimiento-tablas.service');

function controlador(){
  const source=fs.readFileSync(path.join(__dirname,'../src/controllers/seguridad-cuotas.controller.js'),'utf8');
  const mod={exports:{}};
  const fakeRequire=name=>{
    if(name==='../models')return {Casa:{},Cuota:{}};
    if(name.startsWith('../services/'))return require(path.resolve(__dirname,'../src/controllers',name));
    throw Error('Dependencia inesperada '+name);
  };
  new Function('require','module',source)(fakeRequire,mod);
  return mod.exports;
}
const fecha=new Date('2026-10-25T10:00:00Z');
const pago=(mes,monto=150,more={})=>({anio:2026,mes,estatusPago:'PAGADO',montoPagado:monto,montoCuota:monto,fechaPago:'2026-10-22T12:00:00Z',...more});
const casa={id:752,calle:'Atotonilco',numero:'752',cuotaPorCobrar:150,exencionesRecargo:[{desde:'2026-10',hasta:null}]};
const comparar=(house,cuotas,esperado,importe)=>{
  const hoy='2026-10-25',anio=2026,mes=10;
  const adeudo=calcularAdeudoVivienda(cuotas,{anio,mes,hoy,
    tarifa:house.cuotaPorCobrar??300,exencionesRecargo:house.exencionesRecargo||[]});
  const q=cuotas.find(x=>x.anio===anio&&x.mes==='OCTUBRE');
  const estadoAnalisis=estadoPeriodoMantenimiento(q,adeudo,anio,mes);
  const seguridad=controlador().resumenVivienda(house,cuotas,fecha);
  assert.equal(seguridad.estado,estadoSeguridadDesdeAnalisis(estadoAnalisis));
  assert.equal(seguridad.estado,esperado);
  assert.equal(adeudo.saldoPendiente,importe);
  return seguridad;
};
test('Atotonilco 752: $150 de octubre pagados y un pendiente anterior no lo vuelven deudor',()=>{
 const cuotas=[
   {anio:2026,mes:'AGOSTO',estatusPago:'PENDIENTE',montoPagado:0},
   pago('SEPTIEMBRE'),pago('OCTUBRE')
 ];
 const v=comparar(casa,cuotas,'AL_CORRIENTE',0);
 assert.equal(v.ultimoMesPagado,'OCTUBRE 2026');
 assert.equal(v.ultimaFechaPago,'2026-10-22');
});
test('Tarifa especial y exención: septiembre pagado, octubre sin pagar es DEUDOR de $150',()=>{
 comparar(casa,[pago('SEPTIEMBRE')],'DEUDOR',150);
});
test('Sin exención, octubre vencido debe $200 con tarifa especial',()=>{
 comparar({...casa,exencionesRecargo:[]},[pago('SEPTIEMBRE')],'DEUDOR',200);
});
test('Sin ningún pago: ambos módulos detectan deuda desde enero de 2026',()=>{
 comparar({id:3,calle:'Gardenias',numero:'3',cuotaPorCobrar:300},[],'DEUDOR',3500);
});
test('Pago completo de diciembre anticipado mantiene vivienda al corriente',()=>{
 const v=comparar(casa,[pago('DICIEMBRE')],'AL_CORRIENTE',0);
 assert.equal(v.ultimoMesPagado,'DICIEMBRE 2026');
});
test('Abono parcial de octubre no equivale a una mensualidad completa',()=>{
 comparar(casa,[pago('SEPTIEMBRE'),{anio:2026,mes:'OCTUBRE',estatusPago:'PAGO_PARCIAL',montoPagado:50,montoCuota:150,fechaPago:'2026-10-22T12:00:00Z'}],'DEUDOR',100);
});
test('No se publican nombre, correo ni teléfono en la respuesta de Seguridad',()=>{
 const v=controlador().resumenVivienda({...casa,nombre:'PERSONAL',email:'PRIVADO',telefono:'PRIVADO'},[pago('OCTUBRE')],fecha);
 assert.deepEqual(Object.keys(v).sort(),['calle','estado','numero','ultimaFechaPago','ultimoMesPagado'].sort());
});
