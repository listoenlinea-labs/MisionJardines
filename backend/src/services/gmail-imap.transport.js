'use strict';
// Buzón Gmail dedicado; las credenciales nunca se imprimen.
// El lector usa exclusivamente IMAP sobre TLS y comandos de solo lectura.
const tls=require('node:tls');
class Imap {
 constructor(){this.buffer=Buffer.alloc(0);this.queue=[];this.error=null;this.tag=0;this.socket=null;}
 signal(error){if(error)this.error=error;this.queue.splice(0).forEach(w=>w());}
 async wait(){if(this.error)throw this.error;await new Promise((resolve,reject)=>{
  const f=()=>{clearTimeout(t);resolve()},t=setTimeout(()=>{this.queue=this.queue.filter(x=>x!==f);reject(Error('Tiempo agotado en Gmail'))},12000);
  this.queue.push(f);
 });if(this.error)throw this.error;}
 async take(n){while(this.buffer.length<n)await this.wait();const b=Buffer.from(this.buffer.subarray(0,n));this.buffer=this.buffer.subarray(n);return b;}
 async line(){for(;;){const i=this.buffer.indexOf('\r\n');if(i>=0)return (await this.take(i+2)).subarray(0,i).toString();
  if(this.buffer.length>64000)throw Error('Línea IMAP extensa');await this.wait()}}
 async connect(){const host='imap.gmail.com';this.socket=tls.connect({host,port:993,servername:host,rejectUnauthorized:true,timeout:20000});
  this.socket.on('data',c=>{this.buffer=Buffer.concat([this.buffer,c]);if(this.buffer.length>9000000)this.socket.destroy(Error('Respuesta extensa'));this.signal()});
  this.socket.on('error',e=>this.signal(e));this.socket.on('close',()=>this.signal(Error('IMAP desconectado')));
  await new Promise((resolve,reject)=>{this.socket.once('secureConnect',()=>this.socket.authorized?resolve():reject(Error('TLS inválido')));
    this.socket.once('error',reject)});
  if(!/^\* OK/.test(await this.line()))throw Error('Gmail rechazó la conexión');
 }
 async cmd(cmd,onLine){const tag='B'+(++this.tag).toString().padStart(4,'0');this.socket.write(tag+' '+cmd+'\r\n');
  const result=[];for(;;){const l=await this.line();if(l.startsWith(tag+' ')){if(!l.startsWith(tag+' OK'))throw Error('IMAP no autorizó la petición');return result}
   onLine?.(l);const m=l.match(/\{(\d+)\}$/);if(m){const n=Number(m[1]);if(n>400000)throw Error('Correo demasiado grande');result.push(await this.take(n))}}
 }
 close(){this.socket?.end()}
}
module.exports={Imap};