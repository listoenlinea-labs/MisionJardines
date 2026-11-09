'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const backend=file=>fs.readFileSync(path.resolve(__dirname,'../src/services',file),'utf8');
function load(src,requireFake){
 const module={exports:{}};
 vm.runInNewContext(src,{module,exports:module.exports,require:requireFake,console,Date,Buffer}, {filename:'servicio-probado.js'});
 return module.exports;
}
const historial=load(backend('historial-pagos-vivienda.service.js'),()=>{throw Error('Historial no necesita módulos externos')});
const service=load(backend('recibo-mantenimiento-analisis.service.js'),id=>{
 if(id==='node:crypto')return require('node:crypto');
 if(id==='sequelize')return {Op:{}};
 if(id==='../models')return {Casa:{},Cuota:{},PagoReportado:{},Condomino:{},CondominoVivienda:{},Usuario:{},UsuarioCasa:{}};
 if(id==='./historial-pagos-vivienda.service')return historial;
 if(id==='./pdf.service')return {generarReciboPdf(){}};
 throw Error('Dependencia inesperada: '+id);
});
const {reciboDelPeriodo}=load(backend('recibo-periodo-excel.service.js'),id=>{
 assert.equal(id,'./recibo-mantenimiento-analisis.service');
 return service;
});
const casa={id:4,calleCorrecta:'Gardenias',calle:'Gardenias',numero:'4',nombre:'Residente'};
const cuota=(mes,ref,overrides={})=>({
 id:mes==='NOVIEMBRE'?11:10,anio:2026,mes,
 montoPagado:300,estatusPago:'PAGADO',referencia:ref,
 fechaPago:'2026-10-22',fechaConfirmacion:'2026-10-22',
 formaPago:'TRANSFERENCIA',origenImportacion:'MANUAL_ANALISIS',
 ...overrides
});
const pedir=(cuotas,opts={})=>reciboDelPeriodo({
 casa,cuotas,comprobantes:[],estado:'PAGADO',saldoPendiente:0,anio:2026,mes:11,...opts
});

test('pago de noviembre: folio del mismo recibo que entrega el generador PDF',()=>{
 const cuotas=[cuota('NOVIEMBRE','MJMAN-2026-11-4')];
 const actual=pedir(cuotas);
 const referencia='MJMAN-2026-11-4';
 const delPdf=service.datosDeMovimiento(casa,cuotas,[],new Date(),'2026-11').resumen;
 assert.equal(actual.folio,delPdf.folio);
 assert.equal(actual.referencia,referencia);
 assert.match(actual.folio,/^MJ-NOV-2026-[A-F0-9]{10}-G4-M$/);
});

test('sin pago del mes, aunque sí exista recibo de octubre: blanco',()=>{
 assert.equal(pedir([cuota('OCTUBRE','MJ-2026-0418')]),null);
 assert.equal(pedir([cuota('NOVIEMBRE','')]),null);
 assert.equal(pedir([cuota('NOVIEMBRE','MJ-ABONO')],{estado:'PAGO_PARCIAL'}),null);
 assert.equal(pedir([cuota('NOVIEMBRE','MJ-PAGADO')],{saldoPendiente:300}),null);
 assert.equal(pedir([cuota('NOVIEMBRE','MJ-PAGADO')],{estado:'PENDIENTE'}),null);
});

test('pago anticipado cubre noviembre con folio del movimiento original',()=>{
 const cuotas=[cuota('OCTUBRE','ANTICIPO-2026'),cuota('NOVIEMBRE','ANTICIPO-2026',{id:11})];
 const original=pedir(cuotas);
 assert.equal(original.referencia,'ANTICIPO-2026');
 assert.match(original.folio,/^MJ-OCT-2026-[A-F0-9]{10}-G4-M$/);
 // El reporte de noviembre no inventa un segundo folio para el mismo pago.
 assert.equal(original.folio,service.datosDeMovimiento(casa,cuotas,[],new Date(),null,'ANTICIPO-2026').resumen.folio);
});

test('exportación: deudores quedan sin referencia, pagados ven folio PDF',()=>{
 const {prepararReporte}=require('../../docs/assets/js/analisis-excel.js');
 const recibo=pedir([cuota('NOVIEMBRE','NOV-REFERENCIA')]);
 const base={calle:'Gardenias',numero:'4',nombre:'Prueba',montoPagado:300,
  ultimoPago:{monto:300,fecha:'2026-10-02',referencia:'MJ-2026-0418'},saldoPendiente:0};
 const viviendas=[
  {...base,casaId:4,estatus:'PAGADO',pagada:true,reciboPeriodo:recibo},
  {...base,casaId:5,numero:'5',estatus:'PENDIENTE',pagada:false,saldoPendiente:300,
   ultimoPago:{monto:300,fecha:'2026-10-02',referencia:'MJ-2026-0372'},reciboPeriodo:null},
  {...base,casaId:6,numero:'6',estatus:'PAGO_PARCIAL',pagada:true,montoPagado:100,saldoPendiente:200,
   reciboPeriodo:null}
 ];
 const reporte=prepararReporte({periodo:'NOVIEMBRE 2026',viviendasMantenimiento:viviendas},'padron');
 const hoja=reporte.hojas.find(h=>h.nombre==='Todas las viviendas');
 assert.equal(hoja.filas[0][10],recibo.folio);
 assert.equal(hoja.filas[1][10],'');
 assert.equal(hoja.filas[2][10],'');
 assert.deepEqual(Object.keys(reporte.enlacesRecibos),['4']);
 assert.equal(reporte.enlacesRecibos['4'].referencia,'NOV-REFERENCIA');
});
