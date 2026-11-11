'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {Imap,MAX_IMAP_LITERAL_BYTES}=require('../src/services/correo-imap.transport');
const {leerBuzon,tamanoUid}=require('../src/services/correo-bancario-mail.service');

const paymentText='Recibiste de otro banco $300 11/Nov/2026 A tu cuenta ****4409\n'+
 'Clave de rastreo: MBAN01002610080082507654\nConcepto: Gardenias 5';
const msg=(name,pad='')=>Buffer.from([
 'From: Administración <admin@example.test>',
 'Subject: RV: Notificación Banco Azteca',
 'Date: Wed, 11 Nov 2026 11:20:00 -0600',
 'Message-ID: <'+name+'@example.test>',
 'Content-Type: text/plain; charset=utf-8',
 '',paymentText,pad
].join('\r\n'));

function fakeImap(t,{ids,sizes,contents,logs}){
 const calls=[];
 t.mock.method(Imap.prototype,'connect',async()=>{});
 t.mock.method(Imap.prototype,'close',()=>{});
 t.mock.method(Imap.prototype,'cmd',async (cmd,onLine)=>{
  calls.push(cmd);
  if(cmd.startsWith('UID SEARCH ')){
   onLine?.('* SEARCH '+ids.join(' '));return [];
  }
  if(/\(UID RFC822\.SIZE\)$/.test(cmd)){
   for(const id of ids){
    if(!Object.hasOwn(sizes,id))continue;
    // Verificar los dos órdenes de respuesta admitidos por RFC 3501.
    const line=Number(id)%2
      ? '* 3 FETCH (UID '+id+' RFC822.SIZE '+sizes[id]+')'
      : '* 4 FETCH (RFC822.SIZE '+sizes[id]+' UID '+id+')';
    onLine?.(line);
   }
   return [];
  }
  const fetch=cmd.match(/^UID FETCH (\d+) \(BODY\.PEEK\[\]\)$/);
  if(fetch)return contents[Number(fetch[1])]?[contents[Number(fetch[1])]]:[];
  return [];
 });
 t.mock.method(console,'warn',(...items)=>logs.push(items.join(' ')));
 return calls;
}

test('El tope pasa de 400 KB a 8 MiB; tamaños IMAP válidos en cualquier orden',()=>{
 assert.ok(MAX_IMAP_LITERAL_BYTES>400000);
 assert.equal(MAX_IMAP_LITERAL_BYTES,8*1024*1024);
 assert.deepEqual(tamanoUid('* 4 FETCH (UID 123 RFC822.SIZE 700234)'),{uid:123,bytes:700234});
 assert.deepEqual(tamanoUid('* 4 FETCH (RFC822.SIZE 700234 UID 123)'),{uid:123,bytes:700234});
 assert.equal(tamanoUid('* 4 EXISTS'),null);
 assert.equal(tamanoUid('* 4 FETCH (UID 123)'),null);
});

test('Un mensaje realista de 600 KB ya no impide leer el aviso bancario',async t=>{
 const large=msg('large','X'.repeat(610000)),small=msg('small');
 const calls=fakeImap(t,{ids:[30,31],sizes:{30:small.length,31:large.length},
   contents:{30:small,31:large},logs:[]});
 const result=await leerBuzon({mailbox:'buzon@example.test',password:'only-in-test'});
 assert.equal(result.length,2);
 assert.match(result[0].body.content,/MBAN01002610080082507654/);
 assert.ok(calls.some(c=>c==='UID FETCH 31 (BODY.PEEK[])'));
 assert.ok(calls.some(c=>c.includes('(UID RFC822.SIZE)')));
 assert.ok(!calls.some(c=>/STORE|EXPUNGE|DELETE/.test(c)),'El lector jamás cambia mensajes');
});

test('Correo excepcionalmente grande se omite sin bloquear los demás avisos',async t=>{
 const content=msg('normal'),warnings=[];
 const calls=fakeImap(t,{ids:[45,46],sizes:{45:content.length,46:MAX_IMAP_LITERAL_BYTES+50},
  contents:{45:content},logs:warnings});
 const result=await leerBuzon({mailbox:'buzon@example.test',password:'only-in-test'});
 assert.equal(result.length,1);
 assert.ok(calls.includes('UID FETCH 45 (BODY.PEEK[])'));
 assert.ok(!calls.includes('UID FETCH 46 (BODY.PEEK[])'));
 assert.ok(warnings.some(s=>s.includes('exceden 8 MiB')));
 assert.ok(warnings.every(s=>!s.includes('admin@example.test')&&!s.includes('MBAN')));
});

test('Un mensaje sin tamaño verificable no es evidencia bancaria',async t=>{
 const warnings=[],content=msg('safe');
 const calls=fakeImap(t,{ids:[20,21],sizes:{20:content.length},contents:{20:content},logs:warnings});
 const result=await leerBuzon({mailbox:'buzon@example.test',password:'only-in-test'});
 assert.equal(result.length,1);
 assert.ok(!calls.includes('UID FETCH 21 (BODY.PEEK[])'));
 assert.ok(warnings.some(s=>s.includes('sin RFC822.SIZE válido')));
});

test('Error de conexión IMAP se propaga; jamás se convierte en validación positiva',async t=>{
 t.mock.method(Imap.prototype,'connect',async()=>{throw Error('TLS desconectado')});
 t.mock.method(Imap.prototype,'close',()=>{});
 await assert.rejects(leerBuzon({mailbox:'x@example.test',password:'test'}),/TLS desconectado/);
});
