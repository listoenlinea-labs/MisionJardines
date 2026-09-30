const test=require('node:test');
const assert=require('node:assert/strict');
Object.assign(process.env,{DB_HOST:'localhost',DB_PORT:'3306',DB_NAME:'test',DB_USER:'test',DB_PASSWORD:'unused',JWT_SECRET:'test-secret'});
const models=require('../src/models');
const {seleccionarCasa,gestionar,invitacion,hash,vincular}=require('../src/services/viviendas.service');
const tx={LOCK:{UPDATE:'UPDATE'}};
test('selected house is validated against active memberships on every request',async t=>{
 const calls=[];t.mock.method(models.UsuarioCasa,'findOne',async options=>{calls.push(options);return options.where.casaId==='20'?{casaId:20}:options.where.casaId?null:{casaId:10};});
 assert.equal(await seleccionarCasa(5),10);
 assert.equal(await seleccionarCasa(5,'20'),20);
 await assert.rejects(seleccionarCasa(5,'99'),e=>e.status===403);
 await assert.rejects(seleccionarCasa(5,'0'),e=>e.status===400);
 await assert.rejects(seleccionarCasa(5,'20 OR 1=1'),e=>e.status===400);
 assert.ok(calls.every(o=>o.where.usuarioId===5&&o.where.activo===true));
});
test('a revoked membership cannot fall back to obsolete primary house',async t=>{
 t.mock.method(models.UsuarioCasa,'findOne',async()=>null);
 assert.equal(await seleccionarCasa(5),null);
 await assert.rejects(seleccionarCasa(5,'20'),e=>e.status===403);
});
test('only responsible members of the requested house can invite',async t=>{
 t.mock.method(models.UsuarioCasa,'findOne',async options=>options.where.casaId===20&&options.where.tipo==='RESPONSABLE'&&options.where.activo?{id:1}:null);
 await gestionar({usuarioId:5,rol:'CONDOMINO'},20,tx);
 await assert.rejects(gestionar({usuarioId:5,rol:'CONDOMINO'},99,tx),e=>e.status===403);
 await gestionar({usuarioId:2,rol:'ADMINISTRADOR'},99,tx);
});
test('invitation tokens are hashed, locked, expire and cannot be reused',async t=>{
 const token='a'.repeat(64);let state={expiraEn:new Date(Date.now()+10000)};
 t.mock.method(models.InvitacionCasa,'findOne',async options=>{assert.equal(options.where.tokenHash,hash(token));assert.equal(options.lock,'UPDATE');return state;});
 await invitacion(token,tx);
 for(const extra of [{aceptadoEn:new Date()},{revocadoEn:new Date()},{expiraEn:new Date(0)}]){
  state={expiraEn:new Date(Date.now()+10000),...extra};
  await assert.rejects(invitacion(token,tx),e=>e.status===410);
 }
 await assert.rejects(invitacion('invalid',tx),e=>e.status===400);
});
test('linking a second house preserves responsible permissions and records history',async t=>{
 const link={id:1,usuarioId:5,casaId:20,activo:true,tipo:'RESPONSABLE',async update(values){Object.assign(this,values);}};
 t.mock.method(models.UsuarioCasa,'findOrCreate',async options=>{assert.deepEqual(options.where,{usuarioId:5,casaId:20});return [link,false];});
 let audit;t.mock.method(models.HistorialVinculo,'create',async values=>audit=values);
 await vincular({usuarioId:5,casaId:20,tipo:'MIEMBRO',actorId:9,transaction:tx});
 assert.equal(link.tipo,'RESPONSABLE');assert.equal(audit.casaId,20);assert.equal(audit.actorId,9);
});
