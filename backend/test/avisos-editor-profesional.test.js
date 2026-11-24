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
 assert.match(html,/aria-label="Opciones de formato del aviso"/);
 assert.match(html,/id="removeNotice"[^>]*>Eliminar aviso/);
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
 await post({body:{title:'Aviso de prueba',brief:'Resumen',full:formatted,duration:1},usuario:{usuarioId:9}},response);
 assert.equal(response.statusCode,201);
 assert.equal(response.payload.ok,true);
 assert.equal(state.created.contenido,formatted);
 const tooLong=res();
 await post({body:{title:'Aviso',brief:'Resumen',full:'<!--mj-rich-v1--><p>'+('A'.repeat(4001))+'</p>',duration:1},usuario:{usuarioId:9}},tooLong);
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
