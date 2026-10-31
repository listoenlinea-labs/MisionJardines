'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {diagnosticarConexion,recomendacion,errorSeguro}=require('../src/services/zkteco-diagnostico-conexion.service');
const config={host:'diagnostic.example.test',port:44370,timeoutMs:7000};
const tcpOk=async()=>{};

function fakeClient({users=[{CardNo:'123'},{CardNo:'456'}],connectError=null,readError=null}={}){
  const actions=[];
  const client={
    info:{serial:'C3-SIM'},
    async connect(){actions.push('connect');if(connectError)throw connectError;},
    async getData(table){actions.push('getData:'+table);if(readError)throw readError;return users;},
    async disconnect(){actions.push('disconnect');}
  };
  return {client,actions};
}

test('No se efectúan escrituras y se diferencian TCP, protocolo e inventario',async()=>{
  const fixture=fakeClient();
  const result=await diagnosticarConexion({config,probarTcp:tcpOk,crearCliente:()=>fixture.client});
  assert.equal(result.estado,'CONECTADO');
  assert.deepEqual(result.pruebas.map(p=>p.etapa),['TCP','PROTOCOLO','INVENTARIO']);
  assert.ok(result.pruebas.every(p=>p.ok));
  assert.deepEqual(fixture.actions,['connect','getData:user','disconnect']);
  assert.equal(result.configuracion.hostConfigurado,true);
  assert.ok(!JSON.stringify(result).includes('diagnostic.example.test'),'No publicar IP o host del controlador');
});

test('Puerto sin respuesta da recomendación de IP/DDNS y redirección TCP',async()=>{
  const error=Object.assign(new Error('connect ETIMEDOUT diagnostic.example.test:44370'),{code:'ETIMEDOUT'});
  const result=await diagnosticarConexion({config,probarTcp:async()=>{throw error;}});
  assert.equal(result.estado,'SIN_CONEXION_TCP');
  assert.equal(result.pruebas[0].codigo,'ETIMEDOUT');
  assert.ok(result.recomendacion.includes('DDNS'));
  assert.ok(!JSON.stringify(result).includes('diagnostic.example.test'));
});

test('Contraseña de comunicación incorrecta se distingue de puerto TCP abierto',async()=>{
  const fixture=fakeClient({connectError:new Error('Contraseña de comunicación ZKTeco incorrecta')});
  const result=await diagnosticarConexion({config,probarTcp:tcpOk,crearCliente:()=>fixture.client});
  assert.equal(result.estado,'ERROR_PROTOCOLO');
  assert.match(result.recomendacion,/ZKTECO_COMM_PASSWORD/);
  assert.deepEqual(fixture.actions,['connect','disconnect']);
});

test('Conexión exitosa con lectura user fallida reporta inventario, sin activar TAGs',async()=>{
  const fixture=fakeClient({readError:new Error('El C3 no respondió a tiempo')});
  const result=await diagnosticarConexion({config,probarTcp:tcpOk,crearCliente:()=>fixture.client});
  assert.equal(result.estado,'ERROR_INVENTARIO');
  assert.equal(result.pruebas[2].etapa,'INVENTARIO');
  assert.deepEqual(fixture.actions,['connect','getData:user','disconnect']);
});

test('Lectura vacía no marca TAGs borrados ni anuncia inventario confirmado',async()=>{
  const fixture=fakeClient({users:[]});
  const result=await diagnosticarConexion({config,probarTcp:tcpOk,crearCliente:()=>fixture.client});
  assert.equal(result.estado,'LECTURA_VACIA');
  assert.equal(result.pruebas[2].ok,false);
});

test('Configuración incompleta no abre conexiones',async()=>{
  const result=await diagnosticarConexion({config:{host:'',port:44370},probarTcp:()=>{throw Error('No debe intentar TCP');}});
  assert.equal(result.estado,'CONFIGURACION_INVALIDA');
  assert.match(result.recomendacion,/ZKTECO_DIRECT_HOST/);
});

test('Errores DNS, refused y sin ruta tienen indicaciones distintas',()=>{
  assert.match(recomendacion('TCP',{code:'ENOTFOUND'}),/DDNS/);
  assert.match(recomendacion('TCP',{code:'ECONNREFUSED'}),/rechazó/);
  assert.match(recomendacion('TCP',{code:'ENETUNREACH'}),/ruta/);
  assert.equal(errorSeguro(new Error('Error diagnostic.example.test'),config.host).detalle,'Error [destino configurado]');
});
