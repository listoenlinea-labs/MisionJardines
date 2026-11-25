const test=require('node:test');
const assert=require('node:assert/strict');
const service='../src/services/infraestructura-state.service';
const newState=()=>{delete require.cache[require.resolve(service)];return require(service);};
const variables=['ZKTECO_DIRECT_HOST','INFRA_DYNAMIC_ZKTECO','INFRA_C3_SERIAL'];
function env(t,enabled=true){
 const previous=Object.fromEntries(variables.map(k=>[k,process.env[k]]));
 process.env.ZKTECO_DIRECT_HOST='8.8.8.8';
 process.env.INFRA_DYNAMIC_ZKTECO=String(enabled);
 process.env.INFRA_C3_SERIAL='TEST-C3';
 t.after(()=>{for(const k of variables){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];}});
}
test('rechaza IP privadas, CGNAT, multicast y direcciones no IPv4',()=>{
 const state=newState();
 for(const ip of ['127.0.0.1','10.1.1.1','192.168.1.201','169.254.169.254','100.64.1.1','172.16.1.1','224.1.1.1','255.255.255.255','::1','example.org','203.0.113.1'])assert.equal(state.publicIP(ip),false,ip);
 assert.equal(state.publicIP('8.8.8.8'),true);
});
test('modo manual conserva host configurado y no verifica automáticamente',async t=>{
 env(t,false); const state=newState();
 const calls=[];
 await state.report('1.1.1.1',{zkteco:true},null,cfg=>{calls.push(cfg.host);throw Error('no debe llamar');});
 assert.equal(state.effectiveHost(),'8.8.8.8');
 assert.equal(state.status().modoConexion,'MANUAL');
 assert.deepEqual(calls,[]);
});
test('dinámico: sin reporte no hay destino, no se usa la variable manual',t=>{
 env(t); const state=newState();
 assert.equal(state.effectiveHost(),undefined);
 assert.equal(state.status().modoConexion,'ESPERANDO_IP');
 assert.equal(state.status().ipManual,'8.8.8.8');
});
test('dinámico: verifica solamente IP reportada y cambia de inmediato al nuevo reporte',async t=>{
 env(t); const state=newState(); const calls=[];
 const make=cfg=>({info:{serial:'TEST-C3'},async connect(){calls.push(cfg.host);},async disconnect(){}});
 const e={zkteco:true};
 await state.report('1.1.1.1',e,null,make);
 assert.deepEqual(calls,['1.1.1.1']);
 assert.equal(state.effectiveHost(),'1.1.1.1');
 assert.equal(state.status().modoConexion,'DINAMICA');
 await state.report('1.1.1.1',e,null,make);
 assert.deepEqual(calls,['1.1.1.1']);
 await state.report('9.9.9.9',e,null,make);
 assert.deepEqual(calls,['1.1.1.1','9.9.9.9']);
 assert.equal(state.effectiveHost(),'9.9.9.9');
});
test('fallos TCP, serie equivocada o puerto local no permiten usar destino manual',async t=>{
 env(t);const state=newState();const calls=[];
 const fail=cfg=>({info:{serial:'TEST-C3'},async connect(){calls.push(cfg.host);throw Error('TCP');},async disconnect(){}});
 await state.report('1.1.1.1',{zkteco:true},null,fail);
 assert.equal(state.effectiveHost(),undefined);
 const wrong=cfg=>({info:{serial:'OTHER'},async connect(){calls.push(cfg.host);},async disconnect(){}});
 await state.report('9.9.9.9',{zkteco:true},null,wrong);
 assert.equal(state.effectiveHost(),undefined);
 assert.equal(state.status().zkteco.ok,false);
 await state.report('9.9.9.9',{zkteco:false},null,wrong);
 assert.deepEqual(calls,['1.1.1.1','9.9.9.9']);
 assert.equal(state.effectiveHost(),undefined);
 process.env.INFRA_DYNAMIC_ZKTECO='false';
 assert.equal(state.effectiveHost(),'8.8.8.8');
});
test('no se conserva destino si expira reporte o cambia serie autorizada',async t=>{
 env(t);const state=newState(); const realNow=Date.now; let now=realNow();
 Date.now=()=>now;t.after(()=>{Date.now=realNow;});
 const make=cfg=>({info:{serial:'TEST-C3'},async connect(){},async disconnect(){}});
 await state.report('1.1.1.1',{zkteco:true},null,make);
 assert.equal(state.effectiveHost(),'1.1.1.1');
 process.env.INFRA_C3_SERIAL='OTHER';
 assert.equal(state.effectiveHost(),undefined);
 process.env.INFRA_C3_SERIAL='TEST-C3';
 now+=12*60*1000+1;
 assert.equal(state.effectiveHost(),undefined);
});
test('un reporte nuevo durante verificación no activa la IP anterior',async t=>{
 env(t);const state=newState();let finish;const calls=[];
 const make=cfg=>({info:{serial:'TEST-C3'},async connect(){calls.push(cfg.host);if(cfg.host==='1.1.1.1')await new Promise(resolve=>{finish=resolve;});},async disconnect(){}});
 const a=state.report('1.1.1.1',{zkteco:true},null,make);
 const b=state.report('9.9.9.9',{zkteco:true},null,make);
 assert.equal(state.effectiveHost(),undefined);
 finish();await Promise.all([a,b]);
 assert.deepEqual(calls,['1.1.1.1','9.9.9.9']);
 assert.equal(state.effectiveHost(),'9.9.9.9');
});
