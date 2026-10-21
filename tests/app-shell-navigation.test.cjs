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

async function makeShell(role, mobile = true) {
  const listeners = {}, observers = [], bodyClasses = new Set();
  const location = {
    origin: 'https://app.test', pathname: '/app.html',
    href: 'https://app.test/app.html?page=index.html',
    get search() { return new URL(this.href).search; },
    replace(url) { this.replaced = url; },
    reload() { this.reloaded = true; }
  };
  const frame = id => {
    const doc = { title:id, body:{classList:new Set()}, documentElement:{}, scrollingElement:{scrollTop:0},
      listeners:{}, modals:[], querySelectorAll(){return this.modals;},
      defaultView:{scrollY:0,getComputedStyle:node=>({overflowY:'visible',display:'block',visibility:'visible',...node.style})},
      addEventListener(type,fn){this.listeners[type]=fn;}
    };
    const element = {
      id, classList: makeClassList(), attributes:{}, contentDocument:doc, loads:0,
      addEventListener(event,callback) {if(event==='load')this.onLoad=callback;},
      setAttribute(name,value){this.attributes[name]=value;},removeAttribute(name){delete this.attributes[name];}
    };
    Object.defineProperty(element,'src',{
      get(){return this.href;},
      set(href){this.loads++;this.href=href;this.contentWindow={location:{href},MJAccessReady:Promise.resolve(true)};queueMicrotask(()=>this.onLoad?.());}
    });
    return element;
  };
  const frames = [frame('mjPageA'),frame('mjPageB')];
  const elements = {
    mjAppContent:{},mjPageA:frames[0],mjPageB:frames[1],
    mjAppLoading:{hidden:false},mjAppRefresh:{hidden:true,textContent:''},
    mjAppError:{hidden:true,querySelector:()=>({textContent:''})},
    mjAppRetry:{addEventListener(){}}
  };
  const document = {
    body:{classList:{remove:name=>bodyClasses.delete(name),contains:name=>bodyClasses.has(name),
      toggle(name,on){if(on)bodyClasses.add(name);else bodyClasses.delete(name);}}},
    title:'Misión Jardines',getElementById:id=>elements[id],
    addEventListener:(event,fn)=>{listeners[event]=fn;},querySelectorAll:()=>[],querySelector:()=>document.menuOpen?{}:null
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
    matchMedia:()=>({matches:mobile}),
    addEventListener:(name,fn)=>{listeners[name]=fn;}
  };
  const context={window,document,location,history,URL,URLSearchParams,
    MutationObserver:class {
      constructor(callback){this.callback=callback;observers.push(this);}
      observe(target,options){this.target=target;this.options=options;this.connected=true;}
      disconnect(){this.connected=false;}
    },
    localStorage:storage,sessionStorage:storage,queueMicrotask,setTimeout,clearTimeout,
    AbortSignal:{timeout:()=>({})},
    fetch:async()=>({ok:true,status:200,json:async()=>({ok:true,usuario:{rol:{nombre:role}}})})};
  vm.runInNewContext(shellSource,context);
  await window.MJAccessReady;
  await new Promise(resolve=>setTimeout(resolve,10));
  return {window,document,frames,location,listeners,elements,observers,bodyClasses};
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
  assert.ok(app.frames[0].contentDocument.body.classList.has('mj-shared-sidebar-collapsed'));
  assert.ok(app.frames[1].contentDocument.body.classList.has('mj-shared-sidebar-collapsed'));
});

function touch(doc, type, {x=100,y=0,count=1,target,cancelable=true}={}) {
  const event = { touches:Array.from({length:count},()=>({clientX:x,clientY:y})),
    target:target||{closest:()=>null,scrollHeight:0,clientHeight:0,parentElement:doc.body},
    cancelable,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}
  };
  doc.listeners[type](event); return event;
}

test('deslizar desde arriba actualiza una vez la sección y conserva la URL, sesión y marco exterior',async()=>{
  const app=await makeShell('CONDOMINO');
  const frame=app.frames[0],doc=frame.contentDocument,before=app.location.href;
  touch(doc,'touchstart',{y:30});
  assert.equal(touch(doc,'touchmove',{y:140}).defaultPrevented,true);
  assert.equal(app.elements.mjAppRefresh.textContent,'Suelta para actualizar');
  touch(doc,'touchend',{count:0}); touch(doc,'touchend',{count:0});
  assert.equal(app.frames[1].loads,1);
  await new Promise(resolve=>setTimeout(resolve,10));
  assert.equal(app.location.href,before); assert.equal(app.location.reloaded,undefined);
  assert.equal(app.location.replaced,undefined); assert.equal(app.window.MJShell.currentPage,'index.html');
  assert.equal(app.elements.mjAppRefresh.hidden,true); assert.equal(app.elements.mjAppLoading.hidden,true);
});

test('scroll normal, gestos cortos/horizontales, pellizcos, cancelación y escritorio no refrescan',async()=>{
  const app=await makeShell('CONDOMINO'),doc=app.frames[0].contentDocument;
  doc.scrollingElement.scrollTop=80;
  touch(doc,'touchstart',{y:0}); assert.equal(touch(doc,'touchmove',{y:120}).defaultPrevented,false); touch(doc,'touchend');
  doc.scrollingElement.scrollTop=0;
  for(const steps of [
    [['touchmove',{y:40}]], [['touchmove',{x:220,y:100}]], [['touchmove',{y:-100}]],
    [['touchmove',{y:120,count:2}]], [['touchmove',{y:120}],['touchcancel',{}]],
    [['touchmove',{y:120}],['touchmove',{y:5}]], [['touchmove',{y:120,cancelable:false}]]
  ]) {
    touch(doc,'touchstart',{y:0}); for(const [type,options] of steps)touch(doc,type,options); touch(doc,'touchend');
  }
  assert.equal(app.frames[1].loads,0);
  const desktop=await makeShell('CONDOMINO',false),desktopDoc=desktop.frames[0].contentDocument;
  touch(desktopDoc,'touchstart'); touch(desktopDoc,'touchmove',{y:120}); touch(desktopDoc,'touchend');
  assert.equal(desktop.frames[1].loads,0);
});

test('el gesto descendente se toma desde el primer movimiento sin refrescar antes del umbral',async()=>{
  const app=await makeShell('CONDOMINO'),doc=app.frames[0].contentDocument;
  touch(doc,'touchstart');
  assert.equal(touch(doc,'touchmove',{y:3}).defaultPrevented,true);
  assert.equal(app.elements.mjAppRefresh.hidden,true);
  touch(doc,'touchend'); assert.equal(app.frames[1].loads,0);
});

test('menú, modales, controles y contenedores con scroll propio conservan sus gestos',async()=>{
  const app=await makeShell('CONDOMINO'),doc=app.frames[0].contentDocument;
  const pull=target=>{touch(doc,'touchstart',{target});const move=touch(doc,'touchmove',{y:120});touch(doc,'touchend');assert.equal(move.defaultPrevented,false);};
  pull({closest:()=>({}),scrollHeight:0,clientHeight:0});
  pull({closest:()=>null,scrollHeight:500,clientHeight:100,style:{overflowY:'auto'},parentElement:doc.body});
  pull({closest:()=>null,scrollWidth:500,clientWidth:100,style:{overflowX:'auto'},parentElement:doc.body});
  doc.querySelectorAll=()=>[{tagName:'DIALOG',open:true,closest:()=>null,getClientRects:()=>[{}]}]; pull();
  doc.querySelectorAll=()=>[]; app.document.menuOpen=true; pull();
  assert.equal(app.frames[1].loads,0);
});

test('modales heredados y nativos ocultan la cabecera y bloquean el gesto solo mientras están visibles',async()=>{
  const app=await makeShell('CONDOMINO'),doc=app.frames[0].contentDocument;
  const modal={tagName:'DIV',hiddenTree:false,closest(){return this.hiddenTree?{}:null;},getClientRects:()=>[{}]};
  doc.modals=[modal]; const observer=app.observers.at(-1);
  observer.callback(); assert.equal(app.bodyClasses.has('mj-child-modal-open'),true);
  touch(doc,'touchstart');assert.equal(touch(doc,'touchmove',{y:120}).defaultPrevented,false);touch(doc,'touchend');
  assert.equal(app.frames[1].loads,0);
  modal.hiddenTree=true;observer.callback();assert.equal(app.bodyClasses.has('mj-child-modal-open'),false);
  modal.hiddenTree=false;modal.tagName='DIALOG';modal.open=false;
  observer.callback();assert.equal(app.bodyClasses.has('mj-child-modal-open'),false);
  modal.open=true;observer.callback();assert.equal(app.bodyClasses.has('mj-child-modal-open'),true);
  modal.open=false;observer.callback();
  touch(doc,'touchstart');touch(doc,'touchmove',{y:120});touch(doc,'touchend');
  assert.equal(app.frames[1].loads,1);
});

test('abrir un modal durante el gesto cancela la actualización; navegar desconecta el observador anterior',async()=>{
  const app=await makeShell('CONDOMINO'),doc=app.frames[0].contentDocument;
  const observer=app.observers.at(-1);
  touch(doc,'touchstart');touch(doc,'touchmove',{y:120});assert.equal(app.elements.mjAppRefresh.hidden,false);
  doc.modals=[{tagName:'DIV',closest:()=>null,getClientRects:()=>[{}]}];
  observer.callback();assert.equal(app.elements.mjAppRefresh.hidden,true);
  touch(doc,'touchend');assert.equal(app.frames[1].loads,0);
  assert.equal(app.window.MJShell.navigate('pagos.html'),true);
  assert.equal(observer.connected,false);assert.equal(app.bodyClasses.has('mj-child-modal-open'),false);
  await new Promise(resolve=>setTimeout(resolve,10));
  observer.callback();assert.equal(app.bodyClasses.has('mj-child-modal-open'),false);
  assert.equal(app.observers.at(-1).target,app.frames[1].contentDocument.body);
  assert.equal(app.observers.at(-1).connected,true);
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

test('embedded Inicio loads the same compact design as standalone without duplicating the sidebar',()=>{
  const nodes = [];
  const classes = new Set(['mj-home']);
  const listeners = {};
  const document = {
    readyState:'complete',
    body:{
      classList:{add:(...names)=>names.forEach(name=>classes.add(name))},
      appendChild:element=>nodes.push(element)
    },
    head:{appendChild:element=>nodes.push(element)},
    createElement:tag=>({tagName:tag.toUpperCase(),dataset:{}}),
    getElementById:id=>nodes.find(node=>node.id===id),
    querySelector:()=>null,
    addEventListener:(event,callback)=>{listeners[event]=callback;}
  };
  const window = {parent:{postMessage(){}},MJPermissions:policy};
  const location = {
    pathname:'/MisionJardines/index.html',
    search:'?_mjFrame=1',
    href:'https://app.test/MisionJardines/index.html?_mjFrame=1',
    origin:'https://app.test'
  };
  vm.runInNewContext(sidebarSource,{window,document,location,URL,URLSearchParams});
  assert.ok(classes.has('mj-embedded'));
  assert.ok(classes.has('mj-shared-sidebar-enabled'));
  assert.ok(classes.has('mj-shared-sidebar-collapsed'),'El documento interior no tiene menú propio que bloquee el scroll móvil');
  for (const id of ['mjAppDesign','mjProductUI','mjUnifiedUI','mjKpiCompact','mjMobileOperativo']) {
    const stylesheet = nodes.find(node=>node.id===id);
    assert.equal(stylesheet?.rel,'stylesheet',`${id} debe estar dentro del iframe`);
  }
  assert.equal(nodes.filter(node=>node.tagName==='SCRIPT' && node.dataset?.mjHomeDashboard).length,1);
  assert.equal(nodes.filter(node=>node.id==='mjSharedSidebarStyles').length,0);
  assert.equal(nodes.filter(node=>node.className==='mj-shared-sidebar').length,0);
  assert.match(fs.readFileSync('docs/assets/css/kpi-compact.css','utf8'),
    /body\.mj-home\.mj-shared-sidebar-enabled \.dashboard \.hl-report-kpi>\.hl-kpi-content/);
});

test('Inicio preloads its compact styles before the dashboard can render in either navigation mode',()=>{
  const homeHtml = fs.readFileSync('docs/index.html','utf8');
  assert.match(homeHtml, /<body class="mj-home mj-shared-sidebar-enabled">/);
  const head = homeHtml.split('</head>')[0];
  for (const [id, path] of [
    ['mjAppDesign','app-design.css'],
    ['mjProductUI','product-ui.css'],
    ['mjUnifiedUI','ui-unificada.css'],
    ['mjKpiCompact','kpi-compact.css'],
    ['mjMobileOperativo','mobile-operativo.css']
  ]) {
    assert.match(head, new RegExp(`<link id="${id}" rel="stylesheet" href="assets/css/${path.replaceAll('.','\\.')}\\?v=`));
    assert.equal(head.split(`id="${id}"`).length-1,1,`${id} no debe duplicarse`);
  }
  assert.match(homeHtml, /site-sidebar\.js\?v=20261021-purple-x/);
});
