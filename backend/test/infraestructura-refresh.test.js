const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.join(__dirname,'../..');
const source=fs.readFileSync(path.join(root,'docs/assets/js/infraestructura-admin.js'),'utf8');
const html=fs.readFileSync(path.join(root,'docs/infraestructura.html'),'utf8');
function harness(){
 const elements=new Map(),node=()=>({dataset:{},setAttribute(k,v){this[k]=v;},append(){},replaceChildren(){},textContent:'',disabled:false});
 const by=id=>{if(!elements.has(id))elements.set(id,node());return elements.get(id);};
 const document={getElementById:by,createElement:node,hidden:false};
 let requests=[];
 const window={MJAccessReady:Promise.resolve(true),MJVerifiedRole:'ADMINISTRADOR',MJInfraBitacora:{paginate:()=>({total:0,items:[],page:1,pages:1})},addEventListener(){}};
 const context={document,window,matchMedia:()=>({matches:false,addEventListener(){}}),localStorage:{getItem:()=> 'test'},sessionStorage:{getItem:()=>null},fetch:(url)=>new Promise((resolve,reject)=>requests.push({url,resolve,reject})),Intl,Date,AbortController,setTimeout,clearTimeout,setInterval:()=>0,clearInterval};
 vm.runInNewContext(source,context);
 return {by,requests};
}
const tick=()=>new Promise(resolve=>setImmediate(resolve));
test('actualización real: espera, éxito, error y reintento sin peticiones duplicadas',async()=>{
 const {by,requests}=harness();await tick();
 assert.equal(by('infraRefresh').disabled,true);
 assert.equal(by('infraRefresh')['aria-busy'],'true');
 assert.equal(by('infraRefreshLabel').textContent,'Actualizando…');
 by('infraRefresh').onclick();assert.equal(requests.length,1);
 requests[0].resolve({ok:true,json:async()=>({ok:true,enLinea:false})});await tick();
 assert.equal(by('infraRefresh').dataset.state,'success');
 assert.equal(by('infraRefresh').disabled,false);
 assert.equal(by('infraRefresh')['aria-busy'],'false');
 assert.match(by('infraRefreshFeedback').textContent,/Estado consultado/);
 by('infraRefresh').onclick();assert.equal(by('infraRefresh').dataset.state,'loading');
 requests[1].reject(Error('Sin conexión'));await tick();
 assert.equal(by('infraRefresh').dataset.state,'error');
 assert.match(by('infraRefreshFeedback').textContent,/Última correcta/);
 assert.equal(by('infraRefresh').disabled,false);
 by('infraRefresh').onclick();assert.match(requests[2].url,/actualizar$/);
 requests[2].resolve({ok:true,json:async()=>({ok:true,solicitud:{id:'sample-1'}})});await tick();
 requests[3].resolve({ok:true,json:async()=>({ok:true,enLinea:true,monitoreo:{habilitado:true,enVivo:true,ultimaMuestra:Date.now(),solicitud:{id:'sample-1',estado:'COMPLETADA'}}})});await tick();
 requests[4].resolve({ok:true,json:async()=>({ok:true,enLinea:true,monitoreo:{habilitado:true,enVivo:true,modo:'DOS_HORAS',caducidadMs:7800000,ultimaMuestra:Date.now(),solicitud:{id:'sample-1',estado:'COMPLETADA'}}})});await tick();
 assert.match(by('infraRefreshFeedback').textContent,/Muestra nueva recibida/);
 assert.equal(by('infraRefresh').dataset.state,'success');
 assert.match(html,/id="infraRefreshFeedback"[^>]*role="status"/);
});

test('no hay polling de red al mantener abierta la página',()=>{assert.doesNotMatch(source,/setInterval\([^\n]*refresh\(/);assert.match(source,/setInterval\([^\n]*caducidadMs/);});
