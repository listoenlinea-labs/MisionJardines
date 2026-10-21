'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {pagosFechasAnalisis}=require('../src/services/pagos-fechas-analisis.service');
const {selectPayments,paymentDate,createView}=require('../../docs/assets/js/analisis-pagos-fechas');
const houses=[{casaId:1,calle:'Calle prueba',numero:'1',nombre:'Residente de prueba'}];
const cuota=(extra={})=>({id:1,casaId:1,mes:'OCTUBRE',anio:2026,estatusPago:'PAGADO',montoPagado:300,referencia:'PRUEBA',fechaPago:'2026-10-10',fechaConfirmacion:'2026-10-20',...extra});
const banco=(extra={})=>({id:1,casaId:1,tipoPago:'MANTENIMIENTO',estatus:'VALIDADO',monto:600,folioOperacion:'PRUEBA',fechaOperacion:'2026-10-09',...extra});
const history=extra=>pagosFechasAnalisis({viviendas:houses,cuotas:[],comprobantes:[],manuales:[],...extra});

test('depósito de varios meses y comprobante se concilian en un movimiento con fecha bancaria',()=>{
 const rows=history({cuotas:[cuota(),cuota({id:2,mes:'NOVIEMBRE'})],comprobantes:[banco()]});
 assert.equal(rows.length,1);assert.equal(rows[0].monto,600);assert.equal(rows[0].fecha,'2026-10-09');
 assert.equal(rows[0].meses,2);assert.equal(rows[0].nombre,houses[0].nombre);
});
test('pago manual usa fecha del pago antes de confirmación y admite modelos Sequelize',()=>{
 const raw=cuota();const model={...raw,toJSON:()=>raw};
 assert.equal(history({cuotas:[model]})[0].fecha,'2026-10-10');
});
test('los tres conceptos permanecen separados; no incluye pendientes ni viviendas fuera del padrón',()=>{
 const rows=history({comprobantes:[banco(),banco({tipoPago:'EXTRAORDINARIO'}),banco({casaId:999}),banco({estatus:'PENDIENTE_VALIDACION'})],
  manuales:[{casaId:1,tipoPago:'CASA_CLUB',monto:150,referencia:'MANUAL',creadoEn:new Date('2026-10-15T12:00:00Z')}]});
 assert.equal(rows.length,3);assert.deepEqual(rows.map(p=>p.tipoPago).sort(),['CASA_CLUB','EXTRAORDINARIO','MANTENIMIENTO']);
});
test('un pago anterior sigue visible aunque la vivienda haya realizado otro después',()=>{
 const rows=history({cuotas:[cuota({referencia:'ANTERIOR'}),cuota({id:2,referencia:'RECIENTE',fechaPago:'2026-10-21'})]});
 const filtered=selectPayments(rows,{from:'2026-10-10',to:'2026-10-10'});
 assert.equal(filtered.rows.length,1);assert.equal(filtered.rows[0].referencia,'ANTERIOR');
});
test('rango inclusivo y zona horaria mexicana, con extremos abiertos',()=>{
 const rows=[{fecha:'2026-10-10'},{fecha:'2026-10-11T05:59:59Z'},{fecha:'2026-10-11T06:00:00Z'},{fecha:null}];
 assert.equal(selectPayments(rows,{from:'2026-10-10',to:'2026-10-10'}).rows.length,2);
 assert.equal(selectPayments(rows,{from:'2026-10-11'}).rows.length,1);
 assert.equal(selectPayments(rows,{to:'2026-10-10'}).rows.length,2);
 assert.equal(paymentDate('2026-10-11T05:59:59Z').day,'2026-10-10');
});
test('ordena globalmente antes de paginar y deja fechas ausentes al final en ambos sentidos',()=>{
 const rows=Array.from({length:45},(_,i)=>({fecha:'2026-10-'+String(i%21+1).padStart(2,'0'),numero:String(i)}));
 rows.push({fecha:null});
 const desc=selectPayments(rows).rows,asc=selectPayments(rows,{order:'asc'}).rows;
 assert.equal(desc[0].date.day,'2026-10-21');assert.equal(asc[0].date.day,'2026-10-01');
 assert.equal(desc.at(-1).date,null);assert.equal(asc.at(-1).date,null);
 assert.equal(rows[0].date,undefined,'No muta los datos originales');
});
test('fechas inválidas o rango invertido muestran error y no resultados',()=>{
 for(const filter of [{from:'2026-02-30'},{to:'hola'},{from:'2026-10-21',to:'2026-10-01'}]){
  const result=selectPayments([{fecha:'2026-10-15'}],filter);assert.ok(result.error);assert.equal(result.rows.length,0);
 }
 assert.equal(paymentDate('2026-02-30'),null);assert.equal(paymentDate('no-fecha'),null);
});
test('búsqueda sin acentos y concepto se combinan con las fechas',()=>{
 const rows=[{fecha:'2026-10-01',nombre:'Residente sintético',tipoPago:'EXTRAORDINARIO'},
  {fecha:'2026-10-01',nombre:'Residente sintético',tipoPago:'MANTENIMIENTO'}];
 assert.equal(selectPayments(rows,{search:'SINTETICO',concept:'EXTRAORDINARIO',from:'2026-10-01'}).rows.length,1);
});
function fixture(){
 const elements=Object.fromEntries(['From','To','Concept','Search','Order','Summary','Rows','Page','Prev','Next','Clear'].map(key=>[key,
  {value:key==='Order'?'desc':'',listeners:{},addEventListener(t,f){this.listeners[t]=f;},setCustomValidity(v){this.validity=v;},setAttribute(){},
   previousElementSibling:{classList:{toggle(){}},textContent:''}}]));
 const view=createView({getElementById:id=>elements[id.replace('paymentDates','')]});
 return {elements,view};
}
test('vista pagina, reinicia al filtrar, suma en centavos y limpia filtros',()=>{
 const {view,elements:e}=fixture();
 const rows=Array.from({length:25},(_,i)=>({fecha:'2026-10-01',nombre:'Prueba '+i,monto:0.1,tipoPago:'MANTENIMIENTO'}));
 view.setData(rows);assert.match(e.Summary.textContent,/25 pagos.*2\.50/);assert.equal((e.Rows.innerHTML.match(/<tr>/g)||[]).length,20);
 e.Next.listeners.click();assert.match(e.Page.textContent,/2 de 2/);assert.equal((e.Rows.innerHTML.match(/<tr>/g)||[]).length,5);
 e.Search.value='Prueba 24';e.Search.listeners.input();assert.match(e.Page.textContent,/1 de 1/);assert.match(e.Summary.textContent,/1 pagos/);
 e.Clear.listeners.click();assert.equal(e.Search.value,'');assert.equal(e.Order.value,'desc');assert.match(e.Page.textContent,/1 de 2/);
});
test('la vista escapa contenido almacenado y distingue historial faltante de vacío',()=>{
 const {view,elements:e}=fixture();view.setData(undefined);assert.match(e.Summary.textContent,/backend/);
 view.setData([]);assert.match(e.Rows.innerHTML,/No hay pagos/);
 view.setData([{fecha:null,nombre:'<img src=x onerror=alert(1)>',monto:1}]);
 assert.doesNotMatch(e.Rows.innerHTML,/<img/);assert.match(e.Rows.innerHTML,/&lt;img/);assert.match(e.Rows.innerHTML,/Sin fecha registrada/);
});
test('la ruta financiera exige administrador y el controlador agrega historial sin nuevas consultas SQL',()=>{
 const routes=fs.readFileSync(__dirname+'/../src/routes/finanzas.routes.js','utf8');
 assert.match(routes,/router\.use\(autenticarToken,autorizarRoles\('SUPER_ADMIN','ADMINISTRADOR'\)\)/);
 const controller=fs.readFileSync(__dirname+'/../src/controllers/finanzas.controller.js','utf8');
 assert.match(controller,/pagosHistorial:pagosFechasAnalisis\(/);
 assert.match(controller,/comprobantes:\[\.\.\.comprobantesMantenimiento,\.\.\.pagosConceptoHistoricos\]/);
});
test('dos depósitos del mismo día se ordenan por su hora bancaria, no por validación',()=>{
 const rows=history({comprobantes:[banco({folioOperacion:'TEMPRANO',fechaOperacion:'2026-10-10',horaOperacion:'08:30:00'}),
  banco({id:2,folioOperacion:'TARDE',fechaOperacion:'2026-10-10',horaOperacion:'19:45:00'})]});
 assert.equal(selectPayments(rows).rows[0].referencia,'TARDE');
 assert.equal(selectPayments(rows,{order:'asc'}).rows[0].referencia,'TEMPRANO');
 assert.equal(selectPayments(rows).rows[0].date.time,'19:45:00');
});
test('el controlador integra el historial completo sin limitarlo al mes del tablero',async()=>{
 const vm=require('node:vm'),module={exports:{}};
 const empty={findAll:async()=>[]};
 const models={Casa:{findAll:async()=>[{id:1,calle:'Calle prueba',numero:'1',nombre:'Prueba'}]},
  Cuota:{findAll:async()=>[cuota()]},ZkTarjeta:empty,CuotaExtraordinaria:empty,CargoExtraordinario:empty,PagoManualConcepto:empty,
  PagoReportado:{findAll:async query=>query.where.tipoPago==='MANTENIMIENTO'?[banco({fechaOperacion:'2026-09-09',horaOperacion:'10:00:00'})]:[]}};
 const mocks={sequelize:{Op:{between:Symbol(),in:Symbol()},QueryTypes:{SELECT:'SELECT'}},
  '../config/database':{query:async()=>[]},'../models':models,'../models/Egreso':empty,'../models/ReservaCasaClub':empty,
  '../services/direccion-sort.service':{compararDirecciones:()=>0},
  '../services/padron-finanzas.service':{seleccionarPadronAnalisis:casas=>({casas,excluidas:0,duplicadas:0})},
  '../services/adeudo-vivienda-analisis.service':{calcularAdeudoVivienda:()=>({saldoPendiente:0})},
  '../services/analisis-tags.service':{tagsParaViviendas:()=>new Map()},
  '../services/egreso-referencia.service':{},'../services/cargos-extraordinarios.service':{}};
 const source=fs.readFileSync(__dirname+'/../src/controllers/finanzas.controller.js','utf8');
 const requireMock=name=>Object.hasOwn(mocks,name)?mocks[name]:require(require('node:path').resolve(__dirname,'../src/controllers',name));
 vm.runInNewContext(source,{module,require:requireMock,console});
 let response;
 const res={setHeader(){},status(code){throw Error('Unexpected HTTP '+code);},json(value){response=value;return value;}};
 await module.exports.analizar({query:{anio:'2026',mes:'10'}},res);
 assert.equal(response.ok,true);assert.equal(response.data.mes,10);
 assert.equal(response.data.pagosHistorial.length,1);
 assert.equal(response.data.pagosHistorial[0].fecha,'2026-09-09');
 assert.equal(response.data.pagosHistorial[0].hora,'10:00:00');
});
