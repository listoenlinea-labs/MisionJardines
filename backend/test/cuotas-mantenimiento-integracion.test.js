'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
Object.assign(process.env,{DB_HOST:'localhost',DB_PORT:'3306',DB_NAME:'test',DB_USER:'test',DB_PASSWORD:'unused'});
const db=require('../src/config/database');
const {Op}=require('sequelize');
const models=require('../src/models');
const Eventos=require('../src/models/PagoAccesoC3');
const Aplicaciones=require('../src/models/PagoAccesoTagC3');
const service=require('../src/services/cuotas-mantenimiento.service');
const controller=require('../src/controllers/pagos.controller');
const worker=require('../src/services/zkteco-vigencias.service');
const direct=require('../src/services/zkteco-direct.service');
const {calcularAdeudoVivienda}=require('../src/services/adeudo-vivienda-analisis.service');
function setup(t){
 const cuotas=[],pagos=[],eventos=[],intentos=[],tags=[],hooks=[],writes=[],physical=new Map();
 let failCreate=false,failSQLAfterTCP=false;
 const row=values=>({...values,async update(v){if(failSQLAfterTCP&&tags.includes(this)){failSQLAfterTCP=false;throw Error('Fallo SQL después de TCP');}Object.assign(this,v);return this;}});
 const match=(r,w={})=>Reflect.ownKeys(w).every(k=>{
  const v=w[k];
  if(v&&typeof v==='object')return Reflect.ownKeys(v).every(op=>op===Op.notIn?!v[op].includes(r[k]):op===Op.in?v[op].includes(r[k]):true);
  return String(v)===String(r[k]);
 });
 const casa={id:7,calle:'Calle sintética',numero:'1',cuotaPorCobrar:300};
 t.mock.method(models.Casa,'findByPk',async(id,o)=>{assert.ok(o.transaction);assert.equal(o.lock,'UPDATE');return casa;});
 for(const [model,rows] of [[models.Cuota,cuotas],[models.PagoReportado,pagos],[Eventos,eventos],[Aplicaciones,intentos],[models.ZkTarjeta,tags]]){
  t.mock.method(model,'findAll',async o=>rows.filter(r=>match(r,o?.where)));
  t.mock.method(model,'findOne',async o=>rows.find(r=>match(r,o?.where))||null);
  t.mock.method(model,'findByPk',async id=>rows.find(r=>String(r.id)===String(id))||null);
  t.mock.method(model,'create',async(v,o)=>{assert.ok(o.transaction);if(failCreate&&model===Eventos)throw Error('Fallo diario');const r=row({id:rows.length+1,...v});rows.push(r);return r;});
 }
 let committed=new Set();
 const tx={LOCK:{UPDATE:'UPDATE'},afterCommit(fn){hooks.push(fn);}};
 // Almacenamiento en memoria con rollback; no afirma probar locks de MySQL real.
 t.mock.method(db,'transaction',async(options,callback)=>{
  const all=[cuotas,pagos,eventos,intentos,tags],snapshots=all.map(rows=>rows.map(r=>[r,{...r}]));
  try{const result=await callback(tx);committed=new Set(intentos.filter(r=>r.fechaAntes).map(r=>r.id));return result;}
  catch(e){all.forEach((rows,i)=>{rows.length=0;for(const [r,s] of snapshots[i]){for(const k of Object.keys(r))delete r[k];Object.assign(r,s);rows.push(r);}});throw e;}
 });
 t.mock.method(direct,'readUserValidity',async card=>{assert.ok(physical.has(card));return {...physical.get(card)};});
 t.mock.method(direct,'writeUserValidity',async(card,start,end,options)=>{
  const intent=intentos.find(i=>i.numeroTarjeta===card);
  assert.ok(committed.has(intent.id),'el intento se confirma antes de escribir TCP');
  assert.equal(options.mode,'DIRECT');assert.equal(start,null);
  const state=physical.get(card);assert.equal(state.fechaFinal,options.expectedEnd);assert.equal(state.pin,options.expectedPin);
  state.fechaFinal=end;writes.push(end);
 });
 cuotas.push(row({id:1,casaId:7,anio:2026,mes:'SEPTIEMBRE',estatusPago:'PAGADO',montoPagado:300}));
 async function report(monto,folio='BANCO-SINTETICO-'+(pagos.length+1)){
  const plan=await service.cotizar(7,'2026-10-15',monto,tx);
  const p=row({id:pagos.length+1,casaId:7,usuarioId:2,tipoPago:'MANTENIMIENTO',estatus:'PENDIENTE_VALIDACION',
   monto,recargo:plan.recargo,fechaOperacion:'2026-10-15',folioOperacion:folio,aplicacionCuotas:plan});pagos.push(p);return p;
 }
 function addTag(date){tags.push(row({id:tags.length+1,casaId:7,numeroTarjeta:'SINTETICO',bloqueado:true}));physical.set('SINTETICO',{pin:'42',fechaFinal:date,autorizaciones:'puertas-originales'});}
 return {cuotas,pagos,eventos,intentos,tags,hooks,tx,writes,physical,casa,report,addTag,
  failCreate(){failCreate=true;},failSQLAfterTCP(){failSQLAfterTCP=true;}};
}
const confirmar=p=>controller.confirmarPagoDesdeBanco(p.id,'a'.repeat(64));
test('Sin TAGs: cotizar/reportar no acredita; la confirmación bancaria actualiza Análisis y no intenta TCP',async t=>{
 const c=setup(t),p=await c.report(350);
 assert.equal(c.cuotas.length,1);assert.equal(c.eventos.length,0);
 const result=await confirmar(p);
 assert.equal(p.estatus,'VALIDADO');assert.equal(result.vigencia.sinTags,true);
 assert.equal(c.eventos[0].estado,'SIN_TAGS');assert.equal(c.hooks.length,0);assert.equal(c.writes.length,0);
 const a=calcularAdeudoVivienda(c.cuotas,{anio:2026,mes:10,hoy:'2026-10-15'});
 assert.equal(a.saldoPendiente,0);assert.equal(a.ultimoMesPagado.mes,'OCTUBRE');
 await assert.rejects(confirmar(p),/ya no está pendiente/);assert.equal(c.cuotas[1].montoPagado,350);
});
test('Pago, cuotas y diario se revierten juntos si falla su persistencia',async t=>{
 const c=setup(t),p=await c.report(350);c.failCreate();
 await assert.rejects(confirmar(p),/Fallo diario/);
 assert.equal(p.estatus,'PENDIENTE_VALIDACION');assert.equal(c.cuotas.length,1);assert.equal(c.eventos.length,0);
 assert.equal(p.aplicacionCuotas.aplicado,undefined);assert.equal(c.writes.length,0);
});
test('Cambios de cuota o tarifa posteriores al reporte exigen conciliación y no acreditan',async t=>{
 const c=setup(t),p=await c.report(350);c.casa.cuotaPorCobrar=150;
 await assert.rejects(confirmar(p),/cambiaron desde el reporte/);
 assert.equal(p.estatus,'PENDIENTE_VALIDACION');assert.equal(c.cuotas.length,1);
});
test('Se bloquean pendientes simultáneos, referencias ya acreditadas y reportes anteriores sin reparto',async t=>{
 const c=setup(t),p=await c.report(350);
 await assert.rejects(service.cotizar(7,'2026-10-15',350,c.tx),/pendiente/);
 p.aplicacionCuotas=null;await assert.rejects(confirmar(p),/anterior a la unificación/);
 assert.equal(p.estatus,'PENDIENTE_VALIDACION');
 p.folioOperacion='910260';p.identificadoresVerificados={tipo:'referencia'};
 c.cuotas[0].referencia='0910260';
 await assert.rejects(confirmar(p),/ya está acreditada/);
});
test('Complementos conservan abonos por periodo y no repiten recargos',async t=>{
 const c=setup(t),a=await c.report(300);await confirmar(a);
 const b=await c.report(50);assert.equal(b.recargo,0);const result=await confirmar(b);
 assert.equal(c.cuotas[1].montoPagado,350);assert.equal(c.cuotas[1].recargoPagado,50);
 assert.equal(result.vigencia.meses,1);assert.equal(c.cuotas[1].estatusPago,'PAGADO');
});
test('C3 recibe la fecha absoluta de cuotas aunque su fecha física esté atrasada; reintento no suma meses',async t=>{
 const c=setup(t);c.addTag('2025-01-11');const p=await c.report(350);await confirmar(p);
 assert.equal(c.eventos[0].fechaObjetivo,'2026-11-10');assert.equal(c.writes.length,0);
 c.failSQLAfterTCP();await worker.sincronizarCasa(7,{dryRun:false});
 assert.equal(c.physical.get('SINTETICO').fechaFinal,'2026-11-10');assert.equal(c.eventos[0].estado,'ERROR');
 c.eventos[0].proximoIntento=null;await worker.sincronizarCasa(7,{dryRun:false});
 assert.deepEqual(c.writes,['2026-11-10']);assert.equal(c.eventos[0].estado,'COMPLETADO');
 assert.equal(c.tags[0].bloqueado,true);assert.equal(c.physical.get('SINTETICO').autorizaciones,'puertas-originales');
 assert.equal(c.intentos[0].fechaAntes,'2025-01-11');
});
test('C3 adelantado genera conflicto de acceso sin cancelar el abono confirmado en cuotas',async t=>{
 const c=setup(t);c.addTag('2028-01-10');const p=await c.report(350);await confirmar(p);
 await worker.sincronizarCasa(7,{dryRun:false});
 assert.equal(c.eventos[0].estado,'CONFLICTO');assert.equal(c.writes.length,0);
 assert.equal(c.cuotas[1].estatusPago,'PAGADO');assert.equal(p.estatus,'VALIDADO');
});
test('Un objetivo manipulado o sin cuotas de respaldo no escribe al controlador',async t=>{
 const c=setup(t);c.addTag('2026-10-10');const p=await c.report(350);await confirmar(p);
 c.eventos[0].fechaObjetivo='2029-01-10';await worker.sincronizarCasa(7,{dryRun:false});
 assert.equal(c.eventos[0].estado,'CONFLICTO');assert.equal(c.writes.length,0);
});
test('La captura administrativa de cuotas también entrega cobertura absoluta, sin sumar fechas físicas',async t=>{
 const c=setup(t);c.addTag('2020-01-10');
 const cuota={id:2,casaId:7,anio:2026,mes:'OCTUBRE',estatusPago:'PAGADO',montoPagado:350,recargo:50};c.cuotas.push(cuota);
 const r=await service.registrarCambioCuota(7,2,c.tx,{registro:cuota,anterior:{...cuota,estatusPago:'PENDIENTE',montoPagado:0}});
 assert.equal(r.fechaFinal,'2026-11-10');assert.equal(c.eventos[0].origen,'CUOTA_SQL');
 await worker.sincronizarCasa(7,{dryRun:false});assert.deepEqual(c.writes,['2026-11-10']);
 const repeated=await service.registrarCambioCuota(7,2,c.tx,{registro:cuota,anterior:{...cuota,estatusPago:'PENDIENTE',montoPagado:0}});
 assert.equal(repeated.sincronizacion,'SIN_AVANCE');assert.equal(c.eventos.length,1);
});
test('La cotización HTTP devuelve el reparto del importe y la vigencia SQL, sin conexión al C3',async t=>{
 const c=setup(t);let body,code=200;
 const res={status(n){code=n;return this;},setHeader(){},json(v){body=v;return this;}};
 await controller.cotizacionMantenimiento({usuario:{casaId:7},query:{fechaOperacion:'2026-10-15',horaOperacion:'12:00:00',monto:'350'}},res);
 assert.equal(code,200);assert.equal(body.data.fuente,'CUOTAS');assert.equal(body.data.meses,1);
 assert.equal(body.data.fechaFinalObjetivo,'2026-11-10');assert.equal(c.writes.length,0);
});
