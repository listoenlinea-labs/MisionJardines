'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const banco=require('../src/services/banco-correo.service');
const config={PAGOS_BANK_FROM_ADDRESS:'avisos@banco.example',PAGOS_BANK_FORWARD_FROM_ADDRESS:'admin@correo.example',
 PAGOS_BANK_MAIL_SUBJECT:'Notificación Banco Azteca',PAGOS_DESTINO_ULTIMOS4:'1234',PAGOS_BANK_MAIL_MAX_DIAS:'7'};
const text=account=>'Recibiste de otro banco $300 22/Oct/2026 A tu cuenta '+account+'\nConcepto: Calle Prueba 1\nClave de rastreo: PRUEBA000000000000001';
function message(extra={}){
 return {id:'mensaje-sintetico',receivedDateTime:new Date().toISOString(),subject:'RV: Notificación Banco Azteca',
  from:{emailAddress:{address:'admin@correo.example'}},
  internetMessageHeaders:[{name:'Authentication-Results',value:'receptor.example; dkim=pass header.d=correo.example; dmarc=pass header.from=correo.example'}],
  body:{content:text('***234')},...extra};
}
const pago={id:1,estatus:'PENDIENTE_VALIDACION',folioOperacion:'PRUEBA000000000000001',fechaOperacion:'2026-10-22',monto:300,casa:{calle:'Calle Prueba',numero:'1'}};
const aviso=(extra,cfg=config)=>banco.datosAviso(message(extra),cfg);
test('reenvío del administrador autorizado se autentica con su propio dominio y concilia tres dígitos',()=>{
 const n=aviso();assert.equal(n.autorizado,true);assert.equal(n.origenVerificado,'ADMINISTRADOR');assert.equal(n.cuenta,'234');
 assert.equal(banco.corresponde(pago,n,config),true);
 assert.equal(aviso({}, {...config,PAGOS_BANK_FORWARD_FROM_ADDRESS:' ADMIN@CORREO.EXAMPLE '}).autorizado,true);
});
test('sin administrador configurado conserva el rechazo anterior; otra cuenta del mismo dominio tampoco pasa',()=>{
 assert.equal(aviso({}, {...config,PAGOS_BANK_FORWARD_FROM_ADDRESS:''}).autorizado,false);
 assert.equal(aviso({from:{emailAddress:{address:'otro@correo.example'}}}).autorizado,false);
 assert.equal(aviso({from:{emailAddress:{address:'admin@correo.example.atacante.test'}}}).autorizado,false);
});
test('el remitente visible no basta: requiere autenticación del dominio autorizado',()=>{
 for(const auth of ['', 'dkim=fail dmarc=pass header.from=correo.example', 'dkim=pass dmarc=fail header.from=correo.example',
  'dkim=pass dmarc=pass header.from=otro.example','dkim=pass dmarc=pass header.from=correo.example.atacante.test']){
  assert.equal(aviso({internetMessageHeaders:[{name:'Authentication-Results',value:auth}]}).autorizado,false,auth);
 }
});
test('un texto de reenvío en el cuerpo no autoriza a un remitente diferente',()=>{
 const n=aviso({from:{emailAddress:{address:'ajeno@otro.example'}},body:{content:'De: admin@correo.example\nDe: avisos@banco.example\n'+text('***234')}});
 assert.equal(n.autorizado,false);assert.equal(banco.corresponde(pago,n,config),false);
});
test('los avisos directos del banco siguen aceptándose sin depender del administrador',()=>{
 const n=aviso({from:{emailAddress:{address:'avisos@banco.example'}},
  internetMessageHeaders:[{name:'Authentication-Results',value:'dkim=pass dmarc=pass header.from=banco.example'}],body:{content:text('****1234')}});
 assert.equal(n.origenVerificado,'BANCO');assert.equal(banco.corresponde(pago,n,config),true);
});
test('tres dígitos deben coincidir; cuatro se comparan completos; dos, cinco y cuentas ambiguas se rechazan',()=>{
 for(const [mask,ok] of [['***234',true],['****1234',true],['***999',false],['****9234',false],['**34',false],['****01234',false]]){
  assert.equal(banco.corresponde(pago,aviso({body:{content:text(mask)}}),config),ok,mask);
 }
 assert.equal(banco.corresponde(pago,aviso({body:{content:text('***234')+'\nA tu cuenta ***999'}}),config),false);
});
test('siguen siendo obligatorios rastreo, importe, fecha, casa y antigüedad del aviso',()=>{
 const n=aviso();
 for(const changed of [{folioOperacion:'OTRO'}, {monto:300.01}, {fechaOperacion:'2026-10-21'}, {casa:{calle:'Calle Prueba',numero:'2'}}])
  assert.equal(banco.corresponde({...pago,...changed},n,config),false);
 assert.equal(banco.corresponde(pago,aviso({receivedDateTime:new Date(Date.now()-8*86400000).toISOString()}),config),false);
 assert.equal(aviso({subject:'Mensaje personal'}).autorizado,false);
});
test('la configuración admite solo administrador o solo banco, siempre con IMAP y flag habilitado',()=>{
 const env={PAGOS_IMAP_HOST:'imap.example',PAGOS_IMAP_MAILBOX:'buzon@example.test',PAGOS_IMAP_PASSWORD:'sintetica',PAGOS_IMAP_AUTH_SERVER:'receptor.example',
  PAGOS_BANK_FORWARD_FROM_ADDRESS:config.PAGOS_BANK_FORWARD_FROM_ADDRESS,PAGOS_DESTINO_ULTIMOS4:'1234',PAGOS_BANK_AUTO_VALIDATE:'true'};
 assert.equal(banco.configurado(env),true);
 assert.equal(banco.configurado({...env,PAGOS_BANK_FORWARD_FROM_ADDRESS:''}),false);
 assert.equal(banco.configurado({...env,PAGOS_BANK_AUTO_VALIDATE:'false'}),false);
 assert.equal(banco.configurado({...env,PAGOS_IMAP_AUTH_SERVER:''}),false);
});
test('el lector usa Authentication-Results del receptor configurado para el reenvío',()=>{
 const previous=process.env.PAGOS_IMAP_AUTH_SERVER;
 try{
  process.env.PAGOS_IMAP_AUTH_SERVER='receptor.example';
  const {parseMessage}=require('../src/services/correo-bancario-mail.service');
  const raw=['From: Administrador <admin@correo.example>','Subject: RV: Notificacion Banco Azteca',
   'Date: '+new Date().toUTCString(),'Message-ID: <prueba@example.test>',
   'Authentication-Results: receptor.example; dkim=pass header.d=correo.example; dmarc=pass header.from=correo.example',
   'Content-Type: text/plain; charset=utf-8','','De: Avisos <avisos@banco.example>',text('***234')].join('\r\n');
  const parsed=parseMessage({uid:1,source:Buffer.from(raw)});
  assert.equal(banco.corresponde(pago,banco.datosAviso(parsed,config),config),true);
  const forged=parseMessage({uid:2,source:Buffer.from(raw.replace('Authentication-Results: receptor.example;','Authentication-Results: externo.example;'))});
  assert.equal(banco.datosAviso(forged,config).autorizado,false);
 }finally{if(previous===undefined)delete process.env.PAGOS_IMAP_AUTH_SERVER;else process.env.PAGOS_IMAP_AUTH_SERVER=previous;}
});
async function workerRun(notices,{used=false}={}){
 const calls=[],module={exports:{}};
 const modules={
  '../models':{Casa:{},PagoReportado:{findAll:async()=>[pago],findOne:async()=>used?{id:2}:null}},
  './banco-correo.service':{...banco,configurado:()=>true,obtenerAvisos:async()=>notices,corresponde:(p,n)=>banco.corresponde(p,n,config)},
  '../controllers/pagos.controller':{confirmarPagoDesdeBanco:async(id,hash)=>calls.push({id,hash})}
 };
 vm.runInNewContext(fs.readFileSync(__dirname+'/../src/services/banco-correo-worker.service.js','utf8'),
  {module,require:name=>{assert.ok(Object.hasOwn(modules,name));return modules[name];},process:{env:{}},console:{info(){},error(){},warn(){}},setImmediate,setInterval});
 await module.exports.ejecutarRevision();return calls;
}
test('worker concilia el reenvío único y conserva hash y bloqueo de correos usados o ambiguos',async()=>{
 const calls=await workerRun([aviso()]);assert.equal(calls.length,1);assert.equal(calls[0].id,1);assert.match(calls[0].hash,/^[a-f0-9]{64}$/);
 assert.equal((await workerRun([aviso()],{used:true})).length,0);
 assert.equal((await workerRun([aviso(),aviso({id:'duplicado'})])).length,0);
 assert.equal((await workerRun([aviso({from:{emailAddress:{address:'otro@correo.example'}}})])).length,0);
});
