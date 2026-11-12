(async()=>{
 const API=window.MJ_API_URL||'https://api-misionjardines.listoenlinea.host/api';
 const $=id=>document.getElementById(id);
 // Un enlace público de comprobante no habilita ninguna precarga de perfil.
 const token=/^#comprobante=/.test(location.hash)?null:(localStorage.getItem('misionJardinesToken')||sessionStorage.getItem('misionJardinesToken'));
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=v=>Number(v||0).toLocaleString('es-MX',{style:'currency',currency:'MXN',minimumFractionDigits:0,maximumFractionDigits:0});
 const fmt=d=>window.MJDateDisplay.format(d);
 const fechaSolicitud=d=>d?new Date(d).toLocaleString('es-MX',{timeZone:'America/Mexico_City',dateStyle:'short',timeStyle:'short'}):'—';
 const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 let profile=null,admin=false;
 let currentMonth=today().slice(0,7),selectedDate='',occupied=new Map(),adminRows=[],activeReview=null;
 let calendarRequest=0,submitting=false,calendarReady=false,rulesAccepted=false;
 const tomorrow=()=>new Date(Date.parse(today()+'T12:00:00Z')+86400000).toISOString().slice(0,10);
 const lastDay=()=>new Date(Date.parse(today()+'T12:00:00Z')+365*86400000).toISOString().slice(0,10);
 const whatsappValido=value=>/^(?:52)?[0-9]{10}$/.test(value.replace(/[\s()+-]/g,''));
 const canSubmit=()=>!submitting&&calendarReady&&rulesAccepted&&Boolean(selectedDate)&&!(profile&&!profile.casa)
  &&(admin||whatsappValido($('clubPhone').value));
 const syncSubmit=()=>{$('clubSubmit').disabled=!canSubmit();};
 $('clubPhone').addEventListener('input',syncSubmit);
 $('clubPhone').addEventListener('change',syncSubmit);
 
 const rulesDialog=$('clubRulesDialog'),rulesScroll=$('clubRulesScroll'),rulesConfirm=$('clubRulesConfirm');
 let rulesReady=false,openedRules=false;
 function actualizarAceptacionReglamento(){
  $('clubRulesAcceptedStatus').textContent=rulesAccepted
   ?'Reglamento leído y aceptado. Puedes continuar con tu reservación.'
   :'Pendiente de lectura y aceptación.';
  $('clubRulesAcceptedStatus').classList.toggle('accepted',rulesAccepted);
  $('clubOpenRules').textContent=rulesAccepted?'Volver a consultar reglamento':'Leer reglamento y términos';
  syncSubmit();
 }
 function scrollReglamento(){
  const final=rulesReady&&openedRules&&rulesScroll.scrollTop+rulesScroll.clientHeight>=rulesScroll.scrollHeight-28;
  rulesConfirm.disabled=!final;
  $('clubRulesHint').textContent=final
   ?'Ya llegaste al final. Confirma que conoces y aceptas todas las disposiciones.'
   :'Desplázate hasta el final del reglamento completo para habilitar la aceptación.';
 }
 async function abrirReglamento(){
  rulesConfirm.disabled=true;openedRules=true;rulesDialog.showModal();
  if(!rulesReady){
   try{
    const response=await fetch('reglamento-casa-club.html',{cache:'no-store'});
    if(!response.ok)throw Error('El reglamento no se pudo cargar.');
    const doc=new DOMParser().parseFromString(await response.text(),'text/html');
    const article=doc.querySelector('#reglamentoContenido');
    if(!article)throw Error('El reglamento completo no está disponible.');
    $('clubRulesContent').replaceChildren(article);
    rulesReady=true;
   }catch(e){$('clubRulesContent').textContent='No se pudo cargar el reglamento: '+e.message+'. No se puede reservar sin leerlo.';}
  }
  rulesScroll.scrollTop=0;scrollReglamento();
 }
 $('clubOpenRules').addEventListener('click',()=>void abrirReglamento());
 $('clubRulesClose').addEventListener('click',()=>rulesDialog.close());
 rulesScroll.addEventListener('scroll',scrollReglamento,{passive:true});
 rulesConfirm.addEventListener('click',()=>{
  if(rulesConfirm.disabled||!rulesReady)return;
  rulesAccepted=true;actualizarAceptacionReglamento();rulesDialog.close();
 });
 actualizarAceptacionReglamento();
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
 // Cuenta bancaria y tarifa oficiales dentro de un modal; no enviamos WhatsApp.
 const paymentDialog=$('clubPaymentInstructionsDialog');
 function abrirInstrucciones(){
  const usarReserva=!$('clubPublicProofFlow').hidden&&!$('clubProofBankDetails').hidden;
  $('clubProofBankDetails').hidden=!usarReserva;
  $('clubTransferHelp').hidden=usarReserva||!bancoPublico;
  paymentDialog.showModal();
 }
 $('clubInstructionsOpen').addEventListener('click',abrirInstrucciones);
 $('clubProofInstructionsOpen').addEventListener('click',abrirInstrucciones);
 $('clubInstructionsClose').addEventListener('click',()=>paymentDialog.close());
 function showPayment(result){
  const p=result.pago,host=$('clubPaymentDetails');host.replaceChildren();
  const titulo=document.createElement('strong');titulo.textContent='Fecha apartada: '+fmt(result.fecha)+' · '+p.folio;
  const resumen=document.createElement('p');
  resumen.textContent='Total '+money(p.monto)+'. Adjunta aquí mismo el comprobante. Titan verificará la transferencia y confirmará tu fecha.';
  host.append(titulo,resumen);host.hidden=false;
  if(p.enlaceCarga&&window.MJClubPublicProof)window.MJClubPublicProof.open(p.enlaceCarga);
 }
 $('clubForm').addEventListener('submit',async e=>{
  e.preventDefault();if(!canSubmit())return;
  submitting=true;syncSubmit();
  const values={fecha:selectedDate,calle:$('clubStreet').value.trim(),numero:$('clubNumber').value.trim(),
   solicitante:$('clubName').value.trim(),telefono:$('clubPhone').value.trim(),correo:$('clubEmail').value.trim(),
   propietario:$('clubOwner').value==='SI',motivo:$('clubReason').value.trim(),aceptaReglamento:rulesAccepted};
  try{
   const result=await api(profile?'/reservas':'/publico/solicitudes','POST',values);
   notify(result.data?.estatus==='APROBADA'?'Reserva confirmada. El pago se registra por separado.':
    'Solicitud apartada provisionalmente. Adjunta el comprobante en esta página: Titan confirmará el depósito automáticamente.');
   // El estado de pago se abre después del aviso para que el desplazamiento
   // se mantenga en el formulario de comprobante y no vuelva arriba.
   if(result.data?.pago)showPayment(result.data);
   $('clubForm').reset();$('clubDate').value='';selectedDate='';fillProfile();rulesAccepted=false;actualizarAceptacionReglamento();
   actualizarBancoPublico();
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
  void loadReviewProofs(r);
 }
 async function loadReviewProofs(r){
  const host=$('clubReviewProofs');
  host.innerHTML='<h3>Comprobantes y movimientos bancarios</h3><p>Consultando expediente…</p>';
  try{
   const result=await api('/administracion/'+Number(r.id)+'/comprobantes');
   if(activeReview!==r||!reviewModal.open)return;
   const lista=result.data?.automaticos||[],manuales=result.data?.manuales||[];
   const autom=lista.map(p=>'<article class="club-bank-record"><div><strong>'+esc(p.folio||'Comprobante '+p.id)+'</strong>'+
    '<small>'+esc(money(p.monto))+' · '+esc(p.estatus)+' · Depósito '+esc(p.fechaOperacion||'—')+
    (p.fechaValidacion?' · Validado '+esc(fechaSolicitud(p.fechaValidacion)):'')+'</small></div>'+
    '<div class="club-bank-actions"><button type="button" class="soft" data-club-comprobante="'+Number(p.id)+'">Descargar comprobante</button>'+
    '<button type="button" class="soft" data-club-recibo="'+Number(p.id)+'">Ver recibo PDF</button></div></article>').join('');
   const manual=manuales.map(p=>'<article class="club-bank-record"><div><strong>Pago registrado por Administración</strong><small>'+
    esc(money(p.monto))+' · '+esc(p.formaPago)+' · '+esc(p.referencia)+' · '+esc(fechaSolicitud(p.creadoEn))+
    '</small></div></article>').join('');
   host.innerHTML='<h3>Comprobantes y movimientos bancarios</h3>'+
    (autom+manual||'<p>No hay pagos registrados para esta reserva.</p>');
  }catch(e){if(activeReview===r&&reviewModal.open)host.innerHTML='<h3>Comprobantes y movimientos bancarios</h3><p>'+esc(e.message)+'</p>';}
 }
 $('clubReviewProofs').addEventListener('click',async e=>{
  const button=e.target.closest('[data-club-comprobante],[data-club-recibo]');
  if(!button||!admin)return;
  const id=Number(button.dataset.clubComprobante||button.dataset.clubRecibo);
  if(!Number.isSafeInteger(id)||id<=0)return;
  button.disabled=true;
  try{
   const isProof=Boolean(button.dataset.clubComprobante);
   const response=await fetch(API+'/pagos/'+id+(isProof?'/comprobante':'/recibo'),{headers:headers()});
   if(!response.ok)throw Error('No fue posible descargar el comprobante o recibo bancario.');
   let href;
   if(isProof){
    const json=await response.json();
    href=String(json?.data?.comprobanteData||'');
    if(!/^data:image\/(?:jpeg|jpg|png|webp);base64,/i.test(href))throw Error('Formato de comprobante no disponible.');
   }else href=URL.createObjectURL(await response.blob());
   const a=document.createElement('a');
   a.href=href;
   a.download=(isProof?'Comprobante_':'Recibo_')+id+(isProof?'.jpg':'.pdf');
   document.body.append(a);a.click();a.remove();
   if(!isProof)setTimeout(()=>URL.revokeObjectURL(href),60000);
  }catch(err){notify(err.message,true);}finally{button.disabled=false;}
 });
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
 const filterStreet=$('clubFilterStreet'),filterNumber=$('clubFilterNumber'),filterMonth=$('clubFilterMonth');
 function actualizarOpcionesCalle(){
  const previo=filterStreet.value;
  const calles=[...new Set(adminRows.map(r=>String(r.casa?.calleCorrecta||r.casa?.calle||'').trim()).filter(Boolean))]
   .sort((a,b)=>a.localeCompare(b,'es-MX',{sensitivity:'base'}));
  filterStreet.innerHTML='<option value="">Todas las calles</option>'+
   calles.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');
  filterStreet.value=calles.includes(previo)?previo:'';
 }
 // El mes se determina por la fecha del EVENTO, no por la fecha de solicitud.
 function actualizarOpcionesMes(){
  const previo=filterMonth.value;
  const meses=[...new Set(adminRows.map(r=>String(r.fecha||'').slice(0,7))
   .filter(v=>/^\d{4}-(0[1-9]|1[0-2])$/.test(v)))].sort((a,b)=>b.localeCompare(a));
  filterMonth.innerHTML='<option value="">Todos los meses</option>'+
   meses.map(clave=>{
    const [anio,mes]=clave.split('-').map(Number);
    const texto=new Intl.DateTimeFormat('es-MX',{month:'long',year:'numeric',timeZone:'UTC'})
     .format(new Date(Date.UTC(anio,mes-1,1)));
    return '<option value="'+clave+'">'+esc(texto)+'</option>';
   }).join('');
  filterMonth.value=meses.includes(previo)?previo:'';
 }
 function coincideFiltrosReserva(row,{calle,numero,mes}){
  return !!row
   &&(!calle||String(row.casa?.calleCorrecta||row.casa?.calle||'').toLocaleLowerCase('es-MX')===calle)
   &&(!numero||String(row.casa?.numero||'').toLocaleLowerCase('es-MX').includes(numero))
   &&(!mes||String(row.fecha||'').slice(0,7)===mes);
 }
 function aplicarFiltroReservas(){
  const filtro={
   calle:filterStreet.value.trim().toLocaleLowerCase('es-MX'),
   numero:filterNumber.value.trim().toLocaleLowerCase('es-MX'),
   mes:filterMonth.value
  };
  const mapa=new Map(adminRows.map(r=>[Number(r.id),r]));
  let visibles=0;
  $('clubAdminRows').querySelectorAll('[data-reserva]').forEach(tr=>{
   const coincide=coincideFiltrosReserva(mapa.get(Number(tr.dataset.reserva)),filtro);
   tr.hidden=!coincide;
   if(coincide)visibles++;
  });
  $('clubRequests').querySelectorAll('[data-pendiente-id]').forEach(card=>{
   card.hidden=!coincideFiltrosReserva(mapa.get(Number(card.dataset.pendienteId)),filtro);
  });
  $('clubFilterCount').textContent=visibles+' de '+adminRows.length+' reservaciones';
 }
 filterStreet.addEventListener('change',aplicarFiltroReservas);
 filterNumber.addEventListener('input',aplicarFiltroReservas);
 filterMonth.addEventListener('change',aplicarFiltroReservas);
 $('clubClearFilters').addEventListener('click',()=>{
  filterStreet.value='';filterNumber.value='';filterMonth.value='';aplicarFiltroReservas();
 });
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
   $('clubAdminRows').innerHTML=tableRows.map(r=>{
      const acciones='<button type="button" class="soft">Ver detalles</button> '+
       (r.estatus==='APROBADA'
        ?'<button type="button" class="danger" data-release="'+Number(r.id)+'">Cancelar / liberar día</button>'
        :!r.pagado
         ?'<button type="button" class="danger" data-delete="'+Number(r.id)+'">Eliminar registro</button>'
         :'');
      const valores=[
       r.casa?.calleCorrecta||r.casa?.calle||'—',
       r.casa?.numero||'—',
       r.solicitante||'—',
       fmt(r.fecha),
       fechaSolicitud(r.creadoEn),
       money(r.cuotaRecuperacion),
       money(r.depositoGarantia)+(r.garantiaDevuelta?' · Devuelta':''),
       money(r.limpieza),
       r.folio||'—',
       r.propietario?'Sí':'No',
       paymentStatus(r),
       r.motivo||'—',
       r.estatus
      ];
      return '<tr data-reserva="'+Number(r.id)+'">'+
       valores.map((v,idx)=>'<td'+(idx===11?' class="club-event-reason"':'')+'>'+esc(v)+'</td>').join('')+
       '<td class="club-reservation-actions"><div class="club-actions-inline">'+acciones+'</div></td></tr>';
    }).join('')||'<tr><td colspan="14">Aún no hay reservas registradas.</td></tr>';
    $('clubRequests').innerHTML=adminRows.filter(r=>r.estatus==='PENDIENTE').map(r=>
    '<article class="reserve-card" data-pendiente-id="'+Number(r.id)+'"><h3>'+esc(fmt(r.fecha))+'</h3>'+statusBadge(r.estatus)+
    '<p><b>'+esc(r.solicitante)+'</b> · '+esc(homeText(r))+'</p><p>Solicitud recibida: '+esc(fechaSolicitud(r.creadoEn))+' (Guadalajara)</p><p>'+esc(r.motivo)+' · '+esc(r.telefono)+'</p>'+
    '<button type="button" class="primary" data-review="'+Number(r.id)+'">Revisar solicitud</button></article>').join('')||'<div class="reserve-card">No hay solicitudes pendientes de aprobación.</div>';
   actualizarOpcionesCalle();actualizarOpcionesMes();aplicarFiltroReservas();
  }catch(e){notify(e.message,true);}
 }
 $('clubRequests').addEventListener('click',e=>{const btn=e.target.closest('[data-review]');if(btn){const r=adminRows.find(x=>Number(x.id)===Number(btn.dataset.review));if(r)editReview(r);}});
 $('clubAdminRows').addEventListener('click',async e=>{
  const eliminar=e.target.closest('[data-delete]');
  if(eliminar){
   const id=Number(eliminar.dataset.delete);
   if(!Number.isSafeInteger(id)||id<1||!confirm('¿Eliminar el registro SIN pago y liberar su fecha? Si existe un depósito o comprobante, el sistema impedirá eliminarlo.'))return;
   eliminar.disabled=true;
   try{
    const result=await api('/administracion/'+id,'DELETE');
    notify(result.message);
    await Promise.all([adminList(),calendar()]);
   }catch(err){notify(err.message,true);eliminar.disabled=false;}
   return;
  }
  const release=e.target.closest('[data-release]');
  if(release){const r=adminRows.find(x=>Number(x.id)===Number(release.dataset.release));if(r)void liberarReserva(r);return;}
  const row=e.target.closest('[data-reserva]');
  const reserva=adminRows.find(x=>Number(x.id)===Number(row?.dataset.reserva));
  if(reserva)editReview(reserva);
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
 // Campos vacíos al abrir la liga pública; solamente calle y número
 // presentan sugerencias de datos existentes (sin seleccionar por el usuario).
 let bancoPublico=null,importePublico=null;
 function actualizarBancoPublico(){
  if(profile||!bancoPublico)return;
  const concepto=window.MJClubCuenta?.concepto($('clubStreet').value,$('clubNumber').value)||'';
  window.MJClubCuenta?.render('clubTransferHelp',bancoPublico,{
   conceptoTransferencia:concepto,monto:importePublico,informativo:true
  });
 }
 if(!profile){
  // El formulario público arranca SIN datos heredados del navegador ni de
  // una solicitud anterior. Los LOV conservan su catálogo, sin elección.
  $('clubForm').reset();
  for(const id of ['clubStreet','clubNumber','clubName','clubPhone','clubEmail','clubReason','clubDate'])$(id).value='';
  $('clubOwner').value='';
  
  window.MJClubAddress?.(api);
  for(const id of ['clubStreet','clubNumber']){
   $(id).addEventListener('input',actualizarBancoPublico);
   $(id).addEventListener('change',actualizarBancoPublico);
  }
  // Sin usar Storage o perfil, consultar únicamente la cuenta oficial.
  api('/publico/cuenta').then(result=>{
   bancoPublico=result.data;actualizarBancoPublico();
  }).catch(e=>{
   $('clubTransferHelp').hidden=false;
   $('clubTransferHelp').textContent='No se pudieron consultar los datos bancarios oficiales. No deposites hasta confirmar la cuenta: '+e.message;
  });
 }
 if(profile){
  $('clubInstructionsOpen').hidden=true;
  if(!/^#comprobante=/.test(location.hash))$('clubProofIntro').hidden=true;
 }
 if(admin){
  document.querySelectorAll('[data-admin]').forEach(x=>x.hidden=false);
  
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
  importePublico=Number(p.total);actualizarBancoPublico();
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
