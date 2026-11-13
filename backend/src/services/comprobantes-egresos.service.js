'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const root=path.resolve(process.cwd(),'storage','comprobantes-egresos');
const tipos={'image/jpeg':'.jpg','image/png':'.png','application/pdf':'.pdf'};
const fail=(status,message)=>Object.assign(new Error(message),{status});
async function guardar(input){
 if(!input)return null;
 const mime=String(input.mime||'').toLowerCase(),extension=tipos[mime];
 if(!extension||typeof input.base64!=='string'||!/^[A-Za-z0-9+/]+={0,2}$/.test(input.base64))
  throw fail(400,'El comprobante debe ser PDF, JPG o PNG.');
 const bytes=Buffer.from(input.base64,'base64');
 if(!bytes.length||bytes.length>1024*1024)throw fail(400,'El comprobante debe pesar máximo 1 MB.');
 const pdf=bytes.subarray(0,5).toString()==='%PDF-';
 const jpeg=bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff;
 const png=bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 if(!(mime==='application/pdf'&&pdf||mime==='image/jpeg'&&jpeg||mime==='image/png'&&png))
  throw fail(400,'El contenido del comprobante no coincide con su formato.');
 const nombre=randomUUID()+extension;
 await fs.mkdir(root,{recursive:true,mode:0o700});
 await fs.writeFile(path.join(root,nombre),bytes,{flag:'wx',mode:0o600});
 return nombre;
}
async function eliminar(nombre){
 if(nombre&&/^[0-9a-f-]{36}\.(?:png|jpg|pdf)$/.test(nombre))
  await fs.unlink(path.join(root,nombre)).catch(()=>{});
}
async function leer(nombre){
 if(!/^[0-9a-f-]{36}\.(?:png|jpg|pdf)$/.test(String(nombre||'')))
  throw fail(404,'Comprobante no disponible');
 const ext=path.extname(nombre),mime=Object.keys(tipos).find(key=>tipos[key]===ext);
 try{return {bytes:await fs.readFile(path.join(root,nombre)),mime};}
 catch(e){if(e.code==='ENOENT')throw fail(404,'El archivo no se encuentra en el servidor');throw e;}
}
module.exports={guardar,eliminar,leer};
