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

test('Editor de avisos ocupa una columna completa, incluso si hay estilos externos',()=>{
 const html=read('docs/anuncios.html');
 assert.match(html,/\.ann-page #createModal #noticeForm\{display:grid!important;grid-template-columns:minmax\(0,1fr\)!important/);
 assert.match(html,/\.ann-page #createModal #noticeForm>div\{display:block!important;grid-column:1\/-1!important/);
 assert.match(html,/\.ann-page #createModal \.rich-editor\{display:block;width:100%;min-width:0;min-height:190px/);
 assert.match(html,/\.ann-page #createModal \.editor-toolbar\{width:100%;min-width:0;max-width:100%;overflow-x:auto/);
 assert.match(html,/id="imagePreview" class="photo-preview" hidden/);
 assert.match(html,/\.ann-page #createModal \.modal-body\{flex:1 1 auto;min-height:0;overflow-y:auto/);
});

test('Las tarjetas tienen altura reducida y abren la lectura completa al pulsarlas',()=>{
 const html=read('docs/anuncios.html'),script=read('docs/assets/js/avisos.js');
 assert.match(html,/\.ann-page \.ad-card\{display:flex;flex-direction:column;min-width:0;max-height:290px/);
 assert.match(html,/\.ann-page \.ad-card\{display:grid;grid-template-columns:104px minmax\(0,1fr\);max-height:164px/);
 assert.match(html,/\.ann-page \.ad-card--text-only\{grid-template-columns:minmax\(0,1fr\)\}/);
 assert.match(html,/-webkit-line-clamp:2/);
 assert.match(script,/const open=\(\)=>detail\(a.id,article\)/);
 assert.match(script,/article.setAttribute\('role','button'\)/);
 assert.match(script,/article.setAttribute\('aria-label','Leer aviso: '/);
 assert.match(script,/article.addEventListener\('keydown'/);
 assert.match(script,/function detail\(id,opener=null\)/);
 assert.match(script,/showFull\(a\)/);
 assert.match(script,/function closeDetailModal\(restoreFocus=true\)/);
 assert.match(script,/\$\('detailImage'\)\.hidden=!a.image/);
 assert.match(html,/id="detailModal"[^>]+aria-labelledby="detailTitle"/);
 assert.match(html,/\.ann-page #detailModal \.modal-box\{width:min\(740px,100%\);max-height:calc\(100dvh - 24px\);overflow-y:auto/);
});

test('La vista previa de imagen solo aparece al seleccionar un archivo válido',()=>{
 const script=read('docs/assets/js/avisos.js');
 assert.match(script,/\$\('imagePreview'\)\.hidden=false/);
 assert.match(script,/\$\('imagePreview'\)\.hidden=true/);
 assert.match(script,/document\.addEventListener\('visibilitychange'/);
});

test('La vista previa de imágenes reserva su altura y no se monta sobre Descripción breve',()=>{
 const html=read('docs/anuncios.html');
 const js=read('docs/assets/js/avisos.js');
 assert.match(html,/\.ann-page #createModal \.photo-preview\{[\s\S]*?height:auto;min-height:0;max-height:none;[\s\S]*?overflow:hidden;/);
 assert.match(html,/\.ann-page #createModal \.photo-preview img\{[\s\S]*?display:block;[\s\S]*?max-width:100%;max-height:240px;[\s\S]*?object-fit:contain;/);
 assert.match(html,/\.ann-page #createModal \.photo-preview img\{max-height:195px\}/);
 assert.doesNotMatch(html,/\.ann-page #createModal \.photo-preview\{min-height:0;max-height:220px\}/);
 assert.match(html,/\.ann-page #createModal \.photo-preview\[hidden\]\{display:none!important\}/);
 assert.match(js,/\$\('imagePreview'\)\.replaceChildren\(img\);\$\('imagePreview'\)\.hidden=false/);
 assert.match(js,/\$\('imagePreview'\)\.hidden=true/);
});

test('El botón Publicar aviso mantiene el color naranja al pasar el cursor',()=>{
 const html=read('docs/anuncios.html');
 assert.match(html,/id="publishNotice" class="btn btn-primary"/);
 for(const state of ['',':hover',':focus-visible',':active']){
  assert.ok(html.includes('.ann-page #createModal #publishNotice'+state),'Debe estar protegido el estado '+(state||'normal'));
 }
 assert.match(html,/background: linear-gradient\(135deg,#f58b1c,#e87100\) !important;/);
 assert.match(html,/color: #fff !important;/);
 assert.match(html,/border-color: #ef7d0b !important;/);
});
