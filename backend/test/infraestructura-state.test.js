const test=require('node:test');
const assert=require('node:assert/strict');
const state=require('../src/services/infraestructura-state.service');
test('rechaza IP privadas, CGNAT, multicast y direcciones no IPv4',()=>{
 for(const ip of ['127.0.0.1','10.1.1.1','192.168.1.201','169.254.169.254','100.64.1.1','172.16.1.1','224.1.1.1','255.255.255.255','::1','example.org','203.0.113.1'])assert.equal(state.publicIP(ip),false,ip);
 assert.equal(state.publicIP('8.8.8.8'),true);
});
test('modo de respaldo opt-in, sin reporte conserva destino principal y no admite órdenes',()=>{
 const before=process.env.INFRA_DYNAMIC_ZKTECO; const oldHost=process.env.ZKTECO_DIRECT_HOST;
 try{process.env.ZKTECO_DIRECT_HOST='example.org';process.env.INFRA_DYNAMIC_ZKTECO='false';assert.equal(state.effectiveHost(),'example.org');
 process.env.INFRA_DYNAMIC_ZKTECO='true';assert.equal(state.effectiveHost(),'example.org');assert.ok(state.queue('TODOS',1).error);}
 finally{if(before===undefined)delete process.env.INFRA_DYNAMIC_ZKTECO;else process.env.INFRA_DYNAMIC_ZKTECO=before;if(oldHost===undefined)delete process.env.ZKTECO_DIRECT_HOST;else process.env.ZKTECO_DIRECT_HOST=oldHost;}
});

test('principal gana; solo usa IP alternativa verificada cuando falla principal; retorna al principal',async()=>{
 const previous={...process.env};
 let calls=[]; let primaryOK=true, backupOK=true;
 process.env.ZKTECO_DIRECT_HOST='8.8.8.8';
 process.env.INFRA_DYNAMIC_ZKTECO='true';
 process.env.INFRA_C3_SERIAL='TEST-C3';
 const createClient=cfg=>({info:{serial:'TEST-C3'},async connect(){calls.push(cfg.host);if(cfg.host==='8.8.8.8'?!primaryOK:!backupOK)throw Error('unavailable');},async disconnect(){}});
 const e={zkteco:true};
 try {
  await state.report('1.1.1.1',e,null,createClient);
  assert.deepEqual(calls,['8.8.8.8']);
  assert.equal(state.effectiveHost(),'8.8.8.8');
  primaryOK=false;calls=[];
  const job=state.queue('ZKTECO',1).orden;
  await state.report('1.1.1.1',e,null,createClient);
  assert.deepEqual(calls,['8.8.8.8','1.1.1.1']);
  assert.equal(state.effectiveHost(),'1.1.1.1');
  assert.equal(state.status().modoConexion,'RECUPERACION');
  await state.report('1.1.1.1',e,{id:job.id,ok:true},createClient);
  primaryOK=true;calls=[];
  state.queue('DIAGNOSTICO',1);
  await state.report('1.1.1.1',e,null,createClient);
  assert.deepEqual(calls,['8.8.8.8']);
  assert.equal(state.effectiveHost(),'8.8.8.8');
  assert.equal(state.status().modoConexion,'PRINCIPAL');
  primaryOK=false;backupOK=false;
  await state.report('9.9.9.9',e,null,createClient);
  assert.equal(state.effectiveHost(),'8.8.8.8');
 }finally{for(const k of ['ZKTECO_DIRECT_HOST','INFRA_DYNAMIC_ZKTECO','INFRA_C3_SERIAL']){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];}}
});
