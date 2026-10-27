'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
Object.assign(process.env,{DB_HOST:'localhost',DB_PORT:'3306',DB_NAME:'test',DB_USER:'test',DB_PASSWORD:'unused'});
const {Op}=require('sequelize');
const db=require('../src/config/database');
const models=require('../src/models');
const Events=require('../src/models/PagoAccesoC3');
const TagsApplied=require('../src/models/PagoAccesoTagC3');
const service=require('../src/services/pagos-reparto.service');
const quotas=require('../src/services/cuotas-mantenimiento.service');
const calculation=require('../src/services/pagos-reparto-calculo');
const browser=require('../../docs/assets/js/pagos-reparto-calculo');
const controller=require('../src/controllers/pagos.controller');
for(const [name,p] of [['servidor',calculation],['navegador',browser]]){
 test(name+': suma exacta en centavos, casas únicas/autorizadas, cero y más de dos decimales',()=>{
  assert.deepEqual(p.normalizar([{casaId:2,monto:'0.20'},{casaId:1,monto:'0.10'},{casaId:3,monto:0}],'0.30',[1,2,3]),[{casaId:1,monto:.1},{casaId:2,monto:.2}]);
  for(const rows of [[{casaId:1,monto:599.99}],[{casaId:1,monto:600.01}],[{casaId:1,monto:-600}],[{casaId:1,monto:'600.001'}],[{casaId:4,monto:600}],[{casaId:1,monto:300},{casaId:1,monto:300}]]){
   assert.throws(()=>p.normalizar(rows,600,[1,2,3]));
  }
 });
}
function setup(t,{count=3}={}){
 const homes=[1,2,3].map(id=>({id,calle:'Calle ficticia',numero:String(id),cuotaPorCobrar:300,exencionesRecargo:[{desde:'2026-01',hasta:null}]}));
 const links=homes.slice(0,count).map(h=>({id:h.id,casaId:h.id}));
 const row=v=>({...v,async update(values){Object.assign(this,values);}});
 const paid=(casaId,mes)=>row({id:casaId,casaId,anio:2026,mes,estatusPago:'PAGADO',montoPagado:300,montoCuota:300,recargo:0});
 const fees=[paid(1,'AGOSTO'),paid(2,'OCTUBRE'),paid(3,'OCTUBRE')],events=[],writes=[],payments=[];
 const tx={LOCK:{UPDATE:'UPDATE'},afterCommit(fn){writes.push(fn);}};
 t.mock.method(models.UsuarioCasa,'findAll',async options=>{assert.equal(options.where.activo,true);return links;});
 t.mock.method(models.Casa,'findByPk',async id=>homes.find(h=>h.id===Number(id)));
 function match(r,w={}){return Reflect.ownKeys(w).every(k=>{
  const v=w[k];if(k===Op.or)return v.some(x=>match(r,x));
  if(v&&typeof v==='object')return Reflect.ownKeys(v).every(op=>op===Op.gt?Number(r[k])>v[op]:op===Op.in?v[op].includes(r[k]):true);
  return String(r[k])===String(v);
 });}
 const select=(rows,o)=>rows.filter(r=>match(r,o?.where));
 t.mock.method(models.Cuota,'findOne',async o=>select(fees,o)[0]||null);
 t.mock.method(models.Cuota,'findAll',async o=>select(fees,o));
 t.mock.method(models.Cuota,'create',async v=>{const r=row({id:fees.length+1,...v});fees.push(r);return r;});
 t.mock.method(models.PagoReportado,'findOne',async()=>null);
 t.mock.method(models.PagoReportado,'findByPk',async id=>payments.find(p=>p.id===id));
 t.mock.method(models.ZkTarjeta,'findAll',async()=>[]);
 t.mock.method(Events,'create',async v=>{const e=row({id:events.length+1,...v});events.push(e);return e;});
 t.mock.method(TagsApplied,'create',async()=>assert.fail('No hay TAGs'));
 t.mock.method(db,'transaction',async(options,callback)=>{
  const old=fees.map(r=>({...r})),oldEvents=events.slice(),oldPayments=payments.map(p=>({...p}));
  try{return await callback(tx);}catch(e){fees.splice(0,fees.length,...old);events.splice(0,events.length,...oldEvents);payments.forEach((p,i)=>{for(const k of Object.keys(p))delete p[k];Object.assign(p,oldPayments[i]);});throw e;}
 });
 return {homes,links,fees,events,payments,writes,tx,row};
}
test('una o dos viviendas conservan el flujo anterior; con tres se muestran sus adeudos',async t=>{
 const c=setup(t,{count:2});assert.equal((await service.catalogo(1)).habilitado,false);
 await assert.rejects(service.cotizar(1,[{casaId:1,monto:600}],600,'2026-10-07',c.tx),/más de dos/);
 c.links.push({id:3,casaId:3});
 const catalog=await service.catalogo(1);assert.equal(catalog.habilitado,true);assert.equal(catalog.viviendas.length,3);assert.ok(catalog.viviendas[0].adeudo>catalog.viviendas[1].adeudo);
});
test('un depósito de 600 se cotiza y acredita como 300 a dos casas, sin regalar meses ni duplicar dinero',async t=>{
 const c=setup(t);
 const plan=await service.cotizar(1,[{casaId:1,monto:300},{casaId:2,monto:300}],600,'2026-10-07',c.tx);
 assert.equal(plan.distribuciones.length,2);assert.equal(c.fees.length,3);assert.equal(c.events.length,0);
 const p=c.row({id:8,casaId:1,usuarioId:1,tipoPago:'MANTENIMIENTO',estatus:'PENDIENTE_VALIDACION',monto:600,recargo:0,
  fechaOperacion:'2026-10-07',folioOperacion:'1234567',identificadoresVerificados:{tipo:'referencia'},aplicacionCuotas:plan});c.payments.push(p);
 await controller.confirmarPagoDesdeBanco(8,'a'.repeat(64));
 assert.equal(p.estatus,'VALIDADO');assert.equal(p.aplicacionCuotas.aplicado,true);
 assert.equal(c.fees.find(f=>f.casaId===1&&f.mes==='SEPTIEMBRE').montoPagado,300);
 assert.equal(c.fees.find(f=>f.casaId===2&&f.mes==='NOVIEMBRE').montoPagado,300);
 const {paraCasa,planParaCasa}=require('../src/services/pagos-reparto-datos');
 const {historialMantenimiento}=require('../src/services/historial-pagos-vivienda.service');
 for(const id of [1,2]){
  const own=paraCasa([p],id);assert.equal(own.length,1);assert.equal(own[0].monto,300);
  const history=historialMantenimiento(c.fees.filter(f=>f.casaId===id),own);
  assert.equal(history.find(h=>h.referencia==='1234567').monto,300);
  assert.equal(planParaCasa(p,id).aplicado,true);
 }
 assert.equal(planParaCasa(p,3),null);
 assert.equal(c.events.length,2);assert.equal(c.events.reduce((s,e)=>s+e.montoOrigen,0),600);
 assert.equal(c.events[0].fechaObjetivo,'2026-10-10');assert.equal(c.events[1].fechaObjetivo,'2026-12-10');assert.equal(c.writes.length,0);
 await assert.rejects(controller.confirmarPagoDesdeBanco(8,'a'.repeat(64)),/ya no está pendiente/);
});
test('fallo de la segunda vivienda revierte la primera, el estado y el hash bancario',async t=>{
 const c=setup(t);const plan=await service.cotizar(1,[{casaId:1,monto:300},{casaId:2,monto:300}],600,'2026-10-07',c.tx);
 const p=c.row({id:9,casaId:1,usuarioId:1,tipoPago:'MANTENIMIENTO',estatus:'PENDIENTE_VALIDACION',monto:600,recargo:0,fechaOperacion:'2026-10-07',folioOperacion:'1234567',aplicacionCuotas:plan});c.payments.push(p);
 c.homes[1].cuotaPorCobrar=500;
 await assert.rejects(controller.confirmarPagoDesdeBanco(9,'b'.repeat(64)),/cambiaron/);
 assert.equal(c.fees.length,3);assert.equal(c.events.length,0);assert.equal(p.estatus,'PENDIENTE_VALIDACION');assert.equal(p.correoBancarioHash,undefined);
});
test('vivienda revocada impide aplicar el reparto y valores manipulados no se acreditan',async t=>{
 const c=setup(t);const plan=await service.cotizar(1,[{casaId:1,monto:600}],600,'2026-10-07',c.tx);
 c.links.shift();
 await assert.rejects(service.confirmar({usuarioId:1,monto:600,aplicacionCuotas:plan},c.tx),/no autorizada/);
 assert.equal(c.events.length,0);
});
test('una cotización ordinaria detecta pendientes repartidos en vivienda secundaria',async t=>{
 const c=setup(t);let query;
 t.mock.method(models.PagoReportado,'findOne',async o=>{query=o.where;return {id:8};});
 await assert.rejects(quotas.cotizar(2,'2026-10-07',300,c.tx),/pendiente/);
 assert.equal(query[Op.or][0].casaId,2);
 assert.match(JSON.stringify(query[Op.or][1]),/JSON_CONTAINS/);
});
test('cada asignación cubre sus propios recargos antes de principal; no se toman recargos de otra casa',async t=>{
 const c=setup(t);c.homes[0].exencionesRecargo=[];
 const plan=await service.cotizar(1,[{casaId:1,monto:300},{casaId:2,monto:300}],600,'2026-10-15',c.tx);
 assert.equal(plan.distribuciones[0].plan.recargo,100);assert.equal(plan.distribuciones[0].plan.meses,0);
 assert.equal(plan.distribuciones[1].plan.recargo,0);assert.equal(plan.distribuciones[1].plan.meses,1);
 await assert.rejects(service.cotizar(1,[{casaId:1,monto:50},{casaId:2,monto:550}],600,'2026-10-15',c.tx),/recargos/);
 assert.equal(c.events.length,0);assert.equal(c.fees.length,3);
});
