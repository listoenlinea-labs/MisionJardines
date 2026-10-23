'use strict';
const {Imap}=require('./correo-imap.transport');
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
  return text.join('\n').slice(0,50000);
 }
 if(!/^text\/(plain|html)\b/i.test(type))return '';
 return decode(message.body,message.headers['content-transfer-encoding']||'').slice(0,50000);
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
 const receptor=String(process.env.PAGOS_IMAP_AUTH_SERVER||'mx.hostinger.com').trim().toLowerCase();
 const auth=(h['authentication-results']||'').split('\n').filter(x=>{
  const nombre=String(x).split(';')[0].trim().toLowerCase();
  return receptor&&nombre===receptor;
 }).slice(0,1);
 return {id:'imap-uid:'+uid+':'+String(h['message-id']||'').slice(0,180),
  from:{emailAddress:{address}},subject:decodeHeader(h.subject),
  receivedDateTime:Number.isFinite(time.valueOf())?time.toISOString():'',
  body:{content:mimeText(parsed)},
  internetMessageHeaders:auth.map(value=>({name:'Authentication-Results',value}))};
}

async function leerBuzon({mailbox,password,dias=7}){
 const client=new Imap();
 const quote=value=>{
  const v=String(value||'');
  if(!v||v.includes('\r')||v.includes('\n')||v.includes('\0'))throw Error('Credenciales Gmail inválidas');
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
  const results=[];
  for(const uid of ids.slice(-80).reverse()){
   const bodies=await client.cmd('UID FETCH '+uid+' (BODY.PEEK[])');
   if(bodies.length!==1)continue;
   const parsed=parseMessage({uid,source:bodies[0]});
   if(parsed)results.push(parsed);
  }
  return results;
 }finally{client.close()}
}
module.exports={parseMessage,unfold,mimeText,leerBuzon,decodeHeader};