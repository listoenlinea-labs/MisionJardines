'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../..');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const wait=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};

class FakeEvents{
 constructor(){this.handlers=new Map();}
 addEventListener(name,fn,options){
  const entries=this.handlers.get(name)||[];
  entries.push({fn,once:options?.once});this.handlers.set(name,entries);
 }
 removeEventListener(name,fn){
  this.handlers.set(name,(this.handlers.get(name)||[]).filter(x=>x.fn!==fn));
 }
 dispatchEvent(event){
  for(const item of [...(this.handlers.get(event.type)||[])]){
   item.fn(event);
   if(item.once)this.removeEventListener(event.type,item.fn);
  }
 }
}
const classes=()=>({names:new Set(),add(...names){names.forEach(n=>this.names.add(n));},
 remove(...names){names.forEach(n=>this.names.delete(n));},
 toggle(name,condition){if(condition===undefined)condition=!this.names.has(name);
  if(condition)this.names.add(name);else this.names.delete(name);},
 contains(name){return this.names.has(name);}});
const store=()=>({map:new Map(),getItem(k){return this.map.get(k)||null;},
 setItem(k,v){this.map.set(k,String(v));},removeItem(k){this.map.delete(k);}});

function createHarness(){
 const assignments=[];
 class Frame extends FakeEvents{
  constructor(id){
   super();this.id=id;this.classList=classes();this.attrs={};
   this.contentWindow=new FakeEvents();
   this.contentWindow.location={href:'about:blank'};
   this.contentWindow.MJAccessReady=Promise.resolve(true);
   this.contentDocument={title:'Sección '+id,body:{classList:classes()},
    documentElement:{hasAttribute:key=>key==='data-mj-authorized'},
    querySelectorAll:()=>[],defaultView:{getComputedStyle:()=>({display:'none'})}};
  }
  setAttribute(k,v){this.attrs[k]=v;} removeAttribute(k){delete this.attrs[k];}
  set src(value){
   this.currentSrc=value;this.contentWindow.location.href=value;
   assignments.push({id:this.id,url:value});
   Promise.resolve().then(()=>this.dispatchEvent({type:'load'}));
  }
  get src(){return this.currentSrc||'about:blank';}
 }
 const elements={mjPageA:new Frame('A'),mjPageB:new Frame('B'),
  mjAppLoading:{hidden:false},mjAppError:{hidden:true,querySelector:()=>({textContent:''})},
  mjAppRefresh:{hidden:true},mjAppRetry:new FakeEvents(),mjAppFallback:{href:''}};
 elements.mjAppContent={insertBefore(f){elements[f.id]=f;}};
 class FakeDoc extends FakeEvents{
  constructor(){super();this.body={classList:classes()};this.head={appendChild(){}};this.title='Portal';}
  getElementById(id){return elements[id];}
  querySelectorAll(){return[];}
  querySelector(){return null;}
  createElement(type){return type==='iframe'?new Frame('temporal'):{rel:'',as:'',href:''};}
 }
 const document=new FakeDoc(),window=new FakeEvents(),localStorage=store(),sessionStorage=store();
 localStorage.setItem('misionJardinesToken','TOKEN_TEST');
 window.MJ_SHELL_MODE=true;window.MJ_TOKEN='TOKEN_TEST';
 window.MJ_API_URL='https://api-misionjardines.listoenlinea.host/api';
 window.MJInstallPullRefresh=()=>{};
 window.MJFetchWithTimeout=async()=>({ok:true,status:200,json:async()=>({
  ok:true,usuario:{id:8,rol:{nombre:'ADMINISTRADOR'}}
 })});
 window.MJPermissions={
  pages:['index.html','analisis-cuotas.html','pagos.html','conmutador.html',
   'zkteco.html','anuncios.html','casa-club.html'],
  canAccess:()=>true,landing:()=> 'index.html'
 };
 const script=read('docs/assets/js/app-shell.js');
 vm.runInNewContext(script,{
  window,document,location:new URL('https://listoenlinea-labs.github.io/MisionJardines/app.html'),
  URL,URLSearchParams,sessionStorage,localStorage,
  navigator:{connection:{}},performance:{mark(){},measure(){}},
  history:{pushState(){},replaceState(){}},
  matchMedia:()=>({matches:false}),
  MutationObserver:class{observe(){}disconnect(){}},
  CustomEvent:class{constructor(type,options){this.type=type;this.detail=options?.detail;}},
  setTimeout:(fn,ms)=>{if(ms<400)Promise.resolve().then(fn);return 1;},
  clearTimeout:()=>{}
 },{timeout:2000});
 return {window,sessionStorage,localStorage,assignments};
}
const visits=(assignments,page)=>assignments.filter(x=>x.url.includes('/'+page+'?')).length;

test('Volver a Inicio es inmediato; Pagos, Conmutador y ZKTeco no se guardan',async()=>{
 const h=createHarness();await wait();
 assert.equal(h.window.MJShell.currentPage,'index.html');
 h.window.MJShell.navigate('analisis-cuotas.html');await wait();
 assert.equal(h.window.MJShell.currentPage,'analisis-cuotas.html');
 const homeCount=visits(h.assignments,'index.html');
 h.window.MJShell.navigate('index.html');await wait();
 assert.equal(visits(h.assignments,'index.html'),homeCount,'Inicio no debe recargarse al volver');
 for(const module of ['pagos.html','conmutador.html','zkteco.html']){
  h.window.MJShell.navigate(module);await wait();
  h.window.MJShell.navigate('index.html');await wait();
  h.window.MJShell.navigate(module);await wait();
  assert.equal(visits(h.assignments,module),2,module+' conserva su carga normal');
  h.window.MJShell.navigate('index.html');await wait();
 }
});
test('El cambio de vivienda invalida los documentos anteriores',async()=>{
 const h=createHarness();await wait();
 h.window.MJShell.navigate('analisis-cuotas.html');await wait();
 const previous=visits(h.assignments,'analisis-cuotas.html');
 h.sessionStorage.setItem('mjCasaSeleccionada','77');
 h.window.MJShell.navigate('analisis-cuotas.html');await wait();
 assert.equal(visits(h.assignments,'analisis-cuotas.html'),previous+1);
});
test('El cambio de token no muestra datos cacheados de la sesión anterior',async()=>{
 const h=createHarness();await wait();
 h.window.MJShell.navigate('analisis-cuotas.html');await wait();
 h.localStorage.setItem('misionJardinesToken','TOKEN_DISTINTO');
 const okay=h.window.MJShell.navigate('index.html');
 assert.equal(okay,false);
 assert.equal(h.window.MJShell.currentPage,'analisis-cuotas.html'); // Sin reutilización
});
test('Las secciones financieras se revalidan sin cachear formularios sensibles',()=>{
 const shell=read('docs/assets/js/app-shell.js');
 const finance=read('docs/assets/js/analisis-cuotas.js');
 const club=read('docs/assets/js/casa-club.js');
 const access=read('docs/assets/js/page-access.js');
 assert.match(shell,/const SAFE_CACHE = new Set/);
 for(const excluded of ['pagos.html','conmutador.html','zkteco.html','visitas.html']){
  assert.doesNotMatch(shell.slice(shell.indexOf('const SAFE_CACHE'),shell.indexOf('const MAX_CACHE_AGE')),new RegExp("'"+excluded+"'"));
 }
 assert.match(shell,/MAX_CACHE_AGE = 4 \* 60 \* 1000/);
 assert.match(shell,/route.target === route.page/);
 assert.match(finance,/window\.MJSectionActive===false/);
 assert.match(finance,/refreshWhenChanged\(true\)/);
 assert.match(club,/event\.detail\?\.fromCache/);
 assert.match(club,/void calendar\(\)/);
 assert.match(access,/current\.houseId ===/);
 assert.match(access,/MJPermissions\.canAccess\(role,page\)/);
});
