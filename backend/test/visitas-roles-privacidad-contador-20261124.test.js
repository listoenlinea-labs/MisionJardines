'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const Op={in:'IN',like:'LIKE'};
function fixture(){
 const houses=[
  {id:101,calle:'Rosas',calleCorrecta:'Rosas',numero:'18',nombre:'Propietario privado'},
  {id:202,calle:'Gardenias',calleCorrecta:'Gardenias',numero:'5',nombre:'Otro propietario'},
  {id:303,calle:'Prueba',calleCorrecta:'Prueba',numero:'TEST-001',hidden:true}
 ];
 const visits=[
  {id:1,casaId:101,nombreVisitante:'María',estatus:'PROGRAMADA',codigo:'CODIGO-PRIVADO',
   telefono:'3311111111',placas:'PRIVADAS',identificacion:'INE',autorizadoPor:'Residente privado',
   notas:'Datos privados',fechaProgramada:'2026-11-24',horaProgramada:'09:00',
   casa:houses[0]},
  {id:2,casaId:202,nombreVisitante:'Luis',estatus:'EN_CURSO',codigo:'CODIGO-2',
   telefono:'3322222222',placas:'OCULTA',autorizadoPor:'Otro',
   fechaProgramada:'2026-11-24',horaProgramada:'10:00',casa:houses[1]},
  {id:3,casaId:303,nombreVisitante:'TEST',estatus:'PROGRAMADA',
   fechaProgramada:'2026-11-24',horaProgramada:'11:00',casa:houses[2]}
 ];
 const queries=[];let savedEncryptedPhoto=null;
 const transactionCalls=[];
 const Casa={
  findAll:async opts=>{
   queries.push({type:'houses',opts});
   return houses.filter(h=>!opts.where?.id||h.id===opts.where.id);
  },
  findByPk:async id=>houses.find(h=>h.id===id)||null
 };
 const Visita={
  findAll:async opts=>{
   queries.push({type:'list',opts});
   let data=visits.filter(v=>
     (!opts.where?.casaId||v.casaId===opts.where.casaId)&&
     (!opts.where?.estatus||v.estatus===opts.where.estatus));
   return data;
  },
  count:async opts=>visits.filter(v=>v.estatus===opts.where.estatus &&
    opts.where.casaId[Op.in].includes(v.casaId)).length,
  findByPk:async id=>visits.find(v=>v.id===Number(id))||null,
  findOne:async()=>null,
  create:async values=>{
   const id=Math.max(...visits.map(x=>x.id))+1;
   const visit={id,estatus:'PROGRAMADA',...values,casa:houses.find(h=>h.id===values.casaId)};
   visits.push(visit);
   return visit;
  },
  update:async(values,opts)=>{
   const visit=visits.find(v=>v.id===Number(opts.where.id)&&v.estatus===opts.where.estatus);
   if(!visit)return [0];
   Object.assign(visit,values);
   return [1];
  }
 };
 const module={exports:{}};
 vm.runInNewContext(read('backend/src/controllers/visitas.controller.js'),{
  module,console,
  require(name){
   if(name==='crypto')return require('crypto');
   if(name==='sequelize')return {Op};
   if(name==='../models')return {Visita,Casa};
   if(name==='../config/database')return {transaction:async callback=>{const transaction={id:'test'};transactionCalls.push(transaction);return callback(transaction);}};
   if(name==='../services/visitas-identificacion.service')return {
     validatePhoto:value=>value?{bytes:Buffer.from('foto'),mime:'image/jpeg'}:null,
     encryptPhoto:photo=>({datosCifrados:photo.bytes,nonce:Buffer.from('nonce'),etiqueta:Buffer.from('tag'),mime:photo.mime}),
     save:async(id,data,options)=>{savedEncryptedPhoto={id,data,options};},findForAdmin:async()=>null
   };
   if(name==='../services/viviendas-visibles.service')return {
    esViviendaVisible:value=>!value?.hidden
   };
   throw Error('Import no admitido: '+name);
  }
 });
 async function run(method,role,extras={}){
  const result={status:200};
  const res={
   set(){return this;},
   status(x){result.status=x;return this;},
   json(x){result.body=JSON.parse(JSON.stringify(x));return this;}
  };
  await module.exports[method]({
   usuario:{rol:role,usuarioId:8,casaId:101},
   query:{},body:{},params:{},...extras
  },res);
  return result;
 }
 return {houses,visits,queries,run,transactionCalls,getPhoto:()=>savedEncryptedPhoto};
}
test('El guardia recibe solo vivienda, nombre, estado e id (nunca teléfono o autorizadoPor)',async()=>{
 const mock=fixture();
 const response=await mock.run('list','SEGURIDAD');
 assert.equal(response.status,200);
 assert.equal(response.body.total,2);
 const record=response.body.data[0];
 assert.deepEqual(Object.keys(record).sort(),['casa','estatus','id','nombreVisitante']);
 assert.deepEqual(Object.keys(record.casa).sort(),['calle','numero']);
 assert.equal(record.casa.calle,'Rosas');
 assert.equal(record.nombreVisitante,'María');
 assert.doesNotMatch(JSON.stringify(response.body),/3311111111|PRIVADAS|INE|CODIGO-PRIVADO|Propietario privado|Residente privado/);
 const list=mock.queries.find(q=>q.type==='list').opts;
 assert.deepEqual(Array.from(list.attributes),['id','casaId','nombreVisitante','estatus']);
 assert.deepEqual(Array.from(list.include[0].attributes),['id','calle','calleCorrecta','numero']);
});
test('Condómino consulta su vivienda real y no puede registrar visita en otra',async()=>{
 const mock=fixture();
 const own=await mock.run('list','CONDOMINO');
 assert.equal(own.body.total,1);
 assert.equal(own.body.data[0].casaId,101);
 const created=await mock.run('create','CONDOMINO',{body:{
  casaId:202,nombreVisitante:'Nuevo visitante',autorizadoPor:'Residente',
  tipo:'OTRO',fechaProgramada:'2026-11-25',telefono:'3399999999'
 }});
 assert.equal(created.status,201);
 assert.equal(created.body.data.casaId,101,'el usuario no controla casaId desde el body');
 const another=await mock.run('viviendas','CONDOMINO');
 assert.equal(another.body.data.length,1);
 assert.equal(another.body.data[0].id,101);
 assert.ok(!('nombre' in another.body.data[0]));
});
test('Seguridad registra visitas en vivienda seleccionada y recibe solamente datos mínimos',async()=>{
 const mock=fixture();
 const houses=await mock.run('viviendas','SEGURIDAD');
 assert.equal(houses.status,200);
 assert.equal(houses.body.data.length,2);
 assert.deepEqual(Object.keys(houses.body.data[0]).sort(),['calle','calleCorrecta','id','numero']);
 const created=await mock.run('create','SEGURIDAD',{body:{
  casaId:202,nombreVisitante:'Visitante de caseta',autorizadoPor:'Guardia Rosa',
  tipo:'OTRO',fechaProgramada:'2028-01-01',horaProgramada:'01:00',
  telefono:'NUNCA',notas:'NUNCA',identificacion:'NUNCA',placas:'ABC123'
 }});
 assert.equal(created.status,201);
 assert.deepEqual(Object.keys(created.body.data).sort(),['casa','estatus','id','nombreVisitante']);
 assert.equal(created.body.data.casa.numero,'5');
 const saved=mock.visits.find(v=>v.nombreVisitante==='Visitante de caseta');
 assert.equal(saved.telefono,null);assert.equal(saved.notas,null);assert.equal(saved.identificacion,null);
 assert.match(saved.fechaProgramada,/^\\d{4}-\\d{2}-\\d{2}$/);
 assert.notEqual(saved.fechaProgramada,'2028-01-01','fecha enviada por cliente debe ignorarse');
 assert.notEqual(saved.horaProgramada,'01:00','hora enviada por cliente debe ignorarse');
 assert.ok(!JSON.stringify(created.body).includes('Guardia Rosa'));
 const denied=await mock.run('create','SEGURIDAD',{body:{casaId:999,nombreVisitante:'Prueba',autorizadoPor:'Guardia',tipo:'OTRO'}});
 assert.equal(denied.status,404);
});

test('Identificación fotográfica opcional se guarda dentro de una transacción sin devolverla al guardia',async()=>{
 const mock=fixture();
 const response=await mock.run('create','SEGURIDAD',{body:{
  casaId:101,nombreVisitante:'Visitante foto',autorizadoPor:'Guardia',
  tipo:'OTRO',identificacionFoto:'data:image/jpeg;base64,TEST'
 }});
 assert.equal(response.status,201);
 assert.equal(mock.transactionCalls.length,1);
 assert.equal(mock.getPhoto().id,mock.visits.find(v=>v.nombreVisitante==='Visitante foto').id);
 assert.equal(mock.getPhoto().options.transaction,mock.transactionCalls[0]);
 assert.ok(!('foto' in response.body.data));
 const resident=await mock.run('create','CONDOMINO',{body:{
  nombreVisitante:'Residente',autorizadoPor:'Vecino',tipo:'OTRO',
  fechaProgramada:'2026-11-25',identificacionFoto:'data:image/jpeg;base64,TEST'
 }});
 assert.equal(resident.status,403);
});
test('El contador es PROGRAMADA: baja al entrar y sigue visible para salida',async()=>{
 const mock=fixture();
 const first=await mock.run('pendientes','SEGURIDAD');
 assert.equal(first.body.cantidad,1,'solo las visitas pendientes de casas visibles');
 const entered=await mock.run('enter','SEGURIDAD',{params:{id:1}});
 assert.equal(entered.status,200);
 assert.equal(entered.body.data.estatus,'EN_CURSO');
 assert.equal(entered.body.data.nombreVisitante,'María');
 assert.ok(!('telefono' in entered.body.data));
 assert.equal((await mock.run('pendientes','SEGURIDAD')).body.cantidad,0);
 assert.equal((await mock.run('list','SEGURIDAD')).body.data.find(x=>x.id===1).estatus,'EN_CURSO');
 const twice=await mock.run('enter','SEGURIDAD',{params:{id:1}});
 assert.equal(twice.status,409);
 const exited=await mock.run('exit','SEGURIDAD',{params:{id:1}});
 assert.equal(exited.status,200);
 assert.equal(exited.body.data.estatus,'FINALIZADA');
 assert.ok(!('placas' in exited.body.data));
 const second=await mock.run('exit','SEGURIDAD',{params:{id:1}});
 assert.equal(second.status,409);
});
test('El rol Seguridad solo puede registrar entrada y salida; Condómino puede cancelar',()=>{
 const routes=read('backend/src/routes/visitas.routes.js');
 assert.match(routes,/router\.get\('\/pendientes', autenticarToken, security, pendientes\)/);
 assert.match(routes,/router\.get\('\/viviendas', autenticarToken, issuers, viviendas\)/);
 assert.match(routes,/const issuers = autorizarRoles\('[^']+'[^\n]*'SEGURIDAD'\)/);
 assert.match(routes,/router\.get\('\/:id\/identificacion-foto', autenticarToken, managers, readIdentificationPhoto\)/);
 assert.match(routes,/router\.post\('\/', autenticarToken, issuers, create\)/);
 assert.match(routes,/router\.patch\('\/:id\/entrada', autenticarToken, security, enter\)/);
 assert.match(routes,/router\.patch\('\/:id\/salida', autenticarToken, security, exit\)/);
 assert.match(routes,/router\.patch\('\/:id\/cancelar', autenticarToken, issuers, cancel\)/);
});
test('La UI de Seguridad minimiza columnas y actualiza burbuja tras cambios',()=>{
 const html=read('docs/visitas.html'),sidebar=read('docs/assets/js/site-sidebar.js');
 assert.match(html,/visitPendingBadge/);
 assert.match(html,/visit-security-table/);
 assert.match(html,/const guardView = actualIsSecurity/);
 assert.match(html,/if\(actualIsSecurity\)showVisitPage\('homes'\)/);
 assert.match(html,/capture="environment"/);
 assert.match(html,/id="guardHouseSummary"|id="guardSelectedHouse"/);
 assert.match(html,/\/visitas\/viviendas/);
 assert.match(html,/\/visitas\/pendientes/);
 assert.match(html,/MJ_VISITAS_CAMBIOS/);
 assert.match(html,/visitsRequestSeq/);
 assert.match(sidebar,/watchVisitNotices/);
 assert.match(sidebar,/mj:visitas-cambios/);
 assert.match(sidebar,/MJ_VISITAS_CAMBIOS/);
 assert.match(sidebar,/setInterval\(\(\)=>refresh\(\),15000\)/);
 for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))
   if(match[1].trim())assert.doesNotThrow(()=>new vm.Script(match[1]));
});
