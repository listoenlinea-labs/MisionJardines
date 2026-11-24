'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const root=path.resolve(__dirname,'../..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');

test('Avisos tiene un solo campo Descripción breve con barra de formato responsive',()=>{
 const html=read('docs/anuncios.html');
 assert.match(html,/for="noticeDescription">Descripción breve/);
 assert.doesNotMatch(html,/Contenido del aviso|id="noticeFull"/);
 for(const name of ['bold','italic','underline','insertUnorderedList','insertOrderedList','removeFormat']){
  assert.match(html,new RegExp('data-command="'+name+'"'));
 }
 assert.match(html,/id="editorFontSize"/);
 assert.match(html,/id="editorTextColor"/);
 assert.match(html,/class="color-swatch"/);
 assert.match(html,/overflow-x:auto/);
 assert.match(html,/\.form-grid>div\{min-width:0\}/);
 assert.match(html,/\.editor-toolbar\{max-width:100%;min-width:0/);
 assert.match(html,/aria-label="Opciones de formato del aviso"/);
 assert.match(html,/id="removeNotice"[^>]*>Eliminar aviso/);
 assert.match(html,/\.ad-card \.ad-title,\.detail-content \.detail-title\{font-weight:900\}/);
 assert.match(html,/#noticeTitle\{font-size:15px;font-weight:800\}/);
 const options=html.match(/<select id="noticeDuration"[^>]*>([\s\S]*?)<\/select>/);
 assert.ok(options,'Debe existir el selector de tiempo visible');
 assert.deepEqual([...options[1].matchAll(/<option value="(\d+)">([^<]+)<\/option>/g)].map(m=>[m[1],m[2]]),[['1','1 día'],['3','3 días'],['5','5 días'],['7','1 semana'],['14','2 semanas']]);
});

test('El código del editor es válido, conserva selección y protege avisos históricos',()=>{
 const script=read('docs/assets/js/avisos.js');
 assert.doesNotThrow(()=>new Function(script));
 assert.match(script,/const richPrefix='<!--mj-rich-v1-->'/);
 assert.match(script,/if\(!full\.startsWith\(richPrefix\)\)/);
 assert.match(script,/function restoreSelection\(\)/);
 assert.match(script,/cleanRich\(full\.slice\(richPrefix\.length\)\)/);
 assert.match(script,/const brief=content\.slice\(0,300\)|brief=content\.slice\(0,300\)/);
 assert.match(script,/method:'DELETE'/);
 assert.match(script,/durationDays:Number\(\$\('noticeDuration'\)\.value\)/);
 assert.match(script,/function scheduleExpiry\(\)/);
 assert.match(script,/items=items\.filter\(notice=>new Date\(notice\.expiresAt\)\.getTime\(\)>now\)/);
});

function loadRouter(){
 const routes={};const state={created:null,deletedId:null,roles:[]};
 const router={
  use(){},
  get(name,...handlers){routes['GET '+name]=handlers;},
  post(name,...handlers){routes['POST '+name]=handlers;},
  delete(name,...handlers){routes['DELETE '+name]=handlers;}
 };
 const Model={
  async create(payload){
   state.created=payload;
   return {id:12,...payload,creadoEn:new Date(),imagenData:payload.imagenData};
  },
  async destroy({where}){state.deletedId=where.id;return 1;},
  async findAll(){return [];}
 };
 const fakeRequire=name=>{
  if(name==='express')return {Router:()=>router};
  if(name==='sequelize')return {Op:{gt:'gt'}};
  if(name==='../middlewares/auth.middleware')return {autenticarToken:()=>{}};
  if(name==='../middlewares/roles.middleware')return {autorizarRoles:(...roles)=>{
   state.roles=roles;return ()=>{};
  }};
  if(name==='../models/AvisoOficial')return Model;
  throw Error('Unexpected require: '+name);
 };
 const sandbox={require:fakeRequire,module:{exports:{}},console,Buffer,Date,Error,Number,String};
 vm.runInNewContext(read('backend/src/routes/avisos.routes.js'),sandbox);
 return {routes,state};
}
function res(){
 return {statusCode:200,payload:null,
  status(code){this.statusCode=code;return this;},
  json(body){this.payload=body;return this;}
 };
}

test('La publicación acepta texto enriquecido hasta 4000 caracteres y rechaza 4001',async()=>{
 const {routes,state}=loadRouter(),post=routes['POST /'].at(-1);
 assert.deepEqual([...state.roles].sort(),['ADMINISTRADOR','SUPER_ADMIN']);
 const formatted='<!--mj-rich-v1--><p><strong>'+('A'.repeat(4000))+'</strong></p>';
 const response=res();
 await post({body:{title:'Aviso de prueba',brief:'Resumen',full:formatted,durationDays:1},usuario:{usuarioId:9}},response);
 assert.equal(response.statusCode,201);
 assert.equal(response.payload.ok,true);
 assert.equal(state.created.contenido,formatted);
 const tooLong=res();
 await post({body:{title:'Aviso',brief:'Resumen',full:'<!--mj-rich-v1--><p>'+('A'.repeat(4001))+'</p>',durationDays:1},usuario:{usuarioId:9}},tooLong);
 assert.equal(tooLong.statusCode,400);
});

test('La eliminación se protege por middleware de administrador y usa el ID correcto',async()=>{
 const {routes,state}=loadRouter(),handlers=routes['DELETE /:id'];
 assert.equal(handlers.length,2);
 const response=res();
 await handlers[1]({params:{id:'52'}},response);
 assert.equal(state.deletedId,52);
 assert.equal(response.payload.ok,true);
});

test('Las cinco duraciones vencen tras 24, 72, 120, 168 y 336 horas exactas',async()=>{
 const {routes,state}=loadRouter(),post=routes['POST /'].at(-1);
 for(const days of [1,3,5,7,14]){
  const response=res();
  await post({body:{title:'Aviso de vigencia',brief:'Resumen',full:'Texto seguro',durationDays:days},usuario:{usuarioId:9}},response);
  assert.equal(response.statusCode,201,'No se aceptó '+days+' días');
  assert.equal(state.created.expiraEn.getTime()-state.created.creadoEn.getTime(),days*24*60*60*1000,'Vencimiento incorrecto para '+days+' días');
  assert.equal(response.payload.data.expiresAt.getTime(),state.created.expiraEn.getTime());
 }
});

test('Rechaza plazos viejos de meses, fuera de rango y fraccionarios',async()=>{
 const {routes}=loadRouter(),post=routes['POST /'].at(-1);
 for(const durationDays of [0,2,4,6,8,15,30,1.5,-1,'abc']){
  const response=res();
  await post({body:{title:'Aviso',brief:'Texto',full:'Aviso de prueba',durationDays},usuario:{usuarioId:9}},response);
  assert.equal(response.statusCode,400,'Duración no permitida: '+durationDays);
 }
 const previousPayload=res();
 await post({body:{title:'Aviso',brief:'Texto',full:'Aviso de prueba',duration:1},usuario:{usuarioId:9}},previousPayload);
 assert.equal(previousPayload.statusCode,400,'No debe interpretarse el mes viejo como un día');
});

test('La lista de avisos consulta únicamente registros sin vencer',async()=>{
 const {routes}=loadRouter(),get=routes['GET /'].at(-1);
 const response={...res(),headers:{},set(key,value){this.headers[key]=value;return this}};
 await get({},response);
 assert.equal(response.payload.ok,true);
 assert.equal(response.headers['Cache-Control'],'private, no-store');
 const source=read('backend/src/routes/avisos.routes.js');
 assert.match(source,/expiraEn:\{\[Op\.gt\]:new Date\(\)\}/);
});
