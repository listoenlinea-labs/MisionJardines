'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {parseMessage}=require('../src/services/correo-bancario-mail.service');
const {datosAviso,corresponde}=require('../src/services/banco-correo.service');
const config={PAGOS_BANK_FROM_ADDRESS:'avisos@banco.example',PAGOS_BANK_FORWARD_FROM_ADDRESS:'admin@correo.example',PAGOS_DESTINO_ULTIMOS4:'1234'};
const body='Enviado: sábado, 24 de octubre de 2026\nRecibiste de otro banco\n$20\n26/Oct/2026, 18:42:09\nA tu cuenta\n***234\nConcepto\nJardines 8\nReferencia\n8123456';
const auth=(host,results='dkim=pass header.d=correo.example; dmarc=pass header.from=correo.example')=>'Authentication-Results: '+host+'; '+results;
function message(headers,content=body,html=false){
 return parseMessage({uid:1,source:Buffer.from(['From: admin@correo.example','Subject: RV: Notificación Banco Azteca','Date: '+new Date().toUTCString(),'Message-ID: <synthetic@example.test>',...headers,'Content-Type: text/'+(html?'html':'plain')+'; charset=UTF-8','',content].join('\r\n'))});
}
function withServers(value,fn){
 const old=process.env.PAGOS_IMAP_AUTH_SERVER;process.env.PAGOS_IMAP_AUTH_SERVER=value;
 try{return fn()}finally{if(old===undefined)delete process.env.PAGOS_IMAP_AUTH_SERVER;else process.env.PAGOS_IMAP_AUTH_SERVER=old}
}
test('acepta cada servidor exacto y conserva configuración de un solo servidor',()=>{
 for(const server of ['mx1.example.test','mx2.example.test'])withServers(' mx1.example.test, MX2.EXAMPLE.TEST ',()=>assert.equal(datosAviso(message([auth(server)]),config).autorizado,true));
 withServers('mx1.example.test',()=>assert.equal(datosAviso(message([auth('mx1.example.test')]),config).autorizado,true));
});
test('no admite servidor ajeno, sufijos engañosos, comodines ni lista vacía',()=>{
 for(const servers of ['mx1.example.test','*.example.test',''])withServers(servers,()=>{
  for(const host of ['mx1.example.test.evil.test','mx3.example.test'])assert.equal(datosAviso(message([auth(host)]),config).autorizado,false);
 });
});
test('no combina resultados separados ni usa pass de servidor intermedio',()=>withServers('mx1.example.test,mx2.example.test',()=>{
 const msg=message([auth('mx1.example.test','dkim=pass; dmarc=fail header.from=correo.example'),auth('mx2.example.test','dkim=fail; dmarc=pass header.from=correo.example'),auth('intermedio.example.test')]);
 assert.equal(datosAviso(msg,config).autorizado,false);
 assert.equal(datosAviso(message([auth('mx1.example.test','dkim=fail; dmarc=fail header.from=correo.example'),auth('mx2.example.test')]),config).autorizado,true);
}));
test('mantiene banco OR administrador, no otro usuario del dominio',()=>withServers('mx1.example.test',()=>{
 const msg=message([auth('mx1.example.test')]);msg.from.emailAddress.address='otro@correo.example';assert.equal(datosAviso(msg,config).autorizado,false);
 msg.from.emailAddress.address='avisos@banco.example';msg.internetMessageHeaders=[{name:'Authentication-Results',value:'mx1.example.test; dkim=pass header.d=banco.example; dmarc=pass header.from=banco.example'}];
 assert.equal(datosAviso(msg,config).autorizado,true);
}));
test('fecha del depósito tiene prioridad sobre Enviado, en texto y HTML; concilia con OCR',()=>withServers('mx1.example.test',()=>{
 for(const html of [false,true]){
  const content=html?body.split('\n').map(l=>'<div>'+l+'</div>').join(''):body;
  const a=datosAviso(message([auth('mx1.example.test')],content,html),config);
  assert.equal(a.fecha,'2026-10-26');assert.equal(a.monto,20);
  assert.equal(corresponde({textoOcr:'Referencia\n08123456',fechaOperacion:'2026-10-23',horaOperacion:'18:41:00',monto:20,casa:{calle:'Jardines',numero:'8'}},a,config),true);
 }
}));
test('fecha ausente, inválida o contradictoria nunca usa fecha de reenvío',()=>withServers('mx1.example.test',()=>{
 for(const content of [body.replace('26/Oct/2026, 18:42:09',''),body.replace('26/Oct/2026','31/Feb/2026'),body+'\n'+body.replace('26/Oct/2026','27/Oct/2026'),body.replace('Recibiste de otro banco','Sin bloque bancario')])assert.equal(datosAviso(message([auth('mx1.example.test')],content),config).fecha,'');
 assert.equal(datosAviso(message([auth('mx1.example.test')],body+'\n'+body),config).fecha,'2026-10-26');
}));
