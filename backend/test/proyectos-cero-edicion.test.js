'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../src/services/proyectos-extraordinarios.service.js'),'utf8');
const validation=require('../src/services/proyectos-extraordinarios-validacion.service');
const budget=require('../src/services/proyectos-presupuesto.service');
const snapshots=require('../src/services/proyectos-cuotas-version.service');

function fixture({paid=0}={}){
 const audits=[];
 const project={id:7,activo:true,monto:1000,montoTotal:231000,
  async update(data){Object.assign(this,data);}};
 const cargos=Array.from({length:231},(_,i)=>({
  id:i+1,casaId:i+1,cuotaExtraordinariaId:7,monto:1000,
  async update(data){Object.assign(this,data);}
 }));
 const modules={
  sequelize:{Op:{in:Symbol('in')},Transaction:{ISOLATION_LEVELS:{SERIALIZABLE:'SERIALIZABLE'}}},
  crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000000'},
  '../config/database':{
   transaction:async (_opts,callback)=>callback({LOCK:{UPDATE:'UPDATE'}}),
   query:async (sql,options)=>audits.push({sql,options})
  },
  '../models':{
   Casa:{},
   CuotaExtraordinaria:{
    findOne:async ()=>project,
    findAll:async ()=>[]
   },
   CargoExtraordinario:{
    findOne:async ({where})=>cargos.find(c=>c.casaId===Number(where.casaId))||null,
    findAll:async ()=>cargos
   },
   PagoReportado:{findAll:async ()=>[]},
   PagoManualConcepto:{findAll:async ()=>[]},
   AportacionExtraordinaria:{findAll:async ({where})=>paid&&where.cargoExtraordinarioId===30?
    [{monto:paid}]:[]}
  },
  './cargos-extraordinarios.service':{
   padronOficial:async ()=>cargos.map(c=>({id:c.casaId,calle:'Gardenias',numero:String(c.casaId)}))
  },
  './proyectos-extraordinarios-validacion.service':validation,
  './vigencia-calculo':{fechaMexico:()=> '2026-11-03'},
  './proyectos-presupuesto.service':budget,
  './proyectos-cuotas-version.service':snapshots
 };
 const mod={exports:{}};
 new Function('module','exports','require',source)(mod,mod.exports,name=>{
  if(!(name in modules))throw Error('Módulo no simulado: '+name);
  return modules[name];
 });
 return {service:mod.exports,cargos,project,audits};
}

test('modificar cuota individual a $0 conserva historial y audita el cambio',async()=>{
 const x=fixture();
 const result=await x.service.ajustarCuota(7,30,0,17);
 assert.equal(result.monto,0);
 assert.equal(x.cargos[29].monto,0);
 assert.equal(x.project.montoTotal,230000);
 assert.equal(x.audits.length,1);
 assert.equal(x.audits[0].options.replacements[3],0);
});

test('no permite cuota $0 si ya hay $200 abonados',async()=>{
 const x=fixture({paid:200});
 await assert.rejects(x.service.ajustarCuota(7,30,0,17),e=>e.status===409);
 assert.equal(x.cargos[29].monto,1000);
 assert.equal(x.project.montoTotal,231000);
 assert.equal(x.audits.length,0);
});

test('editor de las 231 casas acepta cuota general $0 con excepción positiva',async()=>{
 const x=fixture();
 const result=await x.service.ajustarCuotasProyecto(7,{
  cuotaBase:0,excepciones:[{casaId:30,monto:0},{casaId:31,monto:150}]
 },17);
 assert.equal(result.viviendas,231);
 assert.equal(result.metaTotal,150);
 assert.equal(x.project.monto,0);
 assert.equal(x.cargos[29].monto,0);
 assert.equal(x.cargos[30].monto,150);
 assert.equal(x.cargos[0].monto,0);
});

test('un campo vacío no es una instrucción para exentar a una vivienda',async()=>{
 const x=fixture();
 await assert.rejects(x.service.ajustarCuota(7,30,'',17),e=>e.status===400);
 await assert.rejects(x.service.ajustarCuotasProyecto(7,{cuotaBase:''},17),e=>e.status===400);
 await assert.rejects(x.service.ajustarCuotasProyecto(7,{
  cuotaBase:1000,excepciones:[{casaId:30,monto:''}]
 },17),e=>e.status===400);
 assert.equal(x.audits.length,0);
});

test('No aplica no se cuenta como pagada ni pendiente y no altera los otros saldos',()=>{
 const x=fixture();
 const project={id:7,concepto:'Proyecto prueba',codigo:'MJ-P-TEST',monto:1000,activo:true,fechaInicio:'2026-11-01'};
 const cargos=[
  {id:30,casaId:30,cuotaExtraordinariaId:7,monto:0},
  {id:31,casaId:31,cuotaExtraordinariaId:7,monto:1000},
  {id:32,casaId:32,cuotaExtraordinariaId:7,monto:1000}
 ];
 const viviendas=cargos.map(c=>({casaId:c.casaId,calle:'Jardines',numero:c.casaId}));
 const aportes=[{cargoExtraordinarioId:31,monto:1000,fecha:'2026-11-03',referencia:'MJ-TEST-31'}];
 const [result]=x.service.juntar([project],cargos,aportes,[],[],viviendas);
 assert.equal(result.viviendas,3);
 assert.equal(result.noAplica,1);
 assert.equal(result.cumplidos,1);
 assert.equal(result.pendientes,1);
 assert.equal(result.totalEsperado,2000);
 assert.equal(result.recaudado,1000);
 assert.equal(result.saldoPendiente,1000);
 const exempt=result.viviendasDetalle.find(c=>c.casaId===30);
 assert.equal(exempt.estatus,'NO_APLICA');
 assert.equal(exempt.noAplica,true);
 assert.equal(exempt.montoCuota,0);
 assert.equal(exempt.montoPagado,0);
 assert.equal(exempt.saldoPendiente,0);
 assert.equal(result.viviendasDetalle.find(c=>c.casaId===31).estatus,'PAGADO');
 assert.equal(result.viviendasDetalle.find(c=>c.casaId===32).estatus,'PENDIENTE');
});

test('No aplica se revierte asignando nueva cuota sin modificar otros cargos',async()=>{
 const x=fixture();
 await x.service.ajustarCuota(7,30,0,17);
 assert.equal(x.cargos[29].monto,0);
 assert.equal(x.project.montoTotal,230000);
 await x.service.ajustarCuota(7,30,500,17);
 assert.equal(x.cargos[29].monto,500);
 assert.equal(x.project.montoTotal,230500);
 assert.equal(x.cargos[30].monto,1000);
 assert.equal(x.audits.length,2);
});

test('UI distingue No aplica en Estado, Pagado, Saldo y cobro',()=>{
 const html=fs.readFileSync(path.join(__dirname,'../../docs/analisis-cuotas.html'),'utf8');
 const js=fs.readFileSync(path.join(__dirname,'../../docs/assets/js/analisis-cuotas.js'),'utf8');
 assert.match(html,/id="houseProjectNoAplica"/);
 assert.match(html,/id="houseProjectNoAplicaStatus"/);
 assert.match(html,/value="NO_APLICA"/);
 assert.match(js,/status==='NO_APLICA'/);
 assert.match(js,/NO_APLICA:'No aplica'/);
 assert.match(js,/houseCell\('Pagado'/);
 assert.match(js,/houseCell\('Saldo pendiente',isProjectNoAplica/);
 assert.match(js,/isProjectNoAplica\(h\)/);
 assert.match(js,/No aplica; no hay recibo por generar/);
 assert.match(js,/projectNoAplicaButton\.addEventListener\('click'/);
 assert.match(js,/viviendas\/'\+id,\{monto:0\},'PATCH'/);
 assert.doesNotThrow(()=>new Function(js));
});
