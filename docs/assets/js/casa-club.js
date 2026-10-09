(async()=>{
 if(!await window.MJAccessReady)return;
 const API=window.MJ_API_URL||'https://api-misionjardines.listoenlinea.host/api';
 const $=id=>document.getElementById(id);
 const token=localStorage.getItem('misionJardinesToken')||sessionStorage.getItem('misionJardinesToken');
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=v=>Number(v||0).toLocaleString('es-MX',{style:'currency',currency:'MXN'});
 const fmt=d=>new Intl.DateTimeFormat('es-MX',{year:'numeric',month:'long',day:'numeric',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));
 const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 const user=(()=>{try{return JSON.parse(localStorage.getItem('misionJardinesUsuario')||sessionStorage.getItem('misionJardinesUsuario')||'{}')}catch{return {}}})();
 const role=user?.rol?.nombre||user?.rol;
 const admin=['SUPER_ADMIN','ADMINISTRADOR'].includes(role);
 let currentMonth=today().slice(0,7),selectedDate='',occupied=new Map(),profile=null,adminRows=[],activeReview=null,activeTab='reservar';
 const headers=(json=false)=>({Authorization:'Bearer '+token,...(sessionStorage.getItem('mjCasaSeleccionada')?{'X-Casa-Id':sessionStorage.getItem('mjCasaSeleccionada')}:{}) ,...(json?{'Content-Type':'application/json'}:{})});
 async function api(path,method='GET',body){
  const r=await fetch(API+'/casa-club'+path,{method,headers:headers(!!body),...(body?{body:JSON.stringify(body)}:{})});
  const d=await r.json().catch(()=>({}));
  if(r.status===401){location.replace('login.html');throw Error('Sesión expirada');}
  if(!r.ok||!d.ok)throw Error(d.message||'No fue posible realizar la operación');
  return d;
 }
 const notify=(msg,bad=false)=>{const el=$('clubNotice');el.textContent=msg;el.style.borderColor=bad?'#f2caca':'#d9e9dd';el.style.background=bad?'#fff2f3':'#f2faf5';el.hidden=false;window.scrollTo({top:0,behavior:'smooth'});};
 function tab(name){
  activeTab=name;
  document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-current',b.dataset.tab===name?'page':'false'));
  document.querySelectorAll('.club-panel').forEach(x=>x.hidden=x.id!=='tab-'+name);
  if(name==='mis-reservas')void mine();
  if(name==='administracion')void adminList();
  if(name==='aprobacion')void adminList();
 }
 document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>tab(b.dataset.tab)));
 if(admin)document.querySelectorAll('[data-admin]').forEach(x=>x.hidden=false);
 function monthShift(offset){
  const [y,m]=currentMonth.split('-').map(Number);
  const dt=new Date(Date.UTC(y,m-1+offset,1));
  currentMonth=dt.toISOString().slice(0,7);
  selectedDate='';$('clubDate').value='';
  void calendar();
 }
 $('prevMonth').addEventListener('click',()=>monthShift(-1));
 $('nextMonth').addEventListener('click',()=>monthShift(1));
 async function calendar(){
  const [year,month]=currentMonth.split('-').map(Number);
  const start=currentMonth+'-01',end=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
  const response=await api('/fechas?desde='+start+'&hasta='+end);
  occupied=new Map(response.ocupadas.map(x=>[x.fecha,x.estatus]));
  $('calendarLabel').textContent=new Intl.DateTimeFormat('es-MX',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(start+'T12:00:00Z'));
  $('prevMonth').disabled=start.slice(0,7)<=today().slice(0,7);
  const days=$('calendarDays');days.replaceChildren();
  const offset=(new Date(Date.UTC(year,month-1,1)).getUTCDay()+6)%7;
  for(let n=0;n<offset;n++){let gap=document.createElement('div');gap.className='calendar-blank';days.append(gap);}
  for(let n=1;n<=new Date(Date.UTC(year,month,0)).getUTCDate();n++){
   const date=currentMonth+'-'+String(n).padStart(2,'0'),status=occupied.get(date),past=date<today();
   const btn=document.createElement('button');btn.type='button';
   btn.className=past?'past':status==='APROBADA'?'booked':status?'waiting':'available';
   if(date===selectedDate)btn.classList.add('selected');
   btn.disabled=Boolean(status)||past;
   btn.setAttribute('aria-label',fmt(date)+' · '+(past?'Fecha pasada':status==='APROBADA'?'Reservada':status?'Pendiente de aprobación':'Disponible'));
   const day=document.createElement('span');day.textContent=n;const sub=document.createElement('small');
   sub.textContent=past?'Pasada':status==='APROBADA'?'Reservada':status?'En revisión':'Libre';
   btn.append(day,sub);btn.addEventListener('click',()=>{selectedDate=date;$('clubDate').value=fmt(date);days.querySelectorAll('button').forEach(x=>x.classList.remove('selected'));btn.classList.add('selected');});
   days.append(btn);
  }
 }
 function homeText(r){return r?.casa?((r.casa.calleCorrecta||r.casa.calle)+' · Casa '+r.casa.numero):'Sin vivienda';}
 function statusBadge(status){return '<span class="state-pill '+esc(status)+'">'+esc(({PENDIENTE:'Pendiente',APROBADA:'Aprobada',RECHAZADA:'Rechazada',CANCELADA:'Cancelada'})[status]||status)+'</span>';}
 $('clubForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!selectedDate)return notify('Selecciona una fecha disponible del calendario.',true);
  const button=$('clubSubmit');button.disabled=true;
  const values={fecha:selectedDate,casaId:profile?.casa?.id,solicitante:$('clubName').value.trim(),telefono:$('clubPhone').value.trim(),correo:$('clubEmail').value.trim(),propietario:$('clubOwner').value==='SI',motivo:$('clubReason').value.trim()};
  try{await api('/reservas','POST',values);notify('Solicitud enviada. La fecha está apartada provisionalmente hasta revisión de Administración.');$('clubForm').reset();$('clubDate').value='';selectedDate='';await calendar();tab('mis-reservas');}
  catch(err){notify(err.message,true);await calendar();}
  finally{button.disabled=false;}
 });
 async function mine(){
  try{const d=await api('/mias');const host=$('myReservations');host.innerHTML=d.data.length?d.data.map(r=>
   '<article class="reserve-card"><h3>'+esc(fmt(r.fecha))+'</h3>'+statusBadge(r.estatus)+
   '<p><b>'+esc(r.solicitante)+'</b> · '+esc(homeText(r))+'</p><p>'+esc(r.motivo)+' · '+(r.pagado?'Pago registrado':'Pago sin confirmar')+'</p>'+
   '<footer><small>Reserva #'+Number(r.id)+'</small>'+(['PENDIENTE','APROBADA'].includes(r.estatus)?'<button type="button" class="danger" data-cancel="'+Number(r.id)+'">Cancelar</button>':'')+'</footer></article>').join(''):'<div class="reserve-card">Todavía no tienes reservas registradas.</div>';
  }catch(e){notify(e.message,true);}
 }
 $('myReservations').addEventListener('click',async e=>{
  const btn=e.target.closest('[data-cancel]');if(!btn||!confirm('¿Cancelar esta reserva? Si ya se pagó, Administración deberá revisar cualquier devolución.'))return;
  btn.disabled=true;try{await api('/reservas/'+Number(btn.dataset.cancel)+'/cancelar','PATCH');notify('Reserva cancelada.');await Promise.all([mine(),calendar()]);}catch(err){notify(err.message,true);btn.disabled=false;}
 });
 function editReview(r){
  activeReview=r;$('clubReviewTitle').textContent='Revisión · '+fmt(r.fecha);
  $('clubReviewDetails').textContent=r.solicitante+' · '+homeText(r)+' · '+r.telefono+' · '+r.motivo;
  $('clubRecovery').value='700';$('clubGuarantee').value='700';$('clubCleaning').value='300';$('clubPaid').checked=false;$('clubNotes').value='';
  $('clubReviewModal').showModal();
 }
 $('closeClubReview').addEventListener('click',()=>$('clubReviewModal').close());
 $('clubReviewForm').addEventListener('submit',e=>{e.preventDefault();void review('APROBAR');});
 $('clubReject').addEventListener('click',()=>void review('RECHAZAR'));
 async function review(action){
  if(!activeReview)return;
  if(!confirm((action==='APROBAR'?'Aprobar':'Rechazar')+' reservación de '+activeReview.solicitante+' para '+fmt(activeReview.fecha)+'?'))return;
  const info={accion:action,cuotaRecuperacion:Number($('clubRecovery').value),depositoGarantia:Number($('clubGuarantee').value),limpieza:Number($('clubCleaning').value),pagado:$('clubPaid').checked,notas:$('clubNotes').value};
  $('clubApprove').disabled=$('clubReject').disabled=true;
  try{await api('/administracion/'+Number(activeReview.id),'PATCH',info);$('clubReviewModal').close();notify('Reserva revisada correctamente.');await Promise.all([adminList(),calendar()]);}
  catch(err){notify(err.message,true);}
  finally{activeReview=null;$('clubApprove').disabled=$('clubReject').disabled=false;}
 }
 const mon=d=>new Intl.DateTimeFormat('es-MX',{month:'long',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));
 async function adminList(){
  if(!admin)return;
  try{
   const d=await api('/administracion');adminRows=[...(d.data||[])].sort((a,b)=>String(a.casa?.calleCorrecta||a.casa?.calle||'').localeCompare(String(b.casa?.calleCorrecta||b.casa?.calle||''),'es-MX',{numeric:true,sensitivity:'base'})||String(a.casa?.numero||'').localeCompare(String(b.casa?.numero||''),'es-MX',{numeric:true})||String(a.fecha||'').localeCompare(String(b.fecha||'')));
   let paid=adminRows.filter(r=>r.pagado&&r.estatus==='APROBADA');
   let income=paid.reduce((a,r)=>a+Number(r.cuotaRecuperacion),0),
       guarantee=paid.reduce((a,r)=>a+Number(r.depositoGarantia),0),
       cleaning=paid.reduce((a,r)=>a+Number(r.limpieza),0);
   $('clubTotals').innerHTML=[['Total de reservas',adminRows.length],['Reservas aprobadas',adminRows.filter(r=>r.estatus==='APROBADA').length],['Recuperación cobrada',money(income)],['Garantías recibidas',money(guarantee)],['Limpieza cobrada',money(cleaning)]].map(([name,value])=>'<div class="stat"><small>'+esc(name)+'</small><strong>'+esc(value)+'</strong></div>').join('');
   const tableRows=adminRows.filter(r=>r.estatus==='APROBADA' && (r.pagado || $('includeUnpaid').checked));
   $('clubAdminRows').innerHTML=tableRows.map(r=>'<tr>'+
    [r.casa?.numero,r.casa?.calleCorrecta||r.casa?.calle,r.telefono,mon(r.fecha),fmt(r.fecha),money(r.cuotaRecuperacion),r.folio||'—',money(r.depositoGarantia)+(r.garantiaDevuelta?' · Devuelta':''),money(r.limpieza),r.solicitante,r.propietario?'Sí':'No',r.pagado?'PAGADO':'PENDIENTE',r.notas||'—',r.estatus].map(v=>'<td>'+esc(v)+'</td>').join('')+
    '<td>'+(r.estatus==='APROBADA'?'<button type="button" class="soft" data-paid="'+Number(r.id)+'">'+(r.pagado?'Editar pago':'Registrar pago')+'</button> <button type="button" class="soft" data-return="'+Number(r.id)+'">'+(r.garantiaDevuelta?'Garantía devuelta':'Devolver garantía')+'</button>':'—')+'</td></tr>').join('')||'<tr><td colspan="15">Aún no hay reservas registradas.</td></tr>';
   $('clubRequests').innerHTML=adminRows.filter(r=>r.estatus==='PENDIENTE').map(r=>
    '<article class="reserve-card"><h3>'+esc(fmt(r.fecha))+'</h3>'+statusBadge(r.estatus)+
    '<p><b>'+esc(r.solicitante)+'</b> · '+esc(homeText(r))+'</p><p>'+esc(r.motivo)+' · '+esc(r.telefono)+'</p>'+
    '<button type="button" class="primary" data-review="'+Number(r.id)+'">Revisar solicitud</button></article>').join('')||'<div class="reserve-card">No hay solicitudes pendientes de aprobación.</div>';
  }catch(e){notify(e.message,true);}
 }
 $('clubRequests').addEventListener('click',e=>{const btn=e.target.closest('[data-review]');if(btn){const r=adminRows.find(x=>Number(x.id)===Number(btn.dataset.review));if(r)editReview(r);}});
 $('clubAdminRows').addEventListener('click',async e=>{
  const refund=e.target.closest('[data-return]');
  if(refund){
    const r=adminRows.find(x=>Number(x.id)===Number(refund.dataset.return));
    if(!r)return;
    if(!confirm('¿Confirmas cambiar el estado de devolución de la garantía de '+r.solicitante+'?'))return;
    refund.disabled=true;
    try{await api('/administracion/'+Number(r.id),'PATCH',{accion:'GARANTIA',garantiaDevuelta:!r.garantiaDevuelta});notify('Estado de garantía actualizado.');await adminList();}
    catch(err){notify(err.message,true);}
    finally{refund.disabled=false;}
    return;
  }
  const b=e.target.closest('[data-paid]');if(!b)return;
  const r=adminRows.find(x=>Number(x.id)===Number(b.dataset.paid));if(!r)return;
  const folio=prompt('Folio de pago verificado (puede quedar vacío):',r.folio||'');if(folio===null)return;
  const ok=confirm(r.pagado?'¿Marcar este pago como pendiente?':'¿Confirmas que el pago aparece en la cuenta bancaria?');
  if(!ok)return;
  b.disabled=true;
  try{await api('/administracion/'+Number(r.id),'PATCH',{accion:'PAGO',pagado:!r.pagado,folio});notify('Movimiento registrado.');await adminList();}
  catch(err){notify(err.message,true);}
  finally{b.disabled=false;}
 });
 $('includeUnpaid').addEventListener('change',adminList);
 $('refreshMine').addEventListener('click',mine);
 $('refreshAdmin').addEventListener('click',adminList);$('refreshReview').addEventListener('click',adminList);
 try{
  const response=await fetch(API+'/auth/perfil',{headers:headers()});
  const d=await response.json();
  if(!response.ok||!d.ok)throw Error(d.message||'No se pudo consultar tu vivienda');
  profile=d.usuario;$('clubName').value=[profile.nombre,profile.apellidoPaterno,profile.apellidoMaterno].filter(Boolean).join(' ');
  $('clubPhone').value=profile.telefono||'';$('clubEmail').value=profile.correo||'';
  $('clubHouse').value=profile.casa?homeText({casa:profile.casa}):'Selecciona una vivienda en el menú';
  if(!profile.casa){$('clubSubmit').disabled=true;}
  await calendar();
 }catch(e){notify(e.message,true);}
 tab('reservar');
})();
