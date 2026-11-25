const test=require('node:test');
const assert=require('node:assert/strict');
const state=require('../src/services/infraestructura-state.service');
test('rechaza IP privadas, CGNAT, multicast y direcciones no IPv4',()=>{
 for(const ip of ['127.0.0.1','10.1.1.1','192.168.1.201','169.254.169.254','100.64.1.1','172.16.1.1','224.1.1.1','255.255.255.255','::1','example.org','203.0.113.1'])assert.equal(state.publicIP(ip),false,ip);
 assert.equal(state.publicIP('8.8.8.8'),true);
});
test('modo dinámico opt-in, sin reporte no hay destino ni órdenes',()=>{
 const before=process.env.INFRA_DYNAMIC_ZKTECO; const oldHost=process.env.ZKTECO_DIRECT_HOST;
 try{process.env.ZKTECO_DIRECT_HOST='example.org';process.env.INFRA_DYNAMIC_ZKTECO='false';assert.equal(state.effectiveHost(),'example.org');
 process.env.INFRA_DYNAMIC_ZKTECO='true';assert.equal(state.effectiveHost(),undefined);assert.ok(state.queue('TODOS',1).error);}
 finally{if(before===undefined)delete process.env.INFRA_DYNAMIC_ZKTECO;else process.env.INFRA_DYNAMIC_ZKTECO=before;if(oldHost===undefined)delete process.env.ZKTECO_DIRECT_HOST;else process.env.ZKTECO_DIRECT_HOST=oldHost;}
});
