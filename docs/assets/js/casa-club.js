(async()=>{
 const API=window.MJ_API_URL||'https://api-misionjardines.listoenlinea.host/api';
 const $=id=>document.getElementById(id);
 const token=localStorage.getItem('misionJardinesToken')||sessionStorage.getItem('misionJardinesToken');
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=v=>Number(v||0).toLocaleString('es-MX',{style:'currency',currency:'MXN',minimumFractionDigits:0,maximumFractionDigits:0});
 const fmt=d=>window.MJDateDisplay.format(d);
 const fechaSolicitud=d=>d?new Date(d).toLocaleString('es-MX',{timeZone:'America/Mexico_City',dateStyle:'short',timeStyle:'short'}):'—';
 const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 let profile=null,admin=false;
 let currentMonth=today().slice(0,7),selectedDate='',occupied=new Map(),adminRows=[],activeReview=null;
 let calendarRequest=0,submitting=false,calendarReady=false;
 const tomorrow=()=>new Date(Date.parse(today()+'T12:00:00Z')+86400000).toISOString().slice(0,10);
 const lastDay=()=>new Date(Date.parse(today()+'T12:00:00Z')+365*86400000).toISOString().slice(0,10);
 const whatsappValido=value=>/^(?:52)?[0-9]{10}$/.test(value.replace(/[\s()+-]/g,''));
 const canSubmit=()=>!submitting&&calendarReady&&Boolean(selectedDate)&&!(profile&&!profile.casa)
  &&(admin||(whatsappValido($('clubPhone').value)&&$('clubOptIn').checked));
 const syncSubmit=()=>{$('clubSubmit').disabled=!canSubmit();};
 $('clubPhone').addEventListener('input',syncSubmit);
 $('clubPhone').addEventListener('change',syncSubmit);
 $('clubOptIn').addEventListener('change',syncSubmit);
 const headers=(json=false)=>({Authorization:'Bearer '+token,...(sessionStorage.getItem('mjCasaSeleccionada')?{'X-Casa-Id':sessionStorage.getItem('mjCasaSeleccionada')}:{}) ,...(json?{'Content-Type':'application/json'}:{})});
 async function api(path,method='GET',body){
  const publico=path.startsWith('/publico/');
  const r=await fetch(API+'/casa-club'+path,{method,headers:publico?(body?{'Content-Type':'application/json'}:{}):headers(!!body),...(body?{body:JSON.stringify(body)}:{})});
  const d=await r.json().catch(()=>({}));
  if(r.status===401&&!publico){location.replace('login.html');throw Error('Sesión expirada');}
  if(!r.ok||!d.ok){
   const err=Error(d.message||'No fue posible realizar la operación');
   err.codigo=d.codigo||null;err.adeudos=d.adeudos||null;
   throw err;
  }
  return d;
 }
 const notify=(msg,bad=false)=>{const el=$('clubNotice');el.textContent=msg;el.style.borderColor=bad?'#f2caca':'#d9e9dd';el.style.background=bad?'#fff2f3':'#f2faf5';el.hidden=false;window.scrollTo({top:0,behavior:'smooth'});};
 const debtDialog=$('clubDebtModal');
 const debtNames={MANTENIMIENTO:'Mantenimiento',EXTRAORDINARIO:'Cuotas extraordinarias'};
 const monthNames=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
 const monthPeriod=p=>{
  const m=/^(\d{4})-(0[1-9]|1[0-2])(?:-\d{2})?$/.exec(String(p||''));
  return m?monthNames[Number(m[2])-1]+' '+m[1]:String(p||'');
 };
 function showDebtAlert(error){
  if(error.codigo!=='ADEUDOS_RESERVA'||!error.adeudos)return false;
  const adeudos=error.adeudos;
  $('clubDebtExplanation').textContent='Esta vivienda no puede solicitar ni obtener aprobación de una reserva hasta cubrir los adeudos de mantenimiento o cuotas extraordinarias. Los cargos de Casa club no intervienen en esta restricción.';
  $('clubDebtSummary').innerHTML=['MANTENIMIENTO','EXTRAORDINARIO'].map(tipo=>
   '<div class="club-debt-stat '+(tipo==='MANTENIMIENTO'?'maintenance':'extra')+'"><small>'+debtNames[tipo]+'</small><strong>'+esc(money(adeudos.totales?.[tipo]))+'</strong></div>'
  ).join('')+'<div class="club-debt-total"><span>Total por regularizar</span><strong>'+esc(money(adeudos.total))+'</strong></div>';
  const rows=['MANTENIMIENTO','EXTRAORDINARIO'].flatMap(tipo=>(adeudos.tipos?.[tipo]||[]).map(item=>({tipo,...item})));
  $('clubDebtDetails').innerHTML=rows.length?'<h3>Desglose de los adeudos</h3>'+rows.map(item=>
   '<div class="club-debt-item"><div><b>'+esc(debtNames[item.tipo])+'</b><small>'+esc(monthPeriod(item.periodo))+
   (item.tipo==='EXTRAORDINARIO'&&item.concepto?' · '+esc(item.concepto):'')+'</small></div><div><strong>'+esc(money(item.monto))+'</strong>'+
   (Number(item.recargo)>0?'<small>Incluye '+esc(money(item.recargo))+' de recargo por atraso</small>':'')+'</div></div>'
  ).join(''):'<p>Consulta el saldo actualizado en Pagos.</p>';
  debtDialog.showModal();
  return true;
 }
 const closeDebt=()=>debtDialog.close();
 $('closeClubDebt').addEventListener('click',closeDebt);
 $('ackClubDebt').addEventListener('click',closeDebt);
 function tab(name){
  document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-current',b.dataset.tab===name?'page':'false'));
  document.querySelectorAll('.club-panel').forEach(x=>x.hidden=x.id!=='tab-'+name);
  if(name==='mis-reservas')void mine();
  if(name==='administracion')void adminList();
  if(name==='aprobacion')void adminList();
 }
 document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>tab(b.dataset.tab)));
 function monthShift(offset){
  const [y,m]=currentMonth.split('-').map(Number);
  const dt=new Date(Date.UTC(y,m-1+offset,1));
  currentMonth=dt.toISOString().slice(0,7);
  selectedDate='';$('clubDate').value='';
  void calendar().catch(e=>notify(e.message,true));
 }
 $('prevMonth').addEventListener('click',()=>monthShift(-1));
 $('nextMonth').addEventListener('click',()=>monthShift(1));
 async function calendar(){
  const [year,month]=currentMonth.split('-').map(Number);
  const start=currentMonth+'-01',end=new Date(Date.UTC(year,month,0)).toISOString().slice(0,10);
  const request=++calendarRequest;
  calendarReady=false;syncSubmit();
  $('calendarDays').replaceChildren();
  const response=await api('/publico/fechas?desde='+start+'&hasta='+end);
  if(request!==calendarRequest)return;
  calendarReady=true;
  $('nextMonth').disabled=!admin&&currentMonth>=lastDay().slice(0,7);
  occupied=new Map(response.ocupadas.map(x=>[x.fecha,x.estatus]));
  $('calendarLabel').textContent=new Intl.DateTimeFormat('es-MX',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(start+'T12:00:00Z'));
  $('prevMonth').disabled=start.slice(0,7)<=today().slice(0,7);
  if(occupied.has(selectedDate)){selectedDate='';$('clubDate').value='';}
  syncSubmit();
  const days=$('calendarDays');
  const offset=(new Date(Date.UTC(year,month-1,1)).getUTCDay()+6)%7;
  for(let n=0;n<offset;n++){let gap=document.createElement('div');gap.className='calendar-blank';days.append(gap);}
  for(let n=1;n<=new Date(Date.UTC(year,month,0)).getUTCDate();n++){
   const date=currentMonth+'-'+String(n).padStart(2,'0'),status=occupied.get(date),past=admin?date<today():date<tomorrow()||date>lastDay();
   const btn=document.createElement('button');btn.type='button';
   btn.className=past?'past':status==='APROBADA'?'booked':status?'waiting':'available';
   if(date===selectedDate)btn.classList.add('selected');
   btn.disabled=Boolean(status)||past;
   btn.setAttribute('aria-label',fmt(date)+' · '+(past?'No disponible':status==='APROBADA'?'Reservada':status?'Pendiente de aprobación':'Disponible'));
   btn.textContent=n;
   btn.addEventListener('click',()=>{selectedDate=date;$('clubDate').value=fmt(date);days.querySelectorAll('button').forEach(x=>x.classList.remove('selected'));btn.classList.add('selected');syncSubmit();});
   days.append(btn);
  }
 }
 function homeText(r){return r?.casa?((r.casa.calleCorrecta||r.casa.calle)+' · Casa '+r.casa.numero):'Sin vivienda';}
 function statusBadge(status){return '<span class="state-pill '+esc(status)+'">'+esc(({PENDIENTE:'Pendiente',APROBADA:'Aprobada',RECHAZADA:'Rechazada',CANCELADA:'Cancelada'})[status]||status)+'</span>';}
 function showPayment(result){
  const p=result.pago, host=$('clubPaymentDetails');
  host.replaceChildren();
  const rows=[
   ['Fecha apartada',fmt(result.fecha)+' · '+p.folio],
   ['Pago de recuperación',money(p.cuotaRecuperacion)],
   ['Depósito de garantía',money(p.depositoGarantia)],
   ['Limpieza',money(p.limpieza)],
   ['Total a depositar',money(p.monto)],
   ['Banco y cuenta/CLABE',p.banco+' · '+p.cuenta],
   ['Titular',p.titular],
   ['Fecha límite de pago',fmt(p.fechaLimitePago)+' (hora de Guadalajara)'],
   ['Comprobante','Sube tu comprobante en Pagos → Casa Club con la reserva '+p.folio+'. Titan aprobará automáticamente la fecha tras confirmar el depósito.']
  ];
  const h=document.createElement('strong');h.textContent='Instrucciones de depósito';host.append(h);
  for(const [nombre,valor] of rows){const line=document.createElement('p');line.textContent=nombre+': '+valor;host.append(line);}
  const noEnviados=[['correo','correo'],['whatsapp','WhatsApp'],['administracion','correo a Administración']]
   .filter(([k])=>!result.notificaciones[k]).map(([,label])=>label);
  if(noEnviados.length){const warning=document.createElement('p');warning.textContent='No se pudo confirmar el envío por: '+noEnviados.join(', ')+'. Guarda estas instrucciones.';host.append(warning);}
  if(Number.isSafeInteger(Number(result.id))&&Number(result.id)>0){
   const action=document.createElement('a');
   action.className='primary club-upload-link';
   action.href='pagos.html?tab=CASA_CLUB&reserva='+Number(result.id);
   action.textContent=profile?'Subir comprobante y confirmar fecha':'Inicia sesión para subir tu comprobante';
   host.append(action);
   if(!profile){
    const note=document.createElement('p');
    note.textContent='Para usar la validación automática necesitas una cuenta vinculada a esta vivienda. Solicita acceso a Administración si no lo tienes.';
    host.append(note);
   }
  }
  host.hidden=false;
 }
 $('clubForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!canSubmit())return;
  submitting=true;syncSubmit();
  const values={fecha:selectedDate,calle:$('clubStreet').value.trim(),numero:$('clubNumber').value.trim(),
   solicitante:$('clubName').value.trim(),telefono:$('clubPhone').value.trim(),correo:$('clubEmail').value.trim(),
   propietario:$('clubOwner').value==='SI',motivo:$('clubReason').value.trim(),aceptaWhatsApp:$('clubOptIn').checked};
  try{
   const result=await api(profile?'/reservas':'/publico/solicitudes','POST',values);
   if(result.data?.pago)showPayment(result.data);
   notify(result.data?.estatus==='APROBADA'?'Reserva confirmada. El pago se registra por separado.':
    'Fecha apartada. Sube el comprobante en Pagos para aprobación automática por Titan; sin pago, Administración podrá revisar la solicitud.');
   $('clubForm').reset();$('clubDate').value='';selectedDate='';fillProfile();
   if(admin)tab('mis-reservas');
  }catch(err){if(!showDebtAlert(err))notify(err.message,true);}
  finally{submitting=false;await calendar().catch(e=>notify(e.message,true));syncSubmit();}
 });
 async function mine(){
  try{const d=await api('/mias');const host=$('myReservations');host.innerHTML=d.data.length?d.data.map(r=>
   '<article class="reserve-card"><h3>'+esc(fmt(r.fecha))+'</h3>'+statusBadge(r.estatus)+
   '<p><b>'+esc(r.solicitante)+'</b> · '+esc(homeText(r))+'</p><p>'+esc(r.motivo)+' · '+(r.pagado?'Pago bancario confirmado':r.comprobanteEnRevision?'Comprobante en revisión por Titan':r.estatus==='PENDIENTE'?'Pendiente de pago o de aprobación administrativa':'Pago sin confirmar')+'</p>'+
   ((r.estatus==='APROBADA'||(r.estatus==='PENDIENTE'&&r.fechaLimitePago))?'<div class="club-bill"><strong>'+(r.pagado?'Importes confirmados':'Paga a más tardar el '+esc(r.fechaLimitePago||'plazo indicado'))+'</strong>'+
    '<p>Renta: '+money(r.cuotaRecuperacion)+'</p><p>Depósito de garantía: '+money(r.depositoGarantia)+'</p><p>Limpieza: '+money(r.limpieza)+'</p><strong>Total: '+money(Number(r.cuotaRecuperacion)+Number(r.depositoGarantia)+Number(r.limpieza))+'</strong>'+
    (!r.pagado&&!r.comprobanteEnRevision?'<p><a href="pagos.html?tab=CASA_CLUB&reserva='+Number(r.id)+'" class="primary club-upload-link">Subir comprobante y confirmar fecha</a></p>':r.comprobanteEnRevision?'<p>Tu comprobante está en revisión bancaria. No lo subas de nuevo.</p>':'')+'</div>':'')+
   '<footer><small>Reserva #'+Number(r.id)+'</small>'+(['PENDIENTE','APROBADA'].includes(r.estatus)?'<button type="button" class="danger" data-cancel="'+Number(r.id)+'">Cancelar</button>':'')+'</footer></article>').join(''):'<div class="reserve-card">Todavía no tienes reservas registradas.</div>';
  }catch(e){notify(e.message,true);}
 }
 $('myReservations').addEventListener('click',async e=>{
  const btn=e.target.closest('[data-cancel]');if(!btn||!confirm('¿Cancelar esta reserva? Si ya se pagó, Administración deberá revisar cualquier devolución.'))return;
  btn.disabled=true;try{await api('/reservas/'+Number(btn.dataset.cancel)+'/cancelar','PATCH');notify('Reserva cancelada.');await Promise.all([mine(),calendar()]);}catch(err){notify(err.message,true);btn.disabled=false;}
 });
 const reviewModal=$('clubReviewModal');
 const paymentStatus=r=>r.pagado?'Pagado':(['PENDIENTE','APROBADA'].includes(r.estatus)?'Pendiente de pago':'Sin pago');
 const folioValido=()=>/^[a-z0-9-]{3,60}$/i.test($('clubBankFolio').value.trim());
 let reviewing=false;
 const syncReview=()=>{
  $('clubApprove').disabled=reviewing||($('clubPaymentVerified').checked&&!folioValido());
  $('clubApprove').textContent=$('clubPaymentVerified').checked?'Confirmar pago manual y aprobar':'Aprobar fecha sin registrar pago';
  $('clubReject').disabled=reviewing;
 };
 async function loadReviewWhatsApp(r){
  const link=$('clubReviewWhatsApp'),status=$('clubReviewWhatsAppStatus');
  link.hidden=true;link.removeAttribute('href');status.hidden=true;
  if(!['PENDIENTE','APROBADA'].includes(r.estatus))return;
  status.textContent='Preparando mensaje de WhatsApp…';status.hidden=false;
  try{
   const d=await api('/administracion/'+Number(r.id)+'/whatsapp');
   if(!reviewModal.open||activeReview!==r)return;
   link.href='https://wa.me/'+d.telefono+'?text='+encodeURIComponent(d.mensaje);
   link.textContent=d.tipo==='CONFIRMACION'?'Enviar confirmación por WhatsApp':'Enviar instrucciones por WhatsApp';
   link.hidden=false;status.hidden=true;
  }catch(e){if(reviewModal.open&&activeReview===r)status.textContent=e.message;}
 }
 function editReview(r){
  activeReview=r;$('clubReviewTitle').textContent='Reservación CC-'+r.id+' · '+fmt(r.fecha);
  const detalles=[
   ['Nombre',r.solicitante],['Vivienda',homeText(r)],['WhatsApp',r.telefono],['Correo',r.correo],
   ['Propietario',r.propietario?'Sí':'No'],['Motivo del evento',r.motivo],
   ['Solicitud recibida',fechaSolicitud(r.creadoEn)+' (Guadalajara)'],
   ['Estado de la reserva',({PENDIENTE:'Solicitud pendiente',APROBADA:'Confirmada',CANCELADA:'Cancelada',RECHAZADA:'Rechazada'})[r.estatus]],
   ['Estado del pago',paymentStatus(r)],['Renta',money(r.cuotaRecuperacion)],['Garantía',money(r.depositoGarantia)],
   ['Limpieza',money(r.limpieza)],['Total del depósito',money(Number(r.cuotaRecuperacion)+Number(r.depositoGarantia)+Number(r.limpieza))],
   ['Fecha límite de pago',r.fechaLimitePago&&fmt(r.fechaLimitePago)],['Fecha de pago',r.fechaPago&&fmt(r.fechaPago)],
   ['Folio de pago',r.folio],['Observaciones',r.notas]
  ];
  $('clubReviewDetails').innerHTML=detalles.map(([label,value])=>'<div><dt>'+esc(label)+'</dt><dd>'+esc(value||'—')+'</dd></div>').join('');
  $('clubReviewActions').hidden=r.estatus!=='PENDIENTE';
  $('clubRelease').hidden=!admin||r.estatus!=='APROBADA';
  $('clubNotes').value=r.notas||'';$('clubPaymentVerified').checked=false;$('clubBankFolio').value='';
  $('clubReviewError').hidden=true;syncReview();
  if(!reviewModal.open)reviewModal.showModal();
  void loadReviewWhatsApp(r);
 }
 $('closeClubReview').addEventListener('click',()=>reviewModal.close());
 reviewModal.addEventListener('close',()=>{if(!reviewModal.open)activeReview=null;});
 $('clubPaymentVerified').addEventListener('change',syncReview);
 $('clubBankFolio').addEventListener('input',syncReview);
 $('clubReviewForm').addEventListener('submit',e=>{e.preventDefault();void review('APROBAR');});
 $('clubReject').addEventListener('click',()=>void review('RECHAZAR'));
 async function review(action){
  const r=activeReview,approve=action==='APROBAR';
  if(!r||r.estatus!=='PENDIENTE'||reviewing||(approve&&$('clubApprove').disabled))return;
  if(!confirm((approve?'Confirmar':'Rechazar')+' reservación de '+r.solicitante+' para '+fmt(r.fecha)+'?'))return;
  const info={accion:action,notas:$('clubNotes').value,pagoVerificado:$('clubPaymentVerified').checked,folio:$('clubBankFolio').value.trim()};
  const error=$('clubReviewError');error.hidden=true;
  reviewing=true;syncReview();
  try{
   await api('/administracion/'+Number(r.id),'PATCH',info);
   if(reviewModal.open&&activeReview===r)editReview({...r,estatus:approve?'APROBADA':'RECHAZADA',
    pagado:approve&&info.pagoVerificado,fechaPago:approve&&info.pagoVerificado?today():null,folio:approve&&info.pagoVerificado?info.folio:null,notas:info.notas});
   notify(approve?(info.pagoVerificado?'Pago manual registrado y reservación confirmada.':'Fecha aprobada sin pago. El residente podrá pagar desde Pagos.'):'Solicitud rechazada. La fecha se liberó.');
   await Promise.all([adminList(),calendar().catch(e=>notify(e.message,true))]);
  }catch(err){if(reviewModal.open&&activeReview===r){error.textContent=err.message;error.hidden=false;}}
  finally{reviewing=false;syncReview();}
 }
 async function liberarReserva(r){
  if(!admin||r.estatus!=='APROBADA')return;
  const motivo=prompt('Motivo de cancelación (mínimo 8 caracteres). Se conserva el historial de pagos:', '');
  if(motivo===null)return;
  if(motivo.trim().length<8){notify('Indica un motivo de al menos 8 caracteres.',true);return;}
  if(!confirm('¿Cancelar CC-'+r.id+' del '+fmt(r.fecha)+' y liberar ese día?'+
    (r.pagado?' El pago permanecerá registrado y su devolución requerirá conciliación.':'')))return;
  try{
   const d=await api('/administracion/'+Number(r.id)+'/liberar','PATCH',{motivo:motivo.trim()});
   if(reviewModal.open)reviewModal.close();
   notify(d.message+(d.pagoPendienteDeRevision?' Revisa la devolución del dinero.':'')+
    (!d.avisoCorreo?' No se confirmó el correo de aviso.':''));
   await Promise.all([adminList(),calendar()]);
  }catch(e){notify(e.message,true);}
 }
 $('clubRelease').addEventListener('click',()=>{if(activeReview)void liberarReserva(activeReview);});
 const mon=d=>new Intl.DateTimeFormat('es-MX',{month:'long',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));
 async function adminList(){
  if(!admin)return;
  try{
   const d=await api('/administracion');adminRows=[...(d.data||[])].sort((a,b)=>String(a.casa?.calleCorrecta||a.casa?.calle||'').localeCompare(String(b.casa?.calleCorrecta||b.casa?.calle||''),'es-MX',{numeric:true,sensitivity:'base'})||String(a.casa?.numero||'').localeCompare(String(b.casa?.numero||''),'es-MX',{numeric:true})||String(a.fecha||'').localeCompare(String(b.fecha||'')));
   // Una reserva cancelada NO equivale a devolver el pago: conservarlo en lo recaudado.
   let paid=adminRows.filter(r=>r.pagado);
   let income=paid.reduce((a,r)=>a+Number(r.cuotaRecuperacion),0),
       guarantee=paid.reduce((a,r)=>a+Number(r.depositoGarantia),0),
       cleaning=paid.reduce((a,r)=>a+Number(r.limpieza),0);
   $('clubTotals').innerHTML=[['Total de reservas',adminRows.length],['Reservas aprobadas',adminRows.filter(r=>r.estatus==='APROBADA').length],['Recuperación cobrada',money(income)],['Garantías recibidas',money(guarantee)],['Limpieza cobrada',money(cleaning)]].map(([name,value])=>'<div class="stat"><small>'+esc(name)+'</small><strong>'+esc(value)+'</strong></div>').join('');
   const tableRows=[...adminRows].sort((a,b)=>Number(b.estatus==='PENDIENTE')-Number(a.estatus==='PENDIENTE'));
   $('clubAdminRows').innerHTML=tableRows.map(r=>'<tr data-reserva="'+Number(r.id)+'">'+
    [r.casa?.numero,r.casa?.calleCorrecta||r.casa?.calle,r.telefono,mon(r.fecha),fmt(r.fecha),fechaSolicitud(r.creadoEn),money(r.cuotaRecuperacion),r.folio||'—',money(r.depositoGarantia)+(r.garantiaDevuelta?' · Devuelta':''),money(r.limpieza),r.solicitante,r.propietario?'Sí':'No',paymentStatus(r),r.notas||'—',r.estatus].map(v=>'<td>'+esc(v)+'</td>').join('')+
    '<td><button type="button" class="soft">Ver detalles</button> '+(r.estatus==='APROBADA'?' <button type="button" class="danger" data-release="'+Number(r.id)+'">Cancelar / liberar día</button> ':'')+(r.estatus==='APROBADA'?(r.pagado?'<span class="state-pill APROBADA">Pago confirmado</span>':'<button type="button" class="soft" data-paid="'+Number(r.id)+'">Registrar pago</button>')+' <button type="button" class="soft" data-return="'+Number(r.id)+'">'+(r.garantiaDevuelta?'Garantía devuelta':'Devolver garantía')+'</button>':'—')+'</td></tr>').join('')||'<tr><td colspan="16">Aún no hay reservas registradas.</td></tr>';
   $('clubRequests').innerHTML=adminRows.filter(r=>r.estatus==='PENDIENTE').map(r=>
    '<article class="reserve-card"><h3>'+esc(fmt(r.fecha))+'</h3>'+statusBadge(r.estatus)+
    '<p><b>'+esc(r.solicitante)+'</b> · '+esc(homeText(r))+'</p><p>Solicitud recibida: '+esc(fechaSolicitud(r.creadoEn))+' (Guadalajara)</p><p>'+esc(r.motivo)+' · '+esc(r.telefono)+'</p>'+
    '<button type="button" class="primary" data-review="'+Number(r.id)+'">Revisar solicitud</button></article>').join('')||'<div class="reserve-card">No hay solicitudes pendientes de aprobación.</div>';
  }catch(e){notify(e.message,true);}
 }
 $('clubRequests').addEventListener('click',e=>{const btn=e.target.closest('[data-review]');if(btn){const r=adminRows.find(x=>Number(x.id)===Number(btn.dataset.review));if(r)editReview(r);}});
 $('clubAdminRows').addEventListener('click',async e=>{
  const release=e.target.closest('[data-release]');
  if(release){const r=adminRows.find(x=>Number(x.id)===Number(release.dataset.release));if(r)void liberarReserva(r);return;}
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
  const b=e.target.closest('[data-paid]');
  if(!b){
   const row=e.target.closest('[data-reserva]'),r=adminRows.find(x=>Number(x.id)===Number(row?.dataset.reserva));
   if(r)editReview(r);
   return;
  }
  const r=adminRows.find(x=>Number(x.id)===Number(b.dataset.paid));if(!r)return;
  const folio=prompt('Folio de pago verificado (puede quedar vacío):',r.folio||'');if(folio===null)return;
  const ok=confirm('¿Confirmas que verificaste este pago en la cuenta bancaria? Se guardará como pago manual conciliado.');
  if(!ok)return;
  b.disabled=true;
  try{await api('/administracion/'+Number(r.id),'PATCH',{accion:'PAGO',pagado:true,folio});notify('Movimiento registrado.');await adminList();}
  catch(err){notify(err.message,true);}
  finally{b.disabled=false;}
 });
 $('refreshMine').addEventListener('click',mine);
 $('refreshAdmin').addEventListener('click',adminList);$('refreshReview').addEventListener('click',adminList);
 function fillProfile(){
  if(!profile)return;
  $('clubName').value=[profile.nombre,profile.apellidoPaterno,profile.apellidoMaterno].filter(Boolean).join(' ');
  $('clubPhone').value=profile.telefono||'';
  $('clubEmail').value=profile.correo||'';
  $('clubHouse').value=profile.casa?homeText({casa:profile.casa}):'Selecciona una vivienda en el menú';
 }
 if(token){
  try{
   const d=await (await fetch(API+'/auth/perfil',{headers:headers(),signal:AbortSignal.timeout(5000)})).json();
   const role=d.usuario?.rol?.nombre||d.usuario?.rol;
   if(d.ok&&['SUPER_ADMIN','ADMINISTRADOR','CONDOMINO'].includes(role)){
    profile=d.usuario;
    admin=['SUPER_ADMIN','ADMINISTRADOR'].includes(role);
    window.MJVerifiedRole=role;
    for(const storage of [localStorage,sessionStorage])
     if(storage.getItem('misionJardinesToken')===token)storage.setItem('misionJardinesUsuario',JSON.stringify(profile));
    const script=document.createElement('script');
    script.src='assets/js/site-sidebar.js?v=20261111-condomino-pagos';
    document.head.append(script);
   }
  }catch(_){/* Un visitante puede reservar aunque una sesión previa haya caducado. */}
 }
 if(profile){
  $('clubTabs').hidden=false;
  document.querySelector('[data-tab="mis-reservas"]').hidden=false;
  $('clubLinkedHouse').hidden=false;
  $('clubStreetField').hidden=$('clubNumberField').hidden=true;
  $('clubStreet').required=$('clubNumber').required=false;
  fillProfile();
 }
 if(!profile)window.MJClubAddress?.(api);
 if(admin){
  document.querySelectorAll('[data-admin]').forEach(x=>x.hidden=false);
  $('clubWhatsAppConsent').hidden=true;$('clubOptIn').required=false;
  $('clubSubmit').textContent='Reservar';
  $('clubRequestEyebrow').textContent='RESERVACIÓN DIRECTA';
  $('clubCalendarHint').textContent='Al reservar como administrador, la fecha se confirma de inmediato. El pago se gestiona por separado.';
  $('clubFormHint').textContent='La reserva se confirma al presionar Reservar. Se mantienen las reglas de adeudos y disponibilidad.';
 }
 const tarifaCampos={cuotaRecuperacion:'clubTariffRecovery',depositoGarantia:'clubTariffGuarantee',limpieza:'clubTariffCleaning'};
 const leerTarifas=()=>Object.fromEntries(Object.entries(tarifaCampos).map(([clave,id])=>[clave,$(id).value]));
 function sumarTarifas(){
  const datos=leerTarifas(),total=Object.values(datos).reduce((a,v)=>a+Number(v||0),0);
  $('clubTariffSum').textContent=money(total);
  $('clubTariffSum').style.color=total===2000?'#19704a':'#ba4141';
  $('clubTariffSave').disabled=total!==2000||Object.values(datos).some(v=>!/^\d+$/.test(v));
 }
 Object.values(tarifaCampos).forEach(id=>$(id).addEventListener('input',sumarTarifas));
 async function cargarTarifas(){
  const d=await api('/publico/tarifas');const p=d.data;
  $('clubFeeSummary').textContent='Tarifa vigente: recuperación '+money(p.cuotaRecuperacion)+
   ' + garantía '+money(p.depositoGarantia)+' + limpieza '+money(p.limpieza)+
   ' = '+money(p.total)+'. Se confirma al verificar el pago.';
  $('clubFeeSummary').hidden=false;
  if(admin){
   $('clubTariffEditor').hidden=false;
   for(const [clave,id] of Object.entries(tarifaCampos))$(id).value=p[clave];
   sumarTarifas();
  }
 }
 $('clubTariffForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!admin)return;
  const valores=leerTarifas();
  if(Object.values(valores).some(v=>!/^\d+$/.test(v))||Object.values(valores).reduce((a,v)=>a+Number(v),0)!==2000){
   $('clubTariffStatus').textContent='Los tres conceptos deben sumar exactamente $2,000 MXN.';return;
  }
  $('clubTariffSave').disabled=true;
  try{await api('/administracion/tarifas','PATCH',valores);
   $('clubTariffStatus').textContent='Distribución guardada en MySQL para nuevas reservas.';
   await cargarTarifas();
  }catch(err){$('clubTariffStatus').textContent=err.message;}
  finally{sumarTarifas();}
 });
 try{await cargarTarifas();}catch(e){console.warn('[casa-club] No se pudo consultar tarifa:',e.message);}
 try{await calendar();}catch(e){notify(e.message,true);}
 tab('reservar');
})();
