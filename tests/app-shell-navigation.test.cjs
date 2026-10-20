'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const policy = require('../docs/assets/js/permissions');

const shellSource = fs.readFileSync('docs/assets/js/app-shell.js', 'utf8');
const shellHtml = fs.readFileSync('docs/app.html', 'utf8');
const sidebarSource = fs.readFileSync('docs/assets/js/site-sidebar.js', 'utf8');
const makeClassList = () => ({add(){},remove(){},toggle(){}});

async function makeShell(role) {
  const listeners = {};
  const location = {
    origin: 'https://app.test', pathname: '/app.html',
    href: 'https://app.test/app.html?page=index.html',
    get search() { return new URL(this.href).search; },
    replace(url) { this.replaced = url; },
    reload() { this.reloaded = true; }
  };
  const frame = id => {
    const element = {
      id, classList: makeClassList(), attributes:{}, contentDocument:{title:id},
      addEventListener(event,callback) {if(event==='load')this.onLoad=callback;},
      setAttribute(name,value){this.attributes[name]=value;},removeAttribute(name){delete this.attributes[name];}
    };
    Object.defineProperty(element,'src',{
      get(){return this.href;},
      set(href){this.href=href;this.contentWindow={location:{href},MJAccessReady:Promise.resolve(true)};queueMicrotask(()=>this.onLoad?.());}
    });
    return element;
  };
  const frames = [frame('mjPageA'),frame('mjPageB')];
  const elements = {
    mjAppContent:{},mjPageA:frames[0],mjPageB:frames[1],
    mjAppLoading:{hidden:false},
    mjAppError:{hidden:true,querySelector:()=>({textContent:''})},
    mjAppRetry:{addEventListener(){}}
  };
  const document = {
    title:'Misión Jardines',getElementById:id=>elements[id],
    addEventListener:(event,fn)=>{listeners[event]=fn;},querySelectorAll:()=>[],querySelector:()=>null
  };
  const tokenStorage={misionJardinesToken:'token'};
  const storage={
    getItem:key=>tokenStorage[key]??null,
    setItem:(key,value)=>{tokenStorage[key]=value;},
    removeItem:key=>{delete tokenStorage[key];}
  };
  const history={
    pushState(_state,_title,url){location.href=String(url);},
    replaceState(_state,_title,url){location.href=String(url);}
  };
  const window = {
    MJ_TOKEN:'token',MJ_API_URL:'https://api.test/api',MJPermissions:policy,
    addEventListener:(name,fn)=>{listeners[name]=fn;}
  };
  const context={window,document,location,history,URL,URLSearchParams,
    localStorage:storage,sessionStorage:storage,queueMicrotask,setTimeout,clearTimeout,
    AbortSignal:{timeout:()=>({})},
    fetch:async()=>({ok:true,status:200,json:async()=>({ok:true,usuario:{rol:{nombre:role}}})})};
  vm.runInNewContext(shellSource,context);
  await window.MJAccessReady;
  await new Promise(resolve=>setTimeout(resolve,10));
  return {window,document,frames,location,listeners,elements};
}

test('persistent app shell retains the parent page and uses only internal frames',async()=>{
  const app=await makeShell('SEGURIDAD');
  assert.equal(app.window.MJShell.currentPage,'index.html');
  assert.equal(app.window.MJShell.navigate('analisis-cuotas.html'),false);
  assert.equal(app.window.MJShell.navigate('visitas.html'),true);
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(app.window.MJShell.currentPage,'visitas.html');
  assert.match(app.frames[1].src,/visitas\.html\?_mjFrame=1$/);
  assert.match(app.location.href,/app\.html\?page=visitas\.html$/);
  assert.equal(app.location.replaced,undefined);
  assert.equal(app.location.reloaded,undefined);
  assert.equal(app.elements.mjAppLoading.hidden,true);
});

test('residents cannot navigate to finances but may return to Inicio',async()=>{
  const app=await makeShell('CONDOMINO');
  assert.equal(app.window.MJShell.navigate('pagos.html'),true);
  assert.equal(app.window.MJShell.navigate('analisis-cuotas.html'),false);
  assert.equal(app.window.MJShell.navigate('index.html'),true);
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(app.window.MJShell.currentPage,'index.html');
});

test('all navigation entry points use the same origin and embedded page isolation',()=>{
  assert.match(shellHtml,/id="mjPageA"/);
  assert.match(shellHtml,/id="mjPageB"/);
  assert.match(shellSource,/event\.origin !== location\.origin/);
  assert.match(shellSource,/MJPermissions\.canAccess\(userRole, route\.page\)/);
  assert.match(sidebarSource,/window\.parent\.postMessage/);
  assert.match(sidebarSource,/function initEmbedded\(/);
  assert.match(sidebarSource,/loadHomeDashboard\(\)/);
});
