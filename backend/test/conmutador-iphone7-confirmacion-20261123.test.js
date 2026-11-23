'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const read=name=>fs.readFileSync(path.join(root,name),'utf8');
const UUID='12345678-1234-1234-1234-123456789abc';

// Sin Hostinger, red ni datos de residentes; el tiempo se simula para
// que una confirmación tardía pueda probarse sin esperar 30 segundos.
function setup(states,options={}){
 let now=0,postCount=0,readCount=0,position=0;
 const messages=[],requests=[];
 const FakeDate=class extends Date {static now(){return now;}};
 const FakeAbort=class{
  constructor(){this.signal={aborted:false};}
  abort(){this.signal.aborted=true;}
 };
 const timers={
  setTimeout(fn,ms){
   if(ms<=2000){now+=ms;Promise.resolve().then(fn);}
   return 1;
  },
  clearTimeout(){}
 };
 const window={};
 vm.runInNewContext(read('docs/assets/js/conmutador-caseta.js'),{
  window,AbortController:FakeAbort,Date:FakeDate,URLSearchParams,
  setTimeout:timers.setTimeout,clearTimeout:timers.clearTimeout
 });
 const api=async(path,opts={})=>{
  requests.push({path,method:opts.method||'GET'});
  if(path==='/conmutador/caseta/llamadas' && opts.method==='POST'){
   postCount++;
   if(options.postError)throw options.postError;
   if(options.postPromise)return options.postPromise;
   return {solicitud:UUID};
  }
  if(path.includes('/conmutador/caseta/llamadas/')){
   readCount++;
   if(options.jumpClockOnPoll===readCount)now+=45000;
   const state=states[Math.min(position++,states.length-1)];
   if(state instanceof Error)throw state;
   return {estado:state};
  }
  if(path.includes('/modo'))return {habilitado:true};
  if(path.includes('/contactos'))return {contactos:['A']};
  throw Error('Ruta imprevista: '+path);
 };
 const client=window.crearConmutadorCaseta({
  api,mostrarEstado:(message,kind)=>messages.push({message,kind})
 });
 return {
  client,messages,requests,
  get postCount(){return postCount;},
  get readCount(){return readCount;},
  async call(){return client.llamar({grupo:'Gardenias',numero:'5'},'A');}
 };
}

test('iPhone lento: espera más de 10 s y acepta confirmación de caseta sin duplicar llamada',async()=>{
 const mock=setup([...Array(12).fill('PENDIENTE'),'ENVIADA']);
 const result=await mock.call();
 assert.equal(result.ok,true);
 assert.equal(result.estado,'ENVIADA');
 assert.ok(mock.readCount>=13);
 assert.equal(mock.postCount,1);
 assert.match(mock.messages[mock.messages.length-1].message,/Contesta el teléfono fijo/);
});

test('Pérdida temporal de red al consultar recupera estado sin reenviar solicitud',async()=>{
 const mock=setup(['PENDIENTE',new TypeError('Network unavailable'),'ENVIADA']);
 const result=await mock.call();
 assert.equal(result.ok,true);
 assert.equal(mock.postCount,1);
 assert.ok(mock.messages.some(m=>/Intentando recuperar la confirmación/.test(m.message)));
});

test('Central y agente reportan errores distinguibles',async()=>{
 const pendiente=setup(['PENDIENTE','VENCIDA']);
 assert.equal((await pendiente.call()).ok,false);
 assert.match(pendiente.messages[pendiente.messages.length-1].message,/computadora de caseta no la recogió/);
 const agente=setup(['RECLAMADA','VENCIDA']);
 assert.equal((await agente.call()).ok,false);
 assert.match(agente.messages[agente.messages.length-1].message,/Revisa el agente de caseta y Asterisk/);
 const error=setup(['ERROR']);
 assert.equal((await error.call()).ok,false);
 assert.match(error.messages[error.messages.length-1].message,/reportó un error/);
});

test('POST con resultado de red incierto no se reintenta automáticamente',async()=>{
 const mock=setup([],{postError:new TypeError('Network connection lost')});
 const result=await mock.call();
 assert.equal(result.ok,false);
 assert.equal(mock.postCount,1);
 assert.equal(mock.readCount,0);
 assert.match(result.error,/Podría estar en curso/);
});

test('Al volver Safari del fondo realiza una consulta final antes de reportar fallo',async()=>{
 const mock=setup(['PENDIENTE','FINALIZADA'],{jumpClockOnPoll:1});
 const result=await mock.call();
 assert.equal(result.ok,true);
 assert.equal(result.estado,'FINALIZADA');
 assert.equal(mock.postCount,1);
 assert.equal(mock.readCount,2);
});

test('Mientras una orden está pendiente no permite enviar una segunda',async()=>{
 let resolvePost;
 const pending=new Promise(resolve=>{resolvePost=resolve;});
 const mock=setup(['ENVIADA'],{postPromise:pending});
 const first=mock.call();
 const second=await mock.call();
 assert.equal(second.ok,false);
 assert.equal(mock.postCount,1);
 resolvePost({solicitud:UUID});
 const result=await first;
 assert.equal(result.ok,true);
});

test('Modal de llamada visible, accesible y actualizado con el mismo estado de caseta',()=>{
 const html=read('docs/conmutador.html'),js=read('docs/assets/js/conmutador.js');
 for(const id of ['callProgressModal','callProgressTitle','callProgressDescription','callProgressClose'])
  assert.match(html,new RegExp('id="'+id+'"'));
 assert.match(html,/aria-modal="true"/);
 assert.match(html,/aria-live="polite"/);
 assert.match(html,/conmutador-caseta\.js\?v=20261123-iphone7-confirmacion-v1/);
 assert.match(js,/openCallModal\('Llamando… Buscando el contacto/);
 assert.match(js,/openCallModal\('Llamando… Preparando la comunicación/);
 assert.match(js,/if\(callModalVisible\)/);
 assert.match(js,/variant==='error'/);
 assert.match(js,/await caseta\.llamar\(domicilio, contactos\[0\]\)/);
 assert.match(js,/await caller\.call/);
});
