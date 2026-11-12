'use strict';
(async()=>{
 const API=(window.MJ_API_URL||'https://api-misionjardines.listoenlinea.host/api')+'/casa-club/tarjetas-rojas';
 const auth=window.MJ_API_URL||'https://api-misionjardines.listoenlinea.host/api';
 const $=id=>document.getElementById(id);
 const token=localStorage.getItem('misionJardinesToken')||sessionStorage.getItem('misionJardinesToken');
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const date=x=>x?new Date(x.length===10?x+'T12:00:00Z':x).toLocaleDateString('es-MX',{timeZone:'America/Mexico_City',day:'2-digit',month:'short',year:'numeric'}):'—';
 let homes=[],selected=null,role='',cardToRemove=null,working=false;
 const staff=['SUPER_ADMIN','ADMINISTRADOR','SEGURIDAD'];
 const admin=()=>['SUPER_ADMIN','ADMINISTRADOR'].includes(role);
 const setStatus=(msg,bad=false)=>{const el=$('redNotice');el.textContent=msg;el.classList.toggle('error',bad);el.hidden=false};
 const headers=(json=false)=>({Authorization:'Bearer '+token,...(json?{'Content-Type':'application/json'}:{})});
 async function get(path,{method='GET',body=null}={}){
  const r=await fetch(API+path,{method,headers:headers(body!==null),cache:'no-store',
   ...(body!==null?{body:JSON.stringify(body)}:{})});
  const d=await r.json().catch(()=>({}));
  if(r.status===401){location.replace('login.html');throw Error('Tu sesión expiró.');}
  if(!r.ok||!d.ok)throw Error(d.message||'No se completó la operación.');
  return d.data;
 }
 function fillStreets(){
  const streets=[...new Set(homes.map(x=>x.calle))].sort((a,b)=>a.localeCompare(b,'es',{numeric:true}));
  $('redStreet').innerHTML='<option value="">Selecciona una calle</option>'+
   streets.map(s=>'<option value="'+esc(s)+'">'+esc(s)+'</option>').join('');
 }
 function fillNumbers(){
  const street=$('redStreet').value;
  const casas=homes.filter(x=>x.calle===street).sort((a,b)=>String(a.numero).localeCompare(String(b.numero),'es',{numeric:true}));
  $('redHouse').disabled=!street;
  $('redHouse').innerHTML='<option value="">Selecciona el número</option>'+
   casas.map(x=>'<option value="'+Number(x.id)+'">'+esc(x.numero)+'</option>').join('');
  $('redHousePanel').hidden=true;selected=null;
 }
 function paint(result){
  selected=result;
  $('redHousePanel').hidden=false;
  $('redHouseTitle').textContent=result.casa.calle+' '+result.casa.numero;
  $('redCount').textContent=result.totalActivas;
  $('redHouseStatus').textContent=result.bloqueada
   ?'Vivienda temporalmente restringida para reservar Casa Club.'
   :'Esta vivienda no tiene una suspensión vigente de Casa Club.';
  $('redThreshold').classList.toggle('blocked',result.bloqueada);
  $('redThreshold').textContent=result.bloqueada
   ?'Reserva bloqueada: '+result.totalActivas+' tarjetas rojas activas. Prohibido reservar hasta el '+date(result.bloqueadoHasta)+'.'
   :result.totalActivas>3
     ?'La suspensión anterior ya venció. Se aplicará una nueva si se registra otra tarjeta roja.'
     :'Se permite reservar si no hay otros impedimentos. La suspensión comienza al superar 3 tarjetas rojas activas (con la cuarta).';
  const historial=result.tarjetas||[];
  $('redHistory').innerHTML=historial.length?historial.map(t=>
   '<article class="red-item '+(t.activa?'active':'')+'">'+
    '<div><span class="chip '+(t.activa?'':'removed')+'">'+(t.activa?'ROJA ACTIVA':'RETIRADA')+'</span>'+
    '<small>Tarjeta #'+Number(t.id)+' · Asignada '+esc(date(t.asignadaEn))+
      (t.asignadaPor?' · Usuario '+Number(t.asignadaPor):'')+'</small>'+
    '<p>'+esc(t.motivo)+'</p>'+
    (!t.activa?'<small>Retirada '+esc(date(t.retiradaEn))+
      ' · Motivo: '+esc(t.motivoRetiro||'No registrado')+
      (t.retiradaPor?' · Usuario '+Number(t.retiradaPor):'')+'</small>':'')+
   '</div><div class="item-actions">'+(t.activa?'<button type="button" data-retirar="'+Number(t.id)+'">Retirar tarjeta</button>':'')+'</div></article>'
  ).join(''):'<p>Esta vivienda no tiene tarjetas rojas registradas.</p>';
 }
 async function loadHouse(id){
  if(!id){$('redHousePanel').hidden=true;selected=null;return;}
  const d=await get('/casas/'+Number(id));
  paint(d);
 }
 $('redStreet').addEventListener('change',fillNumbers);
 $('redHouse').addEventListener('change',()=>loadHouse($('redHouse').value).catch(e=>setStatus(e.message,true)));
 $('redRefresh').addEventListener('click',()=>selected&&loadHouse(selected.casaId).catch(e=>setStatus(e.message,true)));
 $('redAddForm').addEventListener('submit',async e=>{
  e.preventDefault();if(working||!selected)return;
  const motivo=$('redReason').value.trim();
  if(motivo.length<5)return setStatus('Escribe un motivo claro, de al menos 5 caracteres.',true);
  working=true;const btn=e.currentTarget.querySelector('[type=submit]');btn.disabled=true;
  try{
   await get('/casas/'+selected.casaId,{method:'POST',body:{motivo}});
   $('redReason').value='';
   await loadHouse(selected.casaId);
   setStatus('Tarjeta roja registrada correctamente.');
  }catch(err){setStatus(err.message,true);}
  finally{working=false;btn.disabled=false;}
 });
 const removeDialog=$('redRemoveDialog');
 $('redHistory').addEventListener('click',e=>{
  const btn=e.target.closest('[data-retirar]');
  if(!btn||!selected)return;
  cardToRemove=Number(btn.dataset.retirar);
  $('redRemoveReason').value='';removeDialog.showModal();
 });
 $('redRemoveClose').addEventListener('click',()=>removeDialog.close());
 $('redRemoveCancel').addEventListener('click',()=>removeDialog.close());
 $('redRemoveForm').addEventListener('submit',async e=>{
  e.preventDefault();if(working||!cardToRemove||!selected)return;
  const motivoRetiro=$('redRemoveReason').value.trim();
  if(motivoRetiro.length<5)return setStatus('Escribe por qué debe retirarse la tarjeta.',true);
  working=true;const btn=e.currentTarget.querySelector('[type=submit]');btn.disabled=true;
  try{
   await get('/'+cardToRemove+'/retirar',{method:'PATCH',body:{motivoRetiro}});
   removeDialog.close();cardToRemove=null;
   await loadHouse(selected.casaId);
   setStatus('Tarjeta retirada. Su historial permanece visible.');
  }catch(err){setStatus(err.message,true);}
  finally{working=false;btn.disabled=false;}
 });
 $('redConfigForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!admin()||working)return;
  const anos=Number($('redYears').value);
  if(!Number.isInteger(anos)||anos<1||anos>20)return setStatus('Selecciona de 1 a 20 años.',true);
  working=true;const btn=e.currentTarget.querySelector('[type=submit]');btn.disabled=true;
  try{
   const d=await get('/configuracion',{method:'PATCH',body:{aniosBloqueo:anos}});
   setStatus('Configuración guardada: '+d.aniosBloqueo+' año(s). Suspensiones vigentes actualizadas: '+d.bloqueosAjustados+'.');
   if(selected)await loadHouse(selected.casaId);
  }catch(err){setStatus(err.message,true);}
  finally{working=false;btn.disabled=false;}
 });
 if(!token){location.replace('login.html');return;}
 try{
  const r=await fetch(auth+'/auth/perfil',{headers:headers(),cache:'no-store'});
  const d=await r.json();
  role=d.usuario?.rol?.nombre||d.usuario?.rol||'';
  if(!r.ok||!d.ok||!staff.includes(role))throw Error('Solo Seguridad y Administración pueden administrar tarjetas rojas.');
  $('redConfigSection').hidden=!admin();
  $('redReturnClub').hidden=!admin();
  $('redReturnSecurity').hidden=admin();
  const [config,casas]=await Promise.all([get('/configuracion'),get('/viviendas')]);
  $('redYears').value=config.aniosBloqueo;
  homes=casas;fillStreets();
  const id=Number(new URLSearchParams(location.search).get('casa'));
  const inicial=homes.find(x=>x.id===id);
  if(inicial){
   $('redStreet').value=inicial.calle;fillNumbers();
   $('redHouse').value=String(id);await loadHouse(id);
  }
 }catch(err){setStatus(err.message,true);}
})();
