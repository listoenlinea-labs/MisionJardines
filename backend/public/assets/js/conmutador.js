const API='/api';
const token=localStorage.getItem('misionJardinesToken')||sessionStorage.getItem('misionJardinesToken');
if(!token){location.replace('login.html')}
const range=n=>Array.from({length:n},(_,i)=>({number:String(i+1)}));
const list=s=>s.split(',').map(x=>({number:x.trim()}));
const sections=[
{key:'Gardenias',houses:range(32)},{key:'Magnolias',houses:range(32)},{key:'Lirios',houses:range(39)},{key:'Rosas',houses:range(42)},
{key:'Jardines 1',houses:list('116,120,124,125,128,129,132,133,136,137,141,142,144,145,148,149,152,153,156,157,160,161,164,165,168,169,173,177,181,185')},
{key:'Jardines 2',houses:list('201,205,209,213,217,221,233,237,241,245,249,253,257,269,273,277,281,285,289')},
{key:'Jardines 3',houses:list('307,311,315,319,323,327,328,331,332,335,336,339,340,343,344,347,348,351,352,355,356,359,360,363,364,367,368,371,372,375,376,379,380,384,388')},
{key:'Exterior',houses:[{number:'3614',label:'Valle de México',lookup:'Valle de México'},{number:'752',label:'Atotonilco',lookup:'Atotonilco'},{number:'707',label:'Guadalajara',lookup:'Guadalajara'}]}
];

let active=sections[0],phones=[];
let modoCaseta = false;
let callModalVisible=false;
let domicilioPendiente = null;
const caseta = crearConmutadorCaseta({ api: call, mostrarEstado: msg });
const tabs=document.getElementById('tabs'),grid=document.getElementById('grid'),status=document.getElementById('status'),modal=document.getElementById('modal');
const caller=new TelefoniaEngine({api:API,token,status:(t,k)=>msg(t,k)});
function msg(t,k=''){
  status.className='status'+(k?' '+k:'');
  status.textContent=t||'';
  if(callModalVisible){
    const modal=document.getElementById('callProgressModal');
    const kind=k==='error'?'error':k==='ok'?'ok':'loading';
    modal.dataset.status=kind;
    document.getElementById('callProgressTitle').textContent=
      kind==='error'?'No se pudo confirmar la llamada':kind==='ok'?'Resultado de la llamada':'Llamando…';
    document.getElementById('callProgressDescription').textContent=t||'Preparando llamada…';
  }
}
function openCallModal(){
  const panel=document.getElementById('callProgressModal');
  callModalVisible=true;panel.hidden=false;panel.classList.add('show');
  msg('Llamando… Preparando solicitud de llamada.','loading');
}
function closeCallModal(){
  const panel=document.getElementById('callProgressModal');
  callModalVisible=false;panel.classList.remove('show');panel.hidden=true;
}
document.getElementById('callProgressClose').addEventListener('click',closeCallModal);
document.getElementById('callProgressModal').addEventListener('click',event=>{
  if(event.target===document.getElementById('callProgressModal'))closeCallModal();
});

async function call(path, options = {}) {
const headers = { Authorization: 'Bearer ' + token };
if (options.body) headers['Content-Type'] = 'application/json';
const r = await fetch(API + path, { ...options, headers, cache: 'no-store' });let d={};try{d=await r.json()}catch{}if(r.status===401){localStorage.removeItem('misionJardinesToken');location.replace('login.html');throw Error('Sesión vencida')}if(!r.ok||d.ok===false)throw Error(d.message||'Error');return d}
function commerce(k,n){return(k==='Gardenias'&&n==='28')||(k==='Lirios'&&n==='32')}
function drawTabs(){tabs.innerHTML='';sections.forEach(s=>{const b=document.createElement('button');b.className='tab'+(s.key===active.key?' active':'');b.textContent=s.key;b.onclick=()=>{active=s;drawTabs();draw()};tabs.appendChild(b)})}
function draw(){document.getElementById('streetTitle').textContent=active.key;document.getElementById('houseCount').textContent=active.houses.length+' domicilios';grid.innerHTML='';active.houses.forEach(h=>{const b=document.createElement('button');b.className='house'+(commerce(active.key,h.number)?' commerce':'')+(active.key==='Exterior'?' ext':'');if(h.label){const sm=document.createElement('small');sm.textContent=h.label;b.appendChild(sm)}const sp=document.createElement('span');sp.textContent=h.number;b.appendChild(sp);if(commerce(active.key,h.number)){const bd=document.createElement('span');bd.className='badge';bd.textContent='Comercio';b.appendChild(bd)}b.onclick=()=>selectHouse(h);grid.appendChild(b)})}
function normalizeWhatsAppNumber(number){let digits=String(number||'').replace(/\D/g,'');if(digits.length===13&&digits.startsWith('521'))digits='52'+digits.slice(3);if(digits.length===10)digits='52'+digits;return /^52\d{10}$/.test(digits)?digits:''}
function openWhatsApp(number,preparedWindow=null){const destination=normalizeWhatsAppNumber(number);if(!destination){try{if(preparedWindow&&!preparedWindow.closed)preparedWindow.close()}catch{}msg('El teléfono registrado no tiene un formato válido para WhatsApp en México.','error');return}const url='misionjardines-call://call?phone='+destination;let target=preparedWindow;try{if(!target||target.closed)target=window.open('','mj-whatsapp-caseta');if(!target){msg('El navegador bloqueó WhatsApp. Habilita ventanas emergentes para este sitio.','error');return}target.opener=null;target.location.replace(url);msg('Enviando la llamada a WhatsApp Desktop desde la cuenta autorizada 33••••8609…','ok');setTimeout(()=>{try{if(target&&!target.closed)target.close()}catch{}},1800)}catch(e){msg('No fue posible iniciar el agente de llamadas. Verifica que el agente Misión Jardines y WhatsApp para Windows estén instalados.','error')}}
async function llamarDesdeCaseta(h) {
  openCallModal();
  const domicilio = { grupo: h.lookup || active.key, numero: h.number };
  document.querySelectorAll('.house').forEach(button => { button.disabled = true; });
  try {
    const contactos = await caseta.contactos(domicilio);
    if (!contactos.length) return msg('Esta vivienda no tiene un contacto disponible.', 'error');
    if (contactos.length === 1) return await caseta.llamar(domicilio, contactos[0]);
    domicilioPendiente = domicilio;
    phones = contactos;
    closeCallModal();
    modal.querySelector('p').textContent = 'Contesta el teléfono fijo de caseta cuando timbre.';
    modal.classList.add('show');
  } catch (error) {
    msg(error.message, 'error');
  } finally {
    document.querySelectorAll('.house').forEach(button => { button.disabled = false; });
  }
}
async function selectHouse(h){if(modoCaseta)return llamarDesdeCaseta(h);const preparedWindow=caller.prepareWindow();openCallModal();if(preparedWindow){try{preparedWindow.document.title='Misión Jardines · WhatsApp';preparedWindow.document.body.innerHTML='<p style="font-family:system-ui;padding:24px">Preparando WhatsApp…</p>'}catch{}}document.querySelectorAll('.house').forEach(x=>x.disabled=true);msg('Buscando teléfono registrado…');try{const p=new URLSearchParams({grupo:h.lookup||active.key,numero:h.number});const d=await call('/busqueda/conmutador/telefono?'+p);phones=(d.telefonos||[]).filter(Boolean).slice(0,2);if(!phones.length){try{if(preparedWindow&&!preparedWindow.closed)preparedWindow.close()}catch{}msg('Este domicilio no tiene teléfono registrado.','error')}else if(phones.length>1){try{if(preparedWindow&&!preparedWindow.closed)preparedWindow.close()}catch{}msg('Hay dos teléfonos registrados. Elige A o B para llamar.');closeCallModal();modal.classList.add('show')}else{await caller.call(phones[0],preparedWindow,openWhatsApp)}}catch(e){try{if(preparedWindow&&!preparedWindow.closed)preparedWindow.close()}catch{}msg(e.message,'error')}finally{document.querySelectorAll('.house').forEach(x=>x.disabled=false)}}
document.querySelectorAll('.choice').forEach(b=>b.onclick=async()=>{
 const n=phones[Number(b.dataset.i)];
 modal.classList.remove('show');
 if(!n)return;
 const prepared=modoCaseta?null:caller.prepareWindow();
 openCallModal();
 document.querySelectorAll('.house').forEach(button=>{button.disabled=true;});
 try{
  if(modoCaseta)await caseta.llamar(domicilioPendiente,n);
  else await caller.call(n,prepared,openWhatsApp);
 }catch(error){msg(error.message||'No se pudo iniciar la llamada.','error');}
 finally{document.querySelectorAll('.house').forEach(button=>{button.disabled=false;});}
});
document.getElementById('close').onclick=()=>modal.classList.remove('show');
document.addEventListener('keydown',event=>{if(event.key==='Escape')closeCallModal();});
document.getElementById('logout').onclick=()=>{localStorage.removeItem('misionJardinesToken');localStorage.removeItem('misionJardinesUsuario');location.replace('login.html')};
(async()=>{try{await call('/auth/perfil');
modoCaseta = await caseta.modo();
if (modoCaseta) {
  document.querySelector('[data-call-description]').textContent = 'Elige una vivienda y contesta el teléfono fijo de caseta cuando timbre.';
  document.querySelectorAll('[data-whatsapp-only]').forEach(element => { element.hidden = true; });
} else await caller.init();
drawTabs();draw()}catch(e){msg(e.message,'error')}})();
