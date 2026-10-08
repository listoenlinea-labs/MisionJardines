const test=require('node:test');
const assert=require('node:assert/strict');
Object.assign(process.env,{DB_HOST:'localhost',DB_PORT:'3306',DB_NAME:'test',DB_USER:'test',DB_PASSWORD:'unused',ZKTECO_DIRECT_HOST:'localhost'});
const direct=require('../src/services/zkteco-direct.service');
const worker=require('../src/services/zkteco-vigencias.service');
const Casa=require('../src/models/Casa');
const ZkTarjeta=require('../src/models/ZkTarjeta');
const {C3Client}=require('../src/services/zkteco-c3-client.service');
const cards=['210073','3277920','5112343','9917503'];
const house={id:5,calle:'Gardenias',numero:'5',controles:cards.join(', '),
  async update(values){Object.assign(this,values)}};
function prepare(t,{users=null,authorizations=null,initialConfirmed=false}={}){
 const items=cards.map((number,i)=>({id:i+1,casaId:5,numeroTarjeta:number,
  enControlador:initialConfirmed,bloqueado:false,fechaFin:'2027-01-11',
  async update(data){Object.assign(this,data)}}));
 const panelUsers=users??cards.map((card,i)=>({CARD_NO:card,PIN:String(101+i),UID:i+1,
   START_TIME:20260101,END_TIME:20270111}));
 const auth=authorizations??cards.slice(0,3).map((_,i)=>({PIN:String(101+i),AUTHORIZE_DOOR_ID:3}));
 t.mock.method(C3Client.prototype,'connect',async function(){this.info={serial:'C3-TEST',firmware:'test'}});
 t.mock.method(C3Client.prototype,'disconnect',async()=>{});
 t.mock.method(C3Client.prototype,'getData',async table=>{
  if(table==='user')return panelUsers;
  if(table==='userauthorize')return auth;
  throw Error('Unexpected table');
 });
 t.mock.method(Casa,'findAll',async()=>[house]);
 t.mock.method(Casa,'findByPk',async()=>house);
 t.mock.method(ZkTarjeta,'findAll',async()=>items);
 t.mock.method(ZkTarjeta,'create',async()=>assert.fail('Must not create duplicate'));
 const marked=[];
 t.mock.method(worker,'marcarPendiente',async casaId=>marked.push(casaId));
 return {items,marked};
}
test('Gardenias 5: 4 tags previously unconfirmed become confirmed when the C3 actually returns them',async t=>{
 const {items}=prepare(t);
 const out=await direct.syncUsers();
 assert.equal(out.reconocidos,4);assert.equal(out.noObservados,0);
 assert.deepEqual(items.map(x=>x.enControlador),[true,true,true,true]);
 assert.deepEqual(items.map(x=>x.bloqueado),[false,false,false,true]);
});
test('a partial 1 of 4 user inventory never changes the other three to nonexistent',async t=>{
 const {items}=prepare(t,{users:[{CardNo:'210073',Pin:'101',EndTime:20270111}],initialConfirmed:true});
 const out=await direct.syncUsers();
 assert.equal(out.reconocidos,1);assert.equal(out.noObservados,3);
 assert.equal(out.ausentes,0);
 assert.deepEqual(items.map(x=>x.enControlador),[true,true,true,true]);
});
test('a zero-user read is rejected even if all four tags are already unconfirmed locally',async t=>{
 const {items}=prepare(t,{users:[]});
 await assert.rejects(direct.syncUsers(),/lectura|tarjeta/i);
 assert.deepEqual(items.map(x=>x.enControlador),[false,false,false,false]);
});
test('the diagnostic reports real panel presence separately from authorization, without changing tags',async t=>{
 const {items}=prepare(t);
 const out=await direct.diagnosticarVivienda(5);
 assert.equal(out.panel.serial,'C3-TEST');
 assert.equal(out.panel.usuariosLeidos,4);
 assert.equal(out.tarjetas.length,4);
 assert.ok(out.tarjetas.every(x=>x.fisicamenteObservado));
 assert.deepEqual(out.tarjetas.map(x=>x.estadoFisico),[
   'PRESENTE_AUTORIZADO','PRESENTE_AUTORIZADO','PRESENTE_AUTORIZADO','PRESENTE_SIN_AUTORIZACION'
 ]);
 assert.deepEqual(items.map(x=>x.enControlador),[false,false,false,false],'diagnostics never update SQL');
});
