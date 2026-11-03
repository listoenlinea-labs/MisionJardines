'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const api=fs.readFileSync(path.join(__dirname,'../src/services/anulacion-aportaciones-extraordinarias.service.js'),'utf8');
const ui=fs.readFileSync(path.join(__dirname,'../../docs/assets/js/analisis-cuotas.js'),'utf8');
const routes=fs.readFileSync(path.join(__dirname,'../src/routes/finanzas.routes.js'),'utf8');
const schema=fs.readFileSync(path.join(__dirname,'../src/services/proyectos-extraordinarios-schema.service.js'),'utf8');

function fixture({bankLinked=false,source='APORTACION',origin='EXCEL_HISTORICO',deleted=1}={}){
 const writes=[],lookup=[],project={id:4,activo:true,concepto:'Mejoras generales'};
 const charge={id:78,cuotaExtraordinariaId:4,casaId:30,monto:600};
 const row={id:123,casaId:30,cargoExtraordinarioId:78,cuotaExtraordinariaId:4,
  tipoPago:'EXTRAORDINARIO',origen:origin,referencia:'MJ-MEJORAS-2026-XLSX-102',
  monto:200,fecha:'2026-10-06',get:()=>({id:123,referencia:'MJ-MEJORAS-2026-XLSX-102',monto:200})};
 const opts={};
 const model={findOne:async ({where})=>{lookup.push(where);return row;},
  destroy:async options=>{writes.push({operation:'destroy',where:options.where});return deleted;}};
 const db={
  query:async (sql,options)=>{writes.push({operation:'audit',sql,values:options.replacements});},
  transaction:async (_options,callback)=>callback({LOCK:{UPDATE:'UPDATE'}})
 };
 const models={
  CuotaExtraordinaria:{findOne:async ()=>project},
  CargoExtraordinario:{findOne:async ()=>charge},
  AportacionExtraordinaria:model,PagoManualConcepto:model,
  PagoReportado:{findOne:async ()=>bankLinked?{id:999}:null}
 };
 const dependencies={
  sequelize:{Transaction:{ISOLATION_LEVELS:{SERIALIZABLE:'SERIALIZABLE'}},Op:{or:Symbol('or')}},
  '../config/database':db,'../models':models,
  './reversion-historicos.helper':{esOrigenBancario:value=>/BANCO|IMAP|TRANSFERENCIA/.test(String(value||''))}
 };
 const mod={exports:{}};
 new Function('module','exports','require',api)(mod,mod.exports,name=>{
  if(!(name in dependencies))throw Error('Dependency not mocked '+name);
  return dependencies[name];
 });
 const params={proyectoId:4,casaId:30,origen:source,id:123};
 return {service:mod.exports,writes,lookup,params,row};
}

test('previsualiza la aportación concreta sin alterar datos',async()=>{
 const x=fixture();
 const preview=await x.service.vistaPrevia(x.params);
 assert.equal(preview.monto,200);
 assert.equal(preview.casaId,30);
 assert.equal(preview.proyectoId,4);
 assert.equal(preview.origen,'APORTACION');
 assert.equal(x.writes.length,0);
});

test('anula solo la aportación elegida y archiva la fuente antes de borrarla',async()=>{
 const x=fixture();
 const result=await x.service.anular(x.params,{
  confirmacion:'ANULAR',monto:200,referencia:'MJ-MEJORAS-2026-XLSX-102'},17);
 assert.equal(result.anulado,true);
 assert.equal(result.sinCambiosEnTags,true);
 assert.equal(result.sinCambiosEnMantenimiento,true);
 assert.deepEqual(x.writes.map(w=>w.operation),['audit','destroy']);
 assert.deepEqual(x.writes[1].where,{id:123,casaId:30,cargoExtraordinarioId:78,
  referencia:'MJ-MEJORAS-2026-XLSX-102'});
 assert.equal(x.writes[0].values[7],17);
 assert.equal(x.writes[0].values[0],4);
});

test('rechaza sin confirmación y detecta abono cambiado, sin borrar',async()=>{
 for(const data of [{confirmacion:'SI',monto:200,referencia:'MJ-MEJORAS-2026-XLSX-102'},
  {confirmacion:'ANULAR',monto:201,referencia:'MJ-MEJORAS-2026-XLSX-102'},
  {confirmacion:'ANULAR',monto:200,referencia:'OTRA'}]){
  const x=fixture();
  await assert.rejects(x.service.anular(x.params,data,17),e=>e.status===400||e.status===409);
  assert.equal(x.writes.length,0);
 }
});
test('bloquea fondos bancarios, referencias enlazadas y orígenes bancarios',async()=>{
 const bank=fixture({source:'BANCO'});
 await assert.rejects(bank.service.vistaPrevia(bank.params),e=>e.status===409);
 const linked=fixture({bankLinked:true});
 await assert.rejects(linked.service.vistaPrevia(linked.params),e=>e.status===409);
 const imported=fixture({origin:'BANCO'});
 await assert.rejects(imported.service.vistaPrevia(imported.params),e=>e.status===409);
});
test('si el borrado no afecta exactamente una fila falla la transacción',async()=>{
 const x=fixture({deleted:0});
 await assert.rejects(x.service.anular(x.params,{confirmacion:'ANULAR',
  monto:200,referencia:'MJ-MEJORAS-2026-XLSX-102'},17),e=>e.status===409);
});
test('frontend muestra borrar en extraordinarias, sin abrir la reversión C3',()=>{
 assert.match(ui,/data-extra-history-delete/);
 assert.match(ui,/activeConcept==='EXTRAORDINARIO'/);
 assert.match(ui,/window\.prompt\('Escribe ANULAR/);
 assert.match(ui,/sin alterar mantenimiento ni TAGs/);
 assert.match(ui,/button\.disabled/);
 assert.match(routes,/router\.use\(autenticarToken,autorizarRoles\('SUPER_ADMIN','ADMINISTRADOR'\)\)/);
 assert.match(routes,/anulacionExtra\.vista/);
 assert.match(routes,/anulacionExtra\.anular/);
 assert.match(schema,/CREATE TABLE IF NOT EXISTS proyectos_aportaciones_anulaciones/);
 assert.doesNotThrow(()=>new Function(ui));
});
