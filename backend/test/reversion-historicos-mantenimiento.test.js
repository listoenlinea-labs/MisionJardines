'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=p=>fs.readFileSync(path.resolve(__dirname,'../../',p),'utf8');
const helper=require('../src/services/reversion-historicos.helper');
const {esViviendaTest001}=require('../src/services/viviendas-visibles.service');

function quota(id,month,reference,amount=300,override={}){
 const q={id,casaId:4,anio:2026,mes:month,montoPagado:amount,montoCuota:300,
  recargo:0,estatusPago:'PAGADO',referencia:reference,folio:null,
  origenImportacion:'HISTORICO',fechaConfirmacion:new Date('2026-10-06T12:00:00Z'),
  creadoEn:new Date('2026-01-01T12:00:00Z'),observaciones:'Pago histórico registrado',
  ...override};
 q.get=()=>Object.fromEntries(Object.entries(q).filter(([key])=>!['get','update','destroy'].includes(key)));
 q.update=async changes=>{Object.assign(q,changes);};
 q.destroy=async()=>{q.destroyed=true;};
 return q;
}

function harness({rows=[quota(3,'OCTUBRE','MJ-2026-0418')],
 casa={id:4,calle:'Gardenias',numero:'2'},eventTagActions=[],
 bank=null,bankApplied=null,tags=[],events=[],snapshots=[],afterCommit=true}={}){
 const calls={sql:[],events:[],tags:[],requested:[],audit:[]};
 const rowsInDatabase=rows;
 const model={Casa:{async findByPk(id){return id===4?casa:null;}},
  Cuota:{async findAll({where}){return rowsInDatabase.filter(x=>x.casaId===Number(where.casaId));}},
  ZkTarjeta:{async findAll(){return tags;}},
  PagoReportado:{async findOne(){return bank;},async findAll(){return bankApplied||[];}}
 };
 const Evento={
  async findAll({where}){
   if(where?.referencia!==undefined)return events.filter(e=>e.referencia===where.referencia);
   return events;
  },
  async create(entry){const e={...entry,id:505};calls.events.push(e);return e;}
 };
 const EventoTag={async create(entry){calls.tags.push(entry);},async findAll(){return eventTagActions;}};
 const transaction={LOCK:{UPDATE:'UPDATE'},afterCommit(fn){if(afterCommit)fn();}};
 const sequelize={
  async query(sql,options){
   calls.sql.push({sql,options});
   if(sql.startsWith('SELECT'))return [snapshots];
   if(sql.startsWith('INSERT INTO pagos_anulaciones')){
    calls.audit.push(options.replacements);
    return [{affectedRows:1}];
   }
   throw Error('SQL inesperado: '+sql);
  },
  async transaction(cb){return cb(transaction);}
 };
 const months=['ENERO','FEBRERO','MARZO','ABRIL','MAYO','JUNIO','JULIO','AGOSTO','SEPTIEMBRE','OCTUBRE','NOVIEMBRE','DICIEMBRE'];
 const fechaDesdeCuotas=all=>{
  const paid=all.filter(c=>Number(c.montoPagado)>0&&c.estatusPago==='PAGADO')
   .sort((a,b)=>a.anio-b.anio||months.indexOf(a.mes)-months.indexOf(b.mes));
  if(!paid.length)return null;
  const last=paid.at(-1);
  const n=last.anio*12+months.indexOf(last.mes)+1;
  return Math.floor(n/12)+'-'+String(n%12+1).padStart(2,'0')+'-10';
 };
 const dependencies={
  crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000001'},
  sequelize:{Op:{or:Symbol('or')}},
  '../config/database':sequelize,
  '../models':model,
  '../models/PagoAccesoC3':Evento,
  '../models/PagoAccesoTagC3':EventoTag,
  './cuotas-mantenimiento-calculo':{fechaDesdeCuotas},
  './zkteco-vigencias.service':{solicitar:casaId=>calls.requested.push(casaId)},
  './reversion-historicos.helper':helper,
  './viviendas-visibles.service':{esViviendaTest001},
  './pagos-reparto.service':{condicionCasa:casaId=>({casaId})},
  './pagos-reparto-datos':{planParaCasa:p=>p.aplicacionCuotas||null}
 };
 const module={exports:{}};
 new Function('module','exports','require',root('backend/src/services/reversion-pagos.service.js'))(
  module,module.exports,name=>{
   if(!(name in dependencies))throw Error('Dependencia inesperada '+name);
   return dependencies[name];
  }
 );
 return {service:module.exports,rows:rowsInDatabase,calls};
}

test('se reconocen referencias históricas, folios importados y manuales válidos',()=>{
 for(const ref of ['MJ-2026-0418','3744','MJ:2026-11','MJ-NOV-2026-ABC-G2-M'])
  assert.equal(helper.referenciaHistoricaValida(ref),true);
 for(const ref of ['',' ', 'MJ 2026', '../secret', 'x'.repeat(151), 'X;DROP TABLE'])
  assert.equal(helper.referenciaHistoricaValida(ref),false);
 assert.equal(helper.esOrigenBancario('PAGO_BANCARIO_CUOTAS'),true);
 assert.equal(helper.esOrigenBancario('MANUAL_ANALISIS'),false);
});
test('pasar cuota histórica a pendiente sin destruir el registro ni inventar recargos',()=>{
 const q=quota(7,'OCTUBRE','MJ-2026-0418',300);
 const antes=q.get();
 const cambio=helper.estadoPendienteHistorico(q,q.referencia);
 assert.equal(cambio.estatusPago,'PENDIENTE');
 assert.equal(cambio.montoPagado,0);
 assert.equal(cambio.saldoPendiente,300);
 assert.equal(cambio.recargo,0);
 assert.equal(cambio.referencia,null);
 assert.equal(cambio.fechaConfirmacion,null);
 assert.equal(antes.montoPagado,300);
 assert.match(cambio.observaciones,/MJ-2026-0418/);
 assert.throws(()=>helper.estadoPendienteHistorico(quota(9,'OCTUBRE','BANCO',300,
  {origenImportacion:'BANCO_VALIDADO'}),'BANCO'),e=>e.status===409);
});
test('vista previa y anulación segura de pago histórico sin TAG: audita y recalcula',async()=>{
 const h=harness();
 const preview=await h.service.vistaPrevia(4,'MJ-2026-0418');
 assert.equal(preview.importe,300);
 assert.equal(preview.tipo,'HISTORICO');
 assert.deepEqual(preview.periodos,['OCTUBRE 2026']);
 assert.equal(preview.tags,0);
 const result=await h.service.anular(4,'MJ-2026-0418',88);
 assert.equal(result.tipo,'HISTORICO');
 assert.equal(result.periodosRestaurados,1);
 assert.equal(result.restauracionC3.estado,'SIN_TAGS');
 assert.equal(h.rows[0].montoPagado,0);
 assert.equal(h.rows[0].estatusPago,'PENDIENTE');
 assert.equal(h.rows[0].destroyed,undefined);
 assert.equal(h.rows[0].referencia,null);
 assert.equal(h.calls.audit.length,1);
 assert.equal(h.calls.audit[0][2],88);
 assert.match(h.calls.audit[0][4],/MJ-2026-0418/);
 await assert.rejects(()=>h.service.vistaPrevia(4,'MJ-2026-0418'),e=>e.status===409);
});
test('reversiones de referencia de solo folio permiten recuperar cuotas importadas',async()=>{
 const h=harness({rows:[quota(7,'OCTUBRE',null,300,{referencia:null,folio:'MJ-2026-0418'})]});
 assert.equal((await h.service.vistaPrevia(4,'MJ-2026-0418')).importe,300);
 await h.service.anular(4,'MJ-2026-0418',88);
 assert.equal(h.rows[0].folio,null);
});
test('TAGs existentes: se crea reversa durable para el último mes previo, sin suponer sincronización física',async()=>{
 const h=harness({rows:[
  quota(1,'SEPTIEMBRE','MJ-2026-0323'),
  quota(2,'OCTUBRE','MJ-2026-0418')
 ],tags:[{id:9,numeroTarjeta:'00059423',casaId:4}]});
 const prev=await h.service.vistaPrevia(4,'MJ-2026-0418');
 assert.equal(prev.fechaObjetivo,'2026-10-10');
 const r=await h.service.anular(4,'MJ-2026-0418',13);
 assert.equal(h.rows[0].montoPagado,300);
 assert.equal(h.rows[1].montoPagado,0);
 assert.equal(r.restauracionC3.estado,'PENDIENTE');
 assert.equal(r.fechaObjetivo,'2026-10-10');
 assert.equal(h.calls.events.length,1);
 assert.equal(h.calls.events[0].origen,'REVERSA');
 assert.equal(h.calls.events[0].origenId,2);
 assert.equal(h.calls.tags[0].numeroTarjeta,'00059423');
 assert.deepEqual(h.calls.requested,[4]);
});
test('si hay TAGs y ningún mes anterior confirmado, no modifica pagos sin vigencia calculable',async()=>{
 const h=harness({tags:[{id:5,numeroTarjeta:'22'}]});
 await assert.rejects(()=>h.service.vistaPrevia(4,'MJ-2026-0418'),e=>e.status===409);
 assert.equal(h.rows[0].montoPagado,300);
});
test('períodos posteriores pagados requieren revertir primero el pago más reciente',async()=>{
 const h=harness({rows:[
  quota(1,'SEPTIEMBRE','MJ-2026-0323'),
  quota(2,'OCTUBRE','MJ-2026-0418')
 ]});
 await assert.rejects(()=>h.service.vistaPrevia(4,'MJ-2026-0323'),e=>
  e.status===409&&/posteriores/.test(e.message));
 assert.equal(h.rows[0].montoPagado,300);
});
test('no se anula un pago validado por banco, con o sin folio coincidente',async()=>{
 const matching=harness({bank:{id:30}});
 await assert.rejects(()=>matching.service.vistaPrevia(4,'MJ-2026-0418'),e=>
  e.status===409&&/bancario/.test(e.message));
 const bankOtherRef=harness({bankApplied:[{
  id:10,aplicacionCuotas:{aplicado:true,aplicaciones:[{anio:2026,mes:'OCTUBRE',abono:300}]}
 }]});
 await assert.rejects(()=>bankOtherRef.service.vistaPrevia(4,'MJ-2026-0418'),e=>
  e.status===409&&/depósito bancario/.test(e.message));
 assert.equal(bankOtherRef.rows[0].montoPagado,300);
});
test('movimientos parciales u origen bancario no se eliminan sin conciliación',async()=>{
 const partial=harness({rows:[quota(3,'OCTUBRE','MJ-2026-0418',150,{estatusPago:'PAGO_PARCIAL'})]});
 await assert.rejects(()=>partial.service.vistaPrevia(4,'MJ-2026-0418'),e=>e.status===409);
 const bankOrigin=harness({rows:[quota(3,'OCTUBRE','MJ-2026-0418',300,{origenImportacion:'PAGO_BANCARIO_CUOTAS'})]});
 await assert.rejects(()=>bankOrigin.service.vistaPrevia(4,'MJ-2026-0418'),e=>e.status===409);
});
test('el backend conserva autenticación y doble confirmación por ANULAR',()=>{
 const routes=root('backend/src/routes/finanzas.routes.js');
 const controller=root('backend/src/controllers/reversion-pagos.controller.js');
 const ui=root('docs/assets/js/analisis-cuotas.js');
 assert.match(routes,/router\.use\(autenticarToken,autorizarRoles\('SUPER_ADMIN','ADMINISTRADOR'\)\)/);
 assert.match(routes,/router\.get\('\/pagos-vivienda\/:casaId\/anulacion',reversion\.vista\)/);
 assert.match(routes,/router\.post\('\/pagos-vivienda\/:casaId\/anulacion',reversion\.anular\)/);
 assert.match(controller,/confirmacion!=='ANULAR'/);
 assert.match(ui,/data-history-delete=/);
 assert.doesNotMatch(ui,/activeConcept==='MANTENIMIENTO'&&\/\^MJMAN:/);
 assert.match(ui,/activeConcept==='MANTENIMIENTO'\?'<button type="button" class="history-delete-button"/);
 assert.match(ui,/if\(!movimiento\.referencia\)/);
 assert.match(ui,/window\.prompt\('Escribe ANULAR/);
 assert.match(ui,/await openHouseHistory\(casaId,null\)/);
});


// Caso de recuperación: se eliminó por SQL el reporte del depósito, pero la
// cuota quedó pagada en TEST-001. No dar permisos globales a otras viviendas.
test('TEST-001: anular desde UI la cuota bancaria huérfana sin tocar C3 ni otros pagos',async()=>{
 const referencia='MBAN01002611110093123121';
 const nov=quota(12,'NOVIEMBRE',referencia,350,{
  montoCuota:300,recargo:50,recargoPagado:50,
  origenImportacion:'PAGO_BANCARIO_CUOTAS',fechaConfirmacion:new Date('2026-11-11T17:30:00Z')
 });
 const oct=quota(11,'OCTUBRE','TEST-OCT26-ABONO-340',340,{
  montoCuota:300,recargo:50,origenImportacion:'HISTORICO'
 });
 const e={id:490,casaId:4,referencia,origen:'PAGO_CUOTAS',estado:'PENDIENTE',
  async update(changes){Object.assign(this,changes);}};
 const h=harness({casa:{id:4,calle:'Prueba',numero:'TEST-001'},
  rows:[oct,nov],events:[e],eventTagActions:[]});
 const previa=await h.service.vistaPrevia(4,referencia);
 assert.equal(previa.tipo,'PRUEBA_FORZADA');
 assert.equal(previa.tags,0);
 assert.match(previa.advertencia,/sin bloqueos por registros C3/);
 const result=await h.service.anular(4,referencia,88);
 assert.equal(result.periodosRestaurados,1);
 assert.equal(result.restauracionC3.estado,'SIN_CAMBIOS_C3');
 assert.equal(nov.montoPagado,0);
 assert.equal(nov.estatusPago,'PENDIENTE');
 assert.equal(nov.referencia,null);
 assert.equal(nov.recargoPagado,0);
 assert.equal(nov.origenImportacion,'REVERSA_PRUEBA_FORZADA');
 assert.equal(oct.montoPagado,340,'No modifica el depósito anterior');
 assert.equal(e.estado,'ANULADO','La orden de acceso obsoleta queda desactivada');
 assert.equal(h.calls.events.length,0,'No se generan órdenes de acceso al C3');
 assert.equal(h.calls.tags.length,0);
 assert.equal(h.calls.requested.length,0);
 assert.equal(h.calls.audit.length,1,'Se conserva auditoría de la eliminación');
 await assert.rejects(()=>h.service.vistaPrevia(4,referencia),{status:409});
});
test('la excepción bancaria NO se concede a Gardenias ni otras casas reales',async()=>{
 const referencia='MBAN01002611110093123121';
 const h=harness({rows:[quota(13,'NOVIEMBRE',referencia,350,
  {montoCuota:300,origenImportacion:'PAGO_BANCARIO_CUOTAS'})],
  events:[{id:11,casaId:4,referencia,origen:'PAGO_CUOTAS',estado:'PENDIENTE'}]});
 await assert.rejects(()=>h.service.vistaPrevia(4,referencia),e=>e.status===409);
 assert.equal(h.rows[0].montoPagado,350);
});
test('TEST-001: un reporte bancario de laboratorio asociado queda RECHAZADO y no reingresa a conciliación',async()=>{
 const ref='MBAN01002611110093123121';
 const reporte={id:37,folioReporte:'MJ-2026-0037',estatus:'VALIDADO',
  async update(cambios){Object.assign(this,cambios);}};
 const nov=quota(7,'NOVIEMBRE',ref,350,{origenImportacion:'PAGO_BANCARIO_CUOTAS'});
 const h=harness({casa:{id:4,calle:'Prueba',numero:'TEST-001'},bankApplied:[reporte],
  rows:[nov]});
 const previo=await h.service.vistaPrevia(4,ref);
 assert.equal(previo.tipo,'PRUEBA_FORZADA');
 await h.service.anular(4,ref,88);
 assert.equal(reporte.estatus,'RECHAZADO');
 assert.equal(nov.montoPagado,0);
});
test('TEST-001: TAGs asociados NO impiden revertir la cuota sin escribir ni agendar C3',async()=>{
 const ref='MBAN01002611110093123121';
 const nov=quota(7,'NOVIEMBRE',ref,350,{origenImportacion:'PAGO_BANCARIO_CUOTAS'});
 const oct=quota(6,'OCTUBRE','TEST-OCT26-ABONO-340',340);
 const casa={id:4,calle:'Prueba',numero:'TEST-001'};
 const tag={id:99,numeroTarjeta:'92399',casaId:4,fechaVigencia:'2026-12-10'};
 const withTags=harness({casa,rows:[oct,nov],tags:[tag]});
 const previo=await withTags.service.vistaPrevia(4,ref);
 assert.equal(previo.tipo,'PRUEBA_FORZADA');
 assert.equal(previo.tags,1);
 assert.match(previo.advertencia,/Se conservan los TAGs/);
 const result=await withTags.service.anular(4,ref,88);
 assert.equal(nov.montoPagado,0);
 assert.equal(nov.estatusPago,'PENDIENTE');
 assert.equal(oct.montoPagado,340);
 assert.equal(result.restauracionC3.estado,'SIN_CAMBIOS_C3');
 assert.equal(result.restauracionC3.tagsConservados,1);
 assert.equal(tag.fechaVigencia,'2026-12-10');
 assert.equal(withTags.calls.events.length,0);
 assert.equal(withTags.calls.tags.length,0);
 assert.equal(withTags.calls.requested.length,0);
 assert.equal(withTags.calls.audit.length,1);
});
test('TEST-001: acciones C3 registradas no bloquean el borrado de la cuota; no escribe ni revierte TAGs',async()=>{
 const ref='MBAN01002611110093123121';
 const q=quota(7,'NOVIEMBRE',ref,350,{origenImportacion:'PAGO_BANCARIO_CUOTAS'});
 const casa={id:4,calle:'Prueba',numero:'TEST-001'};
 const evento={id:7,referencia:ref,origen:'PAGO_CUOTAS',estado:'PENDIENTE',
  async update(data){Object.assign(this,data);}};
 const tag={id:99,numeroTarjeta:'92399',fechaVigencia:'2026-12-10'};
 const h=harness({casa,rows:[q()],tags:[tag],events:[evento],
  eventTagActions:[{id:42,pagoAccesoId:7}]});
 assert.equal((await h.service.vistaPrevia(4,ref)).tipo,'PRUEBA_FORZADA');
 const result=await h.service.anular(4,ref,88);
 assert.equal(result.restauracionC3.estado,'SIN_CAMBIOS_C3');
 assert.equal(q.montoPagado,0);
 assert.equal(q.estatusPago,'PENDIENTE');
 assert.equal(evento.estado,'ANULADO');
 assert.equal(tag.fechaVigencia,'2026-12-10');
 assert.equal(h.calls.events.length,0);
 assert.equal(h.calls.tags.length,0);
 assert.equal(h.calls.requested.length,0);
 assert.equal(h.calls.audit.length,1);
});
