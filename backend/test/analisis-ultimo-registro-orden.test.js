'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const {ultimosRegistrosPago}=require('../src/services/ultimo-registro-pago.service');
const sorter=require('../../docs/assets/js/analisis-orden-viviendas');
const read=path=>fs.readFileSync(__dirname+'/../../'+path,'utf8');
const source=read('docs/assets/js/analisis-cuotas.js');
const last=(data,casa=1,tipo='MANTENIMIENTO')=>ultimosRegistrosPago(data).get(casa+':'+tipo);

test('usa subida del folio y no depósito, aprobación ni mes cubierto',()=>{
 const reportado={casaId:1,tipoPago:'MANTENIMIENTO',creadoEn:'2026-10-12T10:00:00Z',fechaOperacion:'2026-09-20',fechaValidacion:'2026-10-21',folioOperacion:'PRUEBA',estatus:'VALIDADO'};
 const cuota={casaId:1,referencia:'prueba',origenImportacion:'MANUAL_ANALISIS',fechaConfirmacion:'2026-10-21T20:00:00Z',estatusPago:'PAGADO',montoPagado:300};
 assert.equal(last({reportados:[reportado],cuotas:[cuota]}).fecha,'2026-10-12T10:00:00.000Z');
});
test('incluye folios pendientes y rechazados como reportes sin considerarlos pagos validados',()=>{
 for(const estatus of ['PENDIENTE_VALIDACION','RECHAZADO']){
  const value=last({reportados:[{casaId:1,tipoPago:'MANTENIMIENTO',creadoEn:'2026-10-21T12:00:00Z',estatus}]});
  assert.equal(value.estatus,estatus);assert.equal(value.fuente,'FOLIO_REPORTADO');
 }
});
test('selecciona el registro más reciente por vivienda y concepto, sin depender del orden de consulta',()=>{
 const map=ultimosRegistrosPago({reportados:[
  {casaId:1,tipoPago:'MANTENIMIENTO',creadoEn:'2026-10-21T12:00:00Z'},
  {casaId:1,tipoPago:'MANTENIMIENTO',creadoEn:'2026-10-01T12:00:00Z'},
  {casaId:2,tipoPago:'MANTENIMIENTO',creadoEn:'2026-10-20T12:00:00Z'}],
  manuales:[{casaId:1,tipoPago:'CASA_CLUB',creadoEn:'2026-10-22T12:00:00Z'}]});
 assert.equal(map.get('1:MANTENIMIENTO').fecha,'2026-10-21T12:00:00.000Z');
 assert.equal(map.get('2:MANTENIMIENTO').fecha,'2026-10-20T12:00:00.000Z');
 assert.equal(map.get('1:CASA_CLUB').fecha,'2026-10-22T12:00:00.000Z');
});
test('captura manual usa su confirmación efectiva, aunque la cuota ya existiera',()=>{
 const value=last({cuotas:[{casaId:1,origenImportacion:'MANUAL_ANALISIS',estatusPago:'PAGADO',montoPagado:300,creadoEn:'2026-01-01',actualizadoEn:'2026-10-25',fechaPago:'2026-10-01',fechaConfirmacion:'2026-10-20T12:30:00Z'}]});
 assert.equal(value.fecha,'2026-10-20T12:30:00.000Z');assert.equal(value.fuente,'REGISTRO_MANUAL');
});
test('no inventa fechas a partir de importaciones, ediciones o cuotas pendientes sin cobro',()=>{
 assert.equal(last({cuotas:[{casaId:1,origenImportacion:'EXCEL_IMPORTADO',montoPagado:300,estatusPago:'PAGADO',creadoEn:'2026-10-20',actualizadoEn:'2026-10-21',fechaPago:'2026-10-01'}]}),undefined);
 assert.equal(last({cuotas:[{casaId:1,origenImportacion:'MANUAL_ANALISIS',montoPagado:0,estatusPago:'PENDIENTE',fechaConfirmacion:'2026-10-21'}]}),undefined);
 assert.equal(last({reportados:[{casaId:1,tipoPago:'MANTENIMIENTO',creadoEn:'invalida'}]}),undefined);
});
test('primer clic fecha descendente, segundo ascendente; nulos al final y hora determina orden',()=>{
 const rows=[{casaId:1,ultimoRegistroPago:{fecha:'2026-10-21T10:00:00Z'}},{casaId:2,ultimoRegistroPago:{fecha:'2026-10-21T20:00:00Z'}},{casaId:3}];
 const desc=sorter.nextSort({key:'calle',direction:'asc'},'registro');
 assert.deepEqual(desc,{key:'registro',direction:'desc'});
 assert.deepEqual([...rows].sort((a,b)=>sorter.compareHouses(a,b,desc)).map(h=>h.casaId),[2,1,3]);
 const asc=sorter.nextSort(desc,'registro');assert.equal(asc.direction,'asc');
 assert.deepEqual([...rows].sort((a,b)=>sorter.compareHouses(a,b,asc)).map(h=>h.casaId),[1,2,3]);
});
test('cada columna de datos ordena según sus valores, no según el texto del HTML',()=>{
 const a={casaId:1,calle:'Zeta',numero:'10',nombre:'Álvaro',estatus:'PAGADO',ultimoPago:{monto:950},ultimoMesPagado:{mes:'ENERO',anio:2027},saldoPendiente:1000,tags:{detalle:[{},{}]}};
 const b={casaId:2,calle:'Álamo',numero:'2',nombre:'Beatriz',estatus:'PENDIENTE',ultimoPago:{monto:1200},ultimoMesPagado:{mes:'DICIEMBRE',anio:2026},saldoPendiente:90,tags:{detalle:[{}]}};
 for(const [key,first] of [['calle',b],['numero',b],['nombre',a],['estatus',a],['pagado',a],['mes',b],['saldo',b],['tags',b]]){
  assert.equal([a,b].sort((x,y)=>sorter.compareHouses(x,y,{key,direction:'asc'}))[0].casaId,first.casaId,key);
  assert.notEqual([a,b].sort((x,y)=>sorter.compareHouses(x,y,{key,direction:'desc'}))[0].casaId,first.casaId,key+' invertida');
 }
 assert.equal(sorter.nextSort({key:'pago',direction:'asc'},'pago').direction,'desc');
});
function viewFixture(){
 const elements={};
 const element=id=>elements[id]??={value:'',textContent:'',innerHTML:'',disabled:false,listeners:{},addEventListener(type,fn){this.listeners[type]=fn;}};
 const buttons=['calle','numero','nombre','estatus','pagado','registro','mes','saldo','tags','pago'].map(key=>({dataset:{houseSort:key},listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},
  th:{setAttribute(name,value){this[name]=value;}},indicator:{},closest(){return this.th;},querySelector(){return this.indicator;}}));
 const rows=Array.from({length:30},(_,i)=>({casaId:i+1,calle:'Prueba',numero:String(i+1),nombre:'Residente '+i,estatus:'PENDIENTE',saldoPendiente:0,
  ultimoRegistroPago:{fecha:'2026-10-'+String(i+1).padStart(2,'0')+'T12:00:00Z',fuente:'FOLIO_REPORTADO',estatus:'PENDIENTE_VALIDACION'}}));
 const context={window:{MJHouseSort:sorter},document:{querySelectorAll:()=>buttons},data:{viviendas:rows},houseSort:{key:'calle',direction:'asc'},housePage:1,
  activeConcept:'MANTENIMIENTO',selectedReceiptHouseId:null,HOUSE_PAGE_SIZE:12,$:element,
  houseMatchesStatus:()=>true,cumpleUltimoPago:()=>true,esc:value=>String(value??'').replaceAll('<','&lt;'),
  fmt:value=>String(value),displayDate:value=>value.slice(0,10),renderHouseTagCell:()=>'',renderHousePayCell:()=>'',Intl,Date,Number};
 const start=source.indexOf('function renderLastRegistration('),end=source.indexOf(' let activePaymentHouse=null;',start);
 assert.ok(start>=0&&end>start);vm.createContext(context);vm.runInContext(source.slice(start,end),context);
 const bindings=source.indexOf(" document.querySelectorAll('[data-house-sort]').forEach(button=>button.addEventListener");
 const bindingEnd=source.indexOf(" for(const id of ['financeSearch'",bindings);
 assert.ok(bindings>=0&&bindingEnd>bindings);vm.runInContext(source.slice(bindings,bindingEnd),context);
 return {context,elements,buttons};
}
test('tabla real ordena todas las páginas, reinicia página e invierte; conserva filtros y selección de recibos',()=>{
 const {context:c,elements:e,buttons}=viewFixture();
 c.renderHouses();c.housePage=3;c.selectedReceiptHouseId=30;
 c.orderHouses('registro');assert.equal(c.housePage,1);
 assert.match(e.financeHouseRows.innerHTML,/^<tr data-receipt-row="30"/);
 assert.equal(c.selectedReceiptHouseId,30);assert.equal(e.financeGenerateReceipt.disabled,false);
 assert.equal(buttons.find(b=>b.dataset.houseSort==='registro').th['aria-sort'],'descending');
 c.orderHouses('registro');assert.match(e.financeHouseRows.innerHTML,/^<tr data-receipt-row="1"/);
 assert.equal(c.selectedReceiptHouseId,null);assert.equal(e.financeGenerateReceipt.disabled,true);
 e.financeSearch.value='Residente 29';c.renderHouses();assert.match(e.financeHouseRows.innerHTML,/^<tr data-receipt-row="30"/);
 assert.match(e.financePageInfo.textContent,/1 viviendas/);
});
test('Sin registro no usa el último mes pagado y el registro muestra fecha/hora con estado descriptivo',()=>{
 const {context:c}=viewFixture();assert.equal(c.renderLastRegistration(null),'Sin registro');
 const html=c.renderLastRegistration({fecha:'2026-10-21T02:15:00Z',fuente:'FOLIO_REPORTADO',estatus:'PENDIENTE_VALIDACION'});
 assert.match(html,/20:15:00/);assert.match(html,/Pendiente de validación/);
 assert.match(html,/datetime="2026-10-21T02:15:00Z"/);
});
test('se elimina sección separada y se agregan encabezados accesibles, columna y alternativa móvil',()=>{
 const html=read('docs/analisis-cuotas.html'),css=read('docs/assets/css/analisis-cuotas.css');
 assert.doesNotMatch(html,/paymentDatesPanel|analisis-pagos-fechas/);assert.doesNotMatch(source,/MJPaymentDates/);
 assert.equal((html.match(/data-house-sort="/g)||[]).length,10);assert.match(html,/Último registro de pago/);
 assert.match(html,/id="financeColumnSort"/);assert.match(html,/id="financeColumnDirection"/);
 assert.match(css,/\.house-sort-mobile\{display:flex/);
});
test('clics de encabezado y controles móviles ejecutan el mismo orden reversible',()=>{
 const {context:c,elements:e,buttons}=viewFixture();c.renderHouses();
 const header=buttons.find(b=>b.dataset.houseSort==='registro');
 header.listeners.click();assert.equal(c.houseSort.direction,'desc');assert.match(e.financeHouseRows.innerHTML,/^<tr data-receipt-row="30"/);
 header.listeners.click();assert.equal(c.houseSort.direction,'asc');assert.match(e.financeHouseRows.innerHTML,/^<tr data-receipt-row="1"/);
 e.financeColumnSort.value='saldo';e.financeColumnSort.listeners.change();assert.equal(c.houseSort.key,'saldo');
 e.financeColumnSort.value='registro';e.financeColumnSort.listeners.change();assert.equal(c.houseSort.direction,'desc');
 e.financeColumnDirection.listeners.click();assert.equal(c.houseSort.direction,'asc');assert.equal(header.th['aria-sort'],'ascending');
});
test('el controlador entrega la fecha real de subida incluso para folios pendientes y conserva conceptos separados',async()=>{
 const module={exports:{}};let uploadQuery;
 const empty={findAll:async()=>[]};
 const modelos={Casa:{findAll:async()=>[{id:1,calle:'Prueba',numero:'1',nombre:'Prueba',cuotaPorCobrar:300}]},Cuota:empty,
  ZkTarjeta:empty,CuotaExtraordinaria:empty,CargoExtraordinario:empty,PagoManualConcepto:empty,
  PagoReportado:{findAll:async query=>{
   if(query.attributes.includes('creadoEn')){uploadQuery=query;return [
    {casaId:1,tipoPago:'MANTENIMIENTO',estatus:'PENDIENTE_VALIDACION',creadoEn:'2026-10-21T10:00:00Z'},
    {casaId:1,tipoPago:'EXTRAORDINARIO',estatus:'RECHAZADO',creadoEn:'2026-10-20T10:00:00Z'}];}
   return [];
  }}};
 const mocks={sequelize:{Op:{between:Symbol(),in:Symbol()},QueryTypes:{SELECT:'SELECT'}},'../config/database':{query:async()=>[]},
  '../models':modelos,'../models/Egreso':empty,'../models/ReservaCasaClub':empty,
  '../services/direccion-sort.service':{compararDirecciones:()=>0},
  '../services/padron-finanzas.service':{seleccionarPadronAnalisis:casas=>({casas,excluidas:0,duplicadas:0})},
  '../services/adeudo-vivienda-analisis.service':{calcularAdeudoVivienda:()=>({saldoPendiente:0})},
  '../services/analisis-tags.service':{tagsParaViviendas:()=>new Map()},
  '../services/egreso-referencia.service':{},'../services/cargos-extraordinarios.service':{}};
 const requireMock=name=>Object.hasOwn(mocks,name)?mocks[name]:require(require('node:path').resolve(__dirname,'../src/controllers',name));
 vm.runInNewContext(read('backend/src/controllers/finanzas.controller.js'),{module,require:requireMock,console});
 let response;
 const res={setHeader(){},status(code){throw Error('Unexpected HTTP '+code);},json(value){response=value;return value;}};
 await module.exports.analizar({query:{anio:2026,mes:10}},res);
 assert.ok(uploadQuery);assert.equal(uploadQuery.where,undefined,'No filtra por depósito, validación ni mes del tablero');
 assert.equal(response.ok,true);
 assert.equal(response.data.viviendas[0].ultimoRegistroPago.fecha,'2026-10-21T10:00:00.000Z');
 assert.equal(response.data.viviendas[0].estatus,'PENDIENTE','La subida no se convierte en pago validado');
 assert.equal(response.data.viviendasConceptos.EXTRAORDINARIO[0].ultimoRegistroPago.fecha,'2026-10-20T10:00:00.000Z');
 assert.equal(response.data.viviendasConceptos.CASA_CLUB[0].ultimoRegistroPago,null);
 assert.equal(response.data.pagosHistorial,undefined);
});
