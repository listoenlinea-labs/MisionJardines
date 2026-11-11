'use strict';
const {Imap,MAX_IMAP_LITERAL_BYTES}=require('./correo-imap.transport');
const MAX_MENSAJES=80;
// UID FETCH (UID RFC822.SIZE) se consulta antes de descargar el mensaje.
// Evita que un adjunto de gran tamaño impida revisar otros movimientos.
function tamanoUid(line){
 if(!/^\*\s+\d+\s+FETCH\s+\(/i.test(String(line||'')))return null;
 const uid=String(line).match(/\bUID\s+([1-9]\d*)\b/i);
 const size=String(line).match(/\bRFC822\.SIZE\s+(\d+)\b/i);
 if(!uid||!size)return null;
 const id=Number(uid[1]),bytes=Number(size[1]);
 return Number.isSafeInteger(id)&&Number.isSafeInteger(bytes)?{uid:id,bytes}:null;
}
function unfold(raw){
 const headers={};let key='';
 for(const line of raw.replace(/\r\n/g,'\n').split('\n')){
  if(/^\s/.test(line)&&key){headers[key]+=' '+line.trim();continue}
  const match=line.match(/^([A-Za-z0-9-]+):\s*(.*)$/);
  if(match){key=match[1].toLowerCase();headers[key]=(headers[key]?headers[key]+'\n':'')+match[2]}
 }
 return headers;
}
function splitMime(raw){
 const pos=raw.search(/\r?\n\r?\n/);
 if(pos<0)return null;
 const match=raw.slice(pos).match(/^\r?\n\r?\n/);
 return {headers:unfold(raw.slice(0,pos)),body:raw.slice(pos+match[0].length)};
}
function decode(raw,encoding){
 if(/base64/i.test(encoding))return Buffer.from(raw.replace(/[^A-Za-z0-9+/=]/g,''),'base64').toString('utf8');
 if(/quoted-printable/i.test(encoding)){
  const expanded=raw.replace(/=\r?\n/g,'').replace(/=([0-9a-f]{2})/gi,(_,h)=>String.fromCharCode(parseInt(h,16)));
  return Buffer.from(expanded,'latin1').toString('utf8');
 }
 return raw;
}
function mimeText(message,depth=0){
 if(!message||depth>4)return '';
 const type=message.headers['content-type']||'text/plain';
 if(/multipart\//i.test(type)){
  const boundary=type.match(/boundary\s*=\s*(?:"([^"]+)"|([^;\s]+))/i);
  if(!boundary)return '';
  const value=boundary[1]||boundary[2];
  if(value.length>120)return '';
  const text=[];
  for(const item of message.body.split('--'+value).slice(1)){
   if(item.startsWith('--'))break;
   const parsed=splitMime(item.replace(/^\r?\n/,''));
   if(!parsed||/attachment/i.test(parsed.headers['content-disposition']||''))continue;
   const child=mimeText(parsed,depth+1);if(child)text.push(child);
  }
  return text.join('\n').slice(0,250000);
 }
 if(!/^text\/(plain|html)\b/i.test(type))return '';
 // Evitar truncar la notificación bancaria antes de extraer sus campos.
 // El HTML puede traer más de 50 KB de estilos y tablas antes del mensaje.
 return decode(message.body,message.headers['content-transfer-encoding']||'').slice(0,250000);
}
function decodeHeader(value){
 return String(value||'').replace(/=\?([^?]+)\?([bq])\?([^?]*)\?=/gi,(_,charset,mode,content)=>{
  try{
   if(mode.toLowerCase()==='b')return Buffer.from(content,'base64').toString(/8859-1|LATIN1/i.test(charset)?'latin1':'utf8');
   const encoded=content.replace(/_/g,' ').replace(/=([0-9a-f]{2})/gi,(_,hex)=>String.fromCharCode(parseInt(hex,16)));
   return Buffer.from(encoded,'latin1').toString(/8859-1|LATIN1/i.test(charset)?'latin1':'utf8');
  }catch(_){return ''}
 });
}
function parseMessage({uid,source}){
 const parsed=splitMime(source.toString('utf8'));if(!parsed)return null;
 const h=parsed.headers,from=String(h.from||'');
 const address=(from.match(/<([^<>\s]+@[^<>\s]+)>/)||[])[1]||
   (from.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]+/i)||[])[0]||'';
 const time=new Date(h.date||'');
 return {id:'imap-uid:'+uid+':'+String(h['message-id']||'').slice(0,180),
  from:{emailAddress:{address}},subject:decodeHeader(h.subject),
  receivedDateTime:Number.isFinite(time.valueOf())?time.toISOString():'',
  body:{content:mimeText(parsed)},
  internetMessageHeaders:[]};
}

async function leerBuzon({mailbox,password,dias=7}){
 const client=new Imap();
 const quote=value=>{
  const v=String(value||'');
  if(!v||v.includes('\r')||v.includes('\n')||v.includes('\0'))throw Error('Credenciales del buzón IMAP inválidas');
  return '"'+v.replace(/\\/g,'\\\\').replace(/"/g,'\\"')+'"';
 };
 try{
  await client.connect();
  await client.cmd('LOGIN '+quote(mailbox)+' '+quote(password));
  await client.cmd('EXAMINE "INBOX"');
  const back=new Date(Date.now()-Math.max(1,Math.min(14,Number(dias)||7))*86400000);
  const since=String(back.getUTCDate()).padStart(2,'0')+'-'+
   ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][back.getUTCMonth()]+'-'+back.getUTCFullYear();
  let ids=[];
  await client.cmd('UID SEARCH SINCE '+since,line=>{
   const found=line.match(/^\*\s+SEARCH(?:\s+(.*))?$/);
   if(found)ids=(found[1]||'').trim().split(/\s+/).map(Number).filter(n=>Number.isSafeInteger(n)&&n>0);
  });
  const recientes=ids.slice(-MAX_MENSAJES).reverse();
  const tamaños=new Map();
  if(recientes.length){
   // Una sola consulta para la lista completa. No recupera cuerpos ni adjuntos.
   await client.cmd('UID FETCH '+recientes.join(',')+' (UID RFC822.SIZE)',line=>{
    const info=tamanoUid(line);
    if(info&&recientes.includes(info.uid))tamaños.set(info.uid,info.bytes);
   });
  }
  const results=[];
  let omitidosGrandes=0,omitidosSinTamano=0;
  for(const uid of recientes){
   const bytes=tamaños.get(uid);
   if(!Number.isSafeInteger(bytes)||bytes<=0){omitidosSinTamano++;continue;}
   if(bytes>MAX_IMAP_LITERAL_BYTES){omitidosGrandes++;continue;}
   // Si IMAP, TLS o LOGIN fallan, propagar el error: nunca acreditar pagos
   // por la mera ausencia de mensajes. El worker los deja PENDIENTES.
   const bodies=await client.cmd('UID FETCH '+uid+' (BODY.PEEK[])');
   if(bodies.length!==1)continue;
   try{
    const parsed=parseMessage({uid,source:bodies[0]});
    if(parsed)results.push(parsed);
   }catch(_){
    // Un MIME malformado no detiene la consulta de los demás correos.
    console.warn('[Bancos] IMAP: se omitió un mensaje con formato MIME inválido (sin datos personales).');
   }
  }
  if(omitidosGrandes)
   console.warn('[Bancos] IMAP: '+omitidosGrandes+' mensaje(s) exceden '+Math.floor(MAX_IMAP_LITERAL_BYTES/1048576)+' MiB; se omitieron sin descargar adjuntos. Otros avisos sí fueron revisados.');
  if(omitidosSinTamano)
   console.warn('[Bancos] IMAP: '+omitidosSinTamano+' mensaje(s) sin RFC822.SIZE válido; no se usaron para acreditar depósitos.');
  return results;
 }finally{client.close()}
}
module.exports={parseMessage,unfold,mimeText,leerBuzon,decodeHeader,tamanoUid};