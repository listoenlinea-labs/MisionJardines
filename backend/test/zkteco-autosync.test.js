const test=require('node:test');
const assert=require('node:assert/strict');
Object.assign(process.env,{DB_HOST:'localhost',DB_PORT:'3306',DB_NAME:'test',DB_USER:'test',DB_PASSWORD:'unused',ZKTECO_DIRECT_HOST:'localhost'});
const direct=require('../src/services/zkteco-direct.service');
const autosync=require('../src/services/zkteco-autosync.service');
const ZkTarjeta=require('../src/models/ZkTarjeta');
const Casa=require('../src/models/Casa');
const {C3Client}=require('../src/services/zkteco-c3-client.service');

test('automatic/manual refresh coalesce into one controller read',async t=>{
 let reads=0,finish;
 t.mock.method(direct,'syncUsers',()=>{reads++;return new Promise(resolve=>finish=resolve);});
 const first=autosync.runAutoSync();
 const second=autosync.runAutoSync();
 assert.equal(reads,1);
 finish({totalPanel:7,procesados:7});
 const [a,b]=await Promise.all([first,second]);
 assert.deepEqual(a,b);assert.equal(reads,1);
 assert.equal(autosync.getZktecoAutoSyncStatus().lastError,null);
});
test('network failure keeps failure status and the next cycle recovers',async t=>{
 let calls=0;
 t.mock.method(direct,'syncUsers',async()=>{
  calls++;if(calls===1)throw Error('C3 sin conexión');
  return {totalPanel:2};
 });
 await assert.rejects(autosync.runAutoSync(),/sin conexión/);
 assert.match(autosync.getZktecoAutoSyncStatus().lastError,/C3 sin conexión/);
 const ok=await autosync.runAutoSync();
 assert.equal(ok.totalPanel,2);
 assert.equal(autosync.getZktecoAutoSyncStatus().lastError,null);
});
test('una lectura cero sospechosa no declara inexistentes los TAGs que antes estaban en C3',async t=>{
 const existing={numeroTarjeta:'00512345',enControlador:true};
 let modified=false;
 t.mock.method(C3Client.prototype,'connect',async()=>{});
 t.mock.method(C3Client.prototype,'disconnect',async()=>{});
 t.mock.method(C3Client.prototype,'getData',async()=>[]);
 t.mock.method(Casa,'findAll',async()=>[]);
 t.mock.method(ZkTarjeta,'findAll',async()=>[existing]);
 t.mock.method(ZkTarjeta,'update',async()=>{modified=true});
 await assert.rejects(direct.syncUsers(),/lectura no devolvió tarjetas identificables/);
 assert.equal(modified,false);
 assert.equal(existing.enControlador,true);
});

test('Una lectura TCP transitoria se reintenta una sola vez y recupera la sincronización',async t=>{
  let calls=0;
  t.mock.method(direct,'syncUsers',async()=>{
    calls++;
    if(calls===1)throw Object.assign(new Error('read ECONNRESET'),{code:'ECONNRESET'});
    return {totalPanel:3,procesados:3};
  });
  const result=await autosync.runAutoSync();
  assert.equal(result.totalPanel,3);
  assert.equal(calls,2);
  const health=autosync.getZktecoAutoSyncStatus();
  assert.equal(health.lastAttempts,2);
  assert.equal(health.consecutiveFailures,0);
  assert.equal(health.lastError,null);
  assert.ok(health.lastSuccessAt);
});

test('Una contraseña inválida no genera bucles de reintentos',async t=>{
  let calls=0;
  t.mock.method(direct,'syncUsers',async()=>{
    calls++;
    throw new Error('Contraseña de comunicación ZKTeco incorrecta');
  });
  await assert.rejects(autosync.runAutoSync(),/Contraseña/);
  assert.equal(calls,1);
  assert.equal(autosync.getZktecoAutoSyncStatus().lastAttempts,1);
  assert.equal(autosync.esFalloTransitorio({message:'Contraseña de comunicación ZKTeco incorrecta'}),false);
  assert.equal(autosync.esFalloTransitorio({code:'ETIMEDOUT',message:'connect ETIMEDOUT'}),true);
});

test('Una conexión que falla en handshake cierra el socket parcial',async t=>{
  const {withC3}=require('../src/services/zkteco-c3-client.service');
  let destroyed=0,disconnected=0;
  t.mock.method(C3Client.prototype,'connect',async function(){
    this.socket={destroy(){destroyed++;}};
    throw Error('El ZKTeco no respondió a tiempo');
  });
  t.mock.method(C3Client.prototype,'disconnect',async()=>{disconnected++;});
  await assert.rejects(withC3(async()=>{}),/no respondió/);
  assert.equal(destroyed,1);
  assert.equal(disconnected,0);
});
