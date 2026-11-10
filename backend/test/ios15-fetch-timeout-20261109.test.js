'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const root=path.resolve(__dirname,'../../docs');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
const helper=read('assets/js/fetch-timeout-compat.js');

test('El helper existe sin AbortSignal.timeout y usa AbortController compatible',()=>{
 assert.doesNotMatch(helper,/AbortSignal\.timeout\s*\(/);
 assert.match(helper,/new AbortController\(\)/);
 assert.match(helper,/clearTimeout\(timer\)/);
 const context={window:{},AbortController,fetch:async()=>({ok:true}),setTimeout,clearTimeout};
 vm.runInNewContext(helper,context);
 assert.equal(typeof context.window.MJFetchWithTimeout,'function');
});
test('No aborta solicitudes exitosas y libera el temporizador',async()=>{
 let removed=0,seenSignal=null;
 const context={window:{},AbortController,
  fetch:async(url,opts)=>{seenSignal=opts.signal;return {ok:true,status:200,url};},
  setTimeout:()=>33,clearTimeout:id=>{assert.equal(id,33);removed++;}};
 vm.runInNewContext(helper,context);
 const response=await context.window.MJFetchWithTimeout('/auth/login',{method:'POST'},30000);
 assert.equal(response.status,200);assert.equal(removed,1);
 assert.equal(seenSignal.aborted,false);
});
test('El timeout aborta y devuelve TimeoutError entendible en Safari 15',async()=>{
 let cb,abortCount=0,cleared=0;
 class LegacyAbortController extends AbortController {
  abort(){abortCount++;super.abort();}
 }
 const context={window:{},AbortController:LegacyAbortController,
  fetch:async(_url,options)=>new Promise((_resolve,reject)=>{
   options.signal.addEventListener('abort',()=>reject(Object.assign(new Error('The operation was aborted.'),{name:'AbortError'})));
  }),
  setTimeout:fn=>{cb=fn;return 42;},clearTimeout:id=>{assert.equal(id,42);cleared++;}};
 vm.runInNewContext(helper,context);
 const pending=context.window.MJFetchWithTimeout('/auth/login',{},30000);
 cb();
 await assert.rejects(pending,error=>error.name==='TimeoutError'&&/tardó en responder/.test(error.message));
 assert.equal(abortCount,1);assert.equal(cleared,1);
});
test('Un fallo ordinario de red no se disfraza de timeout',async()=>{
 const failure=new Error('Red desconectada');
 const context={window:{},AbortController,
  fetch:async()=>{throw failure;},setTimeout:()=>17,clearTimeout:()=>{}};
 vm.runInNewContext(helper,context);
 await assert.rejects(context.window.MJFetchWithTimeout('/auth/login',{},30000),error=>error===failure);
});
test('Las rutas de login, sesión recordada y shell usan helper compatible',()=>{
 const login=read('assets/js/login.js');
 const shell=read('assets/js/app-shell.js');
 const loginHtml=read('login.html');
 const appHtml=read('app.html');
 for(const text of [login,shell])assert.doesNotMatch(text,/AbortSignal\.timeout\s*\(/);
 assert.match(login,/MJFetchWithTimeout\(API_URL \+ path/);
 assert.match(login,/MJFetchWithTimeout\(`\$\{API_URL\}\/auth\/perfil`/);
 assert.match(shell,/MJFetchWithTimeout\(`\$\{window\.MJ_API_URL\}\/auth\/perfil`/);
 assert.ok(loginHtml.indexOf('fetch-timeout-compat.js')<loginHtml.indexOf('login.js?v='));
 assert.ok(appHtml.indexOf('fetch-timeout-compat.js')<appHtml.indexOf('app-shell.js?v='));
});
