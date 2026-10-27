const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'../../docs/assets/js/auto-users.js'),'utf8');
async function page(){
 const nodes=new Map(),requests=[];let requestNumber=0,createMode='success',sendMode='success';
 const element=()=>({value:'',textContent:'',hidden:false,innerHTML:'',listeners:{},children:[],
  addEventListener(t,f){this.listeners[t]=f;},append(c){this.children.push(c);},setAttribute(){},querySelectorAll(){return [];},reportValidity(){return true;}});
 const $=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
 const storage={getItem:k=>k==='misionJardinesToken'?'synthetic-token':k==='misionJardinesUsuario'?JSON.stringify({rol:'ADMINISTRADOR'}):null,setItem(){}};
 const context={document:{getElementById:$,createElement:element,querySelectorAll(){return [];}},localStorage:storage,sessionStorage:storage,
  crypto:{randomUUID:()=> (++requestNumber).toString(16).padStart(32,'0')},URL,AbortController,setTimeout,clearTimeout,
  location:{hostname:'example.com',href:'https://example.com/auto-users.html'},fetch:async(url,o)=>{
   requests.push({url,body:o.body?JSON.parse(o.body):null});let data={};
   if(url.endsWith('/individual')){
    if(createMode==='timeout'){createMode='success';throw Object.assign(Error('abort'),{name:'AbortError'});}
    data={usuarioId:8,condominoId:9,resultado:'CREADO',cuentaAceptada:false,estatus:'PENDIENTE'};
   }else if(url.endsWith('/8/invitacion'))data={resultados:[{usuarioId:8,resultado:sendMode==='success'?'ENVIADO':'ERROR',mensaje:sendMode==='success'?'':'Revisa SMTP'}]};
   else if(url.includes('/viviendas'))data={viviendas:[{id:10,calle:'Calle Ejemplo',numero:'5'}]};
   else if(url.endsWith('/config'))data={correoDisponible:true};
   else if(url.includes('/prueba/usuarios'))data={registros:[],total:0};
   else if(url.includes('/auth/cuentas?'))data={solicitudes:[],total:0};
   else data={registros:[],reportes:[],total:0,totalReportes:0};
   return {ok:true,json:async()=>({ok:true,...data})};
  }};
 await vm.runInNewContext(source,context);
 $('singleHouse').value='10';$('singleFullName').value='Residente Nuevo Ejemplo';$('singleEmail').value='nuevo@example.com';$('singlePhone').value='';
 return {$,requests,createMode(v){createMode=v;},sendMode(v){sendMode=v;},async submit(){await $('singleRegistrationForm').listeners.submit({preventDefault(){}});}};
}
test('El formulario crea solo un prerregistro y el envío individual exige un clic separado',async()=>{
 const p=await page();assert.equal(p.$('sendSingleInvitation').disabled,true);
 assert.equal(p.$('singleHouse').children[0].textContent,'Calle Ejemplo · 5');
 await p.submit();
 const created=p.requests.filter(r=>r.url.endsWith('/individual'));assert.equal(created.length,1);
 assert.deepEqual({...created[0].body,claveSolicitud:undefined},{casaId:10,nombreCompleto:'Residente Nuevo Ejemplo',correo:'nuevo@example.com',telefono:'',claveSolicitud:undefined});
 assert.ok(!p.requests.some(r=>r.url.endsWith('/invitaciones')||r.url.endsWith('/8/invitacion')));
 assert.equal(p.$('sendSingleInvitation').disabled,false);assert.match(p.$('singleStatus').textContent,/Cuenta #8/);
 await p.$('sendSingleInvitation').listeners.click();
 assert.equal(p.requests.filter(r=>r.url.endsWith('/8/invitacion')).length,1);
 assert.match(p.$('singleStatus').textContent,/Enviado a correo/);
 assert.ok(!p.requests.some(r=>/\/auto-users\/(crear|invitaciones)$/.test(r.url)));
});
test('Un timeout conserva la clave de creación para reintentar y cambiar datos deshabilita el envío anterior',async()=>{
 const p=await page();p.createMode('timeout');await p.submit();
 assert.match(p.$('singleStatus').textContent,/a tiempo/);assert.equal(p.$('createSingleUser').disabled,false);
 await p.submit();const attempts=p.requests.filter(r=>r.url.endsWith('/individual'));
 assert.equal(attempts[0].body.claveSolicitud,attempts[1].body.claveSolicitud);
 p.$('singleEmail').value='otra@example.com';p.$('singleRegistrationForm').listeners.input();
 assert.equal(p.$('sendSingleInvitation').disabled,true);
 const n=p.requests.length;await p.$('sendSingleInvitation').listeners.click();assert.equal(p.requests.length,n);
 await p.submit();const third=p.requests.filter(r=>r.url.endsWith('/individual')).at(-1);
 assert.notEqual(third.body.claveSolicitud,attempts[0].body.claveSolicitud);
});
test('Un fallo SMTP muestra el error y permite reintentar sin crear otra cuenta',async()=>{
 const p=await page();await p.submit();p.sendMode('error');await p.$('sendSingleInvitation').listeners.click();
 assert.match(p.$('singleStatus').textContent,/Revisa SMTP/);assert.equal(p.$('sendSingleInvitation').disabled,false);
 p.sendMode('success');await p.$('sendSingleInvitation').listeners.click();
 assert.equal(p.requests.filter(r=>r.url.endsWith('/individual')).length,1);
 assert.equal(p.requests.filter(r=>r.url.endsWith('/8/invitacion')).length,2);
});
