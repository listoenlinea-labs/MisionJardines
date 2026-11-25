const test=require('node:test');
const assert=require('node:assert/strict');
const state=require('../src/services/infraestructura-state.service');
function shared(){
 let saved={},events=[],tail=Promise.resolve();
 const copy=x=>JSON.parse(JSON.stringify(x));
 return {
  read:async()=>copy(saved),
  history:async()=>copy(events).reverse(),
  mutate(fn){const task=tail.then(()=>{const s=copy(saved),pending=[];const result=fn(s,e=>pending.push(copy(e)));saved=copy(s);events.push(...pending);return result;});tail=task.catch(()=>{});return task;}
 };
}
function env(t,enabled=true){
 const vars=['ZKTECO_DIRECT_HOST','INFRA_DYNAMIC_ZKTECO','INFRA_C3_SERIAL'];
 const prev=Object.fromEntries(vars.map(k=>[k,process.env[k]]));
 process.env.ZKTECO_DIRECT_HOST='8.8.8.8';process.env.INFRA_DYNAMIC_ZKTECO=String(enabled);process.env.INFRA_C3_SERIAL='TEST-C3';
 t.after(()=>{for(const k of vars)if(prev[k]===undefined)delete process.env[k];else process.env[k]=prev[k];});
}
const good=cfg=>({info:{serial:'TEST-C3'},async connect(){},async disconnect(){}});
test('IP pública y rechazo de privadas',()=>{for(const ip of ['127.0.0.1','10.1.1.1','192.168.1.201','169.254.169.254','100.64.1.1','172.16.1.1','224.1.1.1','::1','example.org','203.0.113.1'])assert.equal(state.publicIP(ip),false);assert.equal(state.publicIP('8.8.8.8'),true);});
test('modo manual no consulta C3 automáticamente',async t=>{env(t,false);const a=state.createService(shared());await a.report('1.1.1.1',{zkteco:true},null,()=>{throw Error('no debe llamar');});assert.equal(await a.effectiveHost(),'8.8.8.8');assert.equal((await a.status()).modoConexion,'MANUAL');});
test('reinicio/otro proceso conserva reporte, orden, diagnóstico básico y bitácora',async t=>{
 env(t);const db=shared(),a=state.createService(db);
 assert.equal(await a.effectiveHost(),undefined);
 await a.report('1.1.1.1',{vm:true,zkteco:true},null,good,{ubuntu:'192.168.1.167'});
 const b=state.createService(db);
 assert.equal(await b.effectiveHost(),'1.1.1.1');assert.equal((await b.status()).detalles.ubuntu,'192.168.1.167');
 const [one,two]=await Promise.all([a.queue('CONMUTADOR',1),b.queue('CONMUTADOR',2)]);
 assert.equal(Boolean(one.orden)+Boolean(two.orden),1);const job=one.orden||two.orden;
 const delivered=await b.report('1.1.1.1',{vm:true,zkteco:true},null,good);
 assert.equal(delivered.orden.id,job.id);
 const c=state.createService(db);await c.report('1.1.1.1',{vm:true,zkteco:true},{id:job.id,ok:true},good);
 assert.equal((await a.status()).orden.estado,'COMPLETADA');assert.ok((await c.status()).historial.some(e=>e.accion==='IP_C3_VERIFICADA'));
});
test('nueva IP, puerto local, serie equivocada y caducidad fallan cerrado',async t=>{
 env(t);const db=shared(),a=state.createService(db),b=state.createService(db);
 await a.report('1.1.1.1',{zkteco:true},null,good);assert.equal(await b.effectiveHost(),'1.1.1.1');
 await a.report('9.9.9.9',{zkteco:true},null,()=>({info:{serial:'OTHER'},async connect(){},async disconnect(){}}));
 assert.equal(await b.effectiveHost(),undefined);
 await a.report('1.1.1.1',{zkteco:true},null,good);
 process.env.INFRA_C3_SERIAL='OTHER';assert.equal(await b.effectiveHost(),undefined);process.env.INFRA_C3_SERIAL='TEST-C3';
 await a.report('1.1.1.1',{zkteco:false},null,good);assert.equal(await b.effectiveHost(),undefined);
 await a.report('9.9.9.9',{zkteco:true},null,good);
 await db.mutate(s=>{s.heartbeat.at=Date.now()-13*60*1000;});
 assert.equal(await b.effectiveHost(),undefined);assert.equal((await b.status()).enLinea,false);
});
test('resultado tardío no autoriza IP anterior entre procesos',async t=>{
 env(t);const db=shared(),a=state.createService(db),b=state.createService(db);let finish,started;
 const ready=new Promise(r=>started=r);
 const pending=a.report('1.1.1.1',{zkteco:true},null,()=>({info:{serial:'TEST-C3'},async connect(){await new Promise(r=>{finish=r;started();});},async disconnect(){}}));
 await ready;await b.report('9.9.9.9',{zkteco:true},null,good);finish();await pending;
 assert.equal(await a.effectiveHost(),'9.9.9.9');
});
test('sin MySQL no reutiliza host manual en dinámico',async t=>{env(t);const a=state.createService({read:async()=>{throw Error('DB');}});await assert.rejects(a.effectiveHost(),/DB/);});

test('monitor pasivo confirma UUID solo con muestra siguiente, no consume recuperación y caduca',async t=>{
 env(t);const db=shared(),a=state.createService(db),b=state.createService(db);
 const e={vm:true,asterisk:true,agente:true,zkteco:true},m={confirmacion:null};
 await a.report('1.1.1.1',e,null,good,{},m);
 assert.equal((await b.status()).monitoreo.enVivo,true);
 const order=(await b.queue('CONMUTADOR',1)).orden;
 const requested=(await b.requestRefresh()).solicitud;
 assert.equal((await a.requestRefresh()).solicitud.id,requested.id);
 const first=await a.report('1.1.1.1',{...e,asterisk:false},null,good,{asteriskCli:false},m);
 assert.equal(first.orden,null);assert.equal(first.solicitarMuestra,requested.id);
 assert.equal((await b.status()).monitoreo.solicitud.estado,'PENDIENTE');
 await a.report('1.1.1.1',{...e,asterisk:false},null,good,{asteriskCli:false},{confirmacion:requested.id});
 assert.equal((await b.status()).monitoreo.solicitud.estado,'COMPLETADA');
 assert.equal((await b.status()).orden.estado,'PENDIENTE');
 assert.equal((await a.report('1.1.1.1',e,null,good)).orden.id,order.id);
 assert.equal((await b.status()).equipos.asterisk,false);
 await db.mutate(s=>{s.live.at=Date.now()-31000;});
 assert.equal((await b.status()).monitoreo.enVivo,false);
 assert.equal((await b.status()).equipos,null);
 assert.ok((await b.requestRefresh()).error);
 assert.equal('historial' in await b.status(false),false);
});
