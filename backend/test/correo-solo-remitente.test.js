'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseMessage}=require('../src/services/correo-bancario-mail.service');
const banco=require('../src/services/banco-correo.service');
const diagnostico=require('../src/services/banco-diagnostico.service');
const cfg={PAGOS_BANK_FORWARD_FROM_ADDRESS:'admin@correo.example',PAGOS_BANK_FROM_ADDRESS:'avisos@banco.example',PAGOS_DESTINO_ULTIMOS4:'1234'};
const body='Enviado: sábado, 24 de octubre de 2026\nRecibiste de otro banco\n$20\n26/Oct/2026, 18:42:09\nA tu cuenta\n***234\nConcepto\nJardines 8\nReferencia\n8123456';
function mensaje(from='admin@correo.example',content=body,extra=[]){
 return parseMessage({uid:7,source:Buffer.from(['From: '+from,'Subject: RV: Notificación Banco Azteca','Date: '+new Date().toUTCString(),'Message-ID: <synthetic@example.test>',...extra,'Content-Type: text/plain; charset=UTF-8','',content].join('\r\n'))});
}
const pago=()=>({textoOcr:'Referencia\n08123456',fechaOperacion:'2026-10-23',horaOperacion:'18:41:00',monto:20,casa:{calle:'Jardines',numero:'8'}});
test('From exacto se admite sin firma ni Authentication-Results; fallos explícitos se ignoran',()=>{
 for(const headers of [[],['Authentication-Results: receptor.example; dkim=fail; dmarc=fail']]){
  const a=banco.datosAviso(mensaje('Admin <admin@correo.example>',body,headers),cfg);
  assert.equal(a.autorizado,true);assert.equal(a.origenVerificado,'ADMINISTRADOR');
 }
});
test('comparación exacta normaliza mayúsculas y espacios de configuración',()=>{
 assert.equal(banco.datosAviso(mensaje('ADMIN@CORREO.EXAMPLE'),{...cfg,PAGOS_BANK_FORWARD_FROM_ADDRESS:' admin@correo.example '}).autorizado,true);
});
test('ni banco directo, otro usuario o cuerpo/Resent-From con admin autorizan',()=>{
 for(const from of ['avisos@banco.example','otro@correo.example','admin@correo.example.evil.test']){
  assert.equal(banco.datosAviso(mensaje(from,'De: admin@correo.example\n'+body,['Resent-From: admin@correo.example','Authentication-Results: mx.example; dkim=pass; dmarc=pass header.from=correo.example']),cfg).autorizado,false);
 }
 assert.equal(banco.datosAviso(mensaje(),{...cfg,PAGOS_BANK_FORWARD_FROM_ADDRESS:''}).autorizado,false);
});
test('el asunto bancario sigue siendo obligatorio',()=>{
 const m=mensaje();m.subject='Otro asunto';assert.equal(banco.datosAviso(m,cfg).autorizado,false);
});
test('worker se configura sin auth server ni banco directo, exige administrador y flag',()=>{
 const env={PAGOS_BANK_AUTO_VALIDATE:'true',PAGOS_IMAP_HOST:'mx.example',PAGOS_IMAP_MAILBOX:'buzon@example.test',PAGOS_IMAP_PASSWORD:'synthetic',PAGOS_DESTINO_ULTIMOS4:'1234',PAGOS_BANK_FORWARD_FROM_ADDRESS:'admin@correo.example'};
 assert.equal(banco.configurado(env),true);
 assert.equal(banco.configurado({...env,PAGOS_BANK_FORWARD_FROM_ADDRESS:''}),false);
 assert.equal(banco.configurado({...env,PAGOS_BANK_AUTO_VALIDATE:'false'}),false);
});
test('concilia referencia sin cero inicial y fecha bancaria, no fecha del reenvío',()=>{
 const a=banco.datosAviso(mensaje(),cfg);assert.equal(a.fecha,'2026-10-26');
 assert.equal(banco.corresponde(pago(),a,cfg),true);
 for(const changes of [{monto:21},{referencia:'8123457'},{fecha:'2026-10-28'},{cuenta:'999'},{reciente:false}])assert.equal(banco.corresponde(pago(),{...a,...changes},cfg),false);
});
test('fecha ausente o contradictoria no cae en Enviado, duplicado texto/HTML conserva fecha',()=>{
 for(const b of [body.replace('26/Oct/2026, 18:42:09',''),body+'\n'+body.replace('26/Oct/2026','27/Oct/2026')])assert.equal(banco.datosAviso(mensaje('admin@correo.example',b),cfg).fecha,'');
 assert.equal(banco.datosAviso(mensaje('admin@correo.example',body+'\n'+body),cfg).fecha,'2026-10-26');
});
test('diagnóstico conserva bloqueo por coincidencia múltiple y no anuncia autenticación',()=>{
 const old=process.env.PAGOS_DESTINO_ULTIMOS4;process.env.PAGOS_DESTINO_ULTIMOS4='1234';
 try{
  const a=banco.datosAviso(mensaje(),cfg);
  const d=diagnostico.evaluar(pago(),[a],[a]);assert.equal(d.etapa,'COINCIDENCIA_VERIFICADA');assert.doesNotMatch(d.detalle,/autenticad/i);
  assert.equal(diagnostico.evaluar(pago(),[a,{...a,id:'otro'}],[a,{...a,id:'otro'}]).etapa,'COINCIDENCIA_AMBIGUA');
 }finally{if(old===undefined)delete process.env.PAGOS_DESTINO_ULTIMOS4;else process.env.PAGOS_DESTINO_ULTIMOS4=old}
});
