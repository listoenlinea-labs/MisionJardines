'use strict';
const {test,before,after}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {createRequire}=require('node:module');
const {gzipSync,deflateSync,brotliCompressSync}=require('node:zlib');
const appFile=path.resolve(__dirname,'../src/app.js');
const realRequire=createRequire(appFile);
let server,port,routeCalls=0;
before(async()=>{
 const module={exports:{}};
 const route=(req,res,next)=>{
  routeCalls++;
  if(req.method==='POST'&&req.path==='/__parser_probe'){
   const body=req.body||{};
   return res.json({usuario:body.usuario,meta:body.meta,value:body.value,
    imageLength:typeof body.comprobanteData==='string'?body.comprobanteData.length:0});
  }
  next();
 };
 const requireMock=name=>{
  if(name==='./config/database')return {authenticate(){throw Error('No database access in HTTP parser tests');}};
  if(name==='./models')return {};
  if(name.startsWith('./routes/'))return route;
  return realRequire(name);
 };
 new Function('require','module','__dirname','process','console',fs.readFileSync(appFile,'utf8'))(requireMock,module,path.dirname(appFile),process,console);
 const app=module.exports;
 // Solo el formato del error se simplifica: los parsers y HTTP son reales.
 app.use((error,_req,res,_next)=>res.status(error.status||500).json({type:error.type}));
 server=app.listen(0,'127.0.0.1');
 await new Promise((resolve,reject)=>{server.once('listening',resolve);server.once('error',reject);});
 port=server.address().port;
});
after(async()=>{if(server)await new Promise(resolve=>server.close(resolve));});
function request({method='POST',url='/api/pagos/__parser_probe',body=Buffer.from('{}'),type='application/json',encoding}={}){
 return new Promise((resolve,reject)=>{
  const headers={'Content-Type':type,'Content-Length':body.length};
  if(encoding)headers['Content-Encoding']=encoding;
  const req=http.request({hostname:'127.0.0.1',port,path:url,method,headers},res=>{
   const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>{
    const raw=Buffer.concat(chunks).toString();let data;try{data=JSON.parse(raw);}catch(_){data=null;}
    resolve({status:res.statusCode,data});
   });
  });
  req.setTimeout(5000,()=>req.destroy(Error('HTTP parser test timeout')));req.on('error',reject);req.end(body);
 });
}
test('JSON de login sigue llegando al router sin compresión',async()=>{
 const result=await request({url:'/api/auth/__parser_probe',body:Buffer.from(JSON.stringify({usuario:'usuario-sintetico',meta:{casa:'1'}}))});
 assert.equal(result.status,200);assert.equal(result.data.usuario,'usuario-sintetico');assert.deepEqual(result.data.meta,{casa:'1'});
});
test('comprobante base64 dentro del límite de 2 MB conserva su contenido en JSON',async()=>{
 const image='data:image/png;base64,'+'A'.repeat(1600000);
 const result=await request({body:Buffer.from(JSON.stringify({comprobanteData:image}))});
 assert.equal(result.status,200);assert.equal(result.data.imageLength,image.length);
});
test('formularios urlencoded conservan extended y soporte de contenido identity',async()=>{
 const result=await request({type:'application/x-www-form-urlencoded',encoding:'identity',body:Buffer.from('usuario=prueba&meta[casa]=1')});
 assert.equal(result.status,200);assert.equal(result.data.usuario,'prueba');assert.deepEqual(result.data.meta,{casa:'1'});
});
test('cuerpos gzip/deflate/br con bytes finales se rechazan antes del router, incluso sin ruta válida',async()=>{
 for(const [encoding,compress] of [['gzip',gzipSync],['deflate',deflateSync],['br',brotliCompressSync]]){
  for(const [type,raw] of [['application/json','{"value":1}'],['application/x-www-form-urlencoded','value=1']]){
   const beforeCalls=routeCalls;
   const result=await request({url:'/api/ruta-inexistente',type,encoding,body:Buffer.concat([compress(Buffer.from(raw)),Buffer.from('trailing-bytes')])});
   assert.equal(result.status,415,encoding+' '+type);assert.equal(result.data.type,'encoding.unsupported');
   assert.equal(routeCalls,beforeCalls,'No llegó a rutas ni autenticación');
   const health=await request({method:'GET',url:'/api/health',body:Buffer.alloc(0)});
   assert.equal(health.status,200);assert.equal(health.data.ok,true,'El proceso sigue respondiendo');
  }
 }
});
test('JSON mal formado sigue rechazándose y la API se recupera para la siguiente solicitud',async()=>{
 const invalid=await request({body:Buffer.from('{broken')});assert.equal(invalid.status,400);
 const valid=await request({body:Buffer.from('{"value":2}')});assert.equal(valid.status,200);assert.equal(valid.data.value,2);
});
test('se conserva el límite de 2 MB sin permitir cuerpos mayores',async()=>{
 const result=await request({body:Buffer.from(JSON.stringify({comprobanteData:'A'.repeat(2200000)}))});
 assert.equal(result.status,413);assert.equal(result.data.type,'entity.too.large');
});
test('el lock y la instalación efectiva eliminan body-parser vulnerable',()=>{
 const manifest=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../package.json'),'utf8'));
 const lock=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../package-lock.json'),'utf8'));
 assert.equal(manifest.overrides['body-parser'],'^2.4.0');
 const copies=Object.entries(lock.packages).filter(([name])=>name.endsWith('/body-parser'));
 assert.ok(copies.length>0);
 for(const [name,pkg] of copies){const [major,minor]=pkg.version.split('.').map(Number);assert.ok(major===2&&minor>=4,name+' '+pkg.version);}
 const resolved=realRequire.resolve('body-parser',{paths:[path.dirname(realRequire.resolve('express'))]});
 const packagePath=path.join(path.dirname(resolved),'package.json');
 const actual=JSON.parse(fs.readFileSync(packagePath,'utf8')).version;
 assert.equal(actual,lock.packages['node_modules/body-parser'].version);
});
