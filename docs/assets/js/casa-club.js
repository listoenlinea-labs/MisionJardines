(async()=>{
 const API=window.MJ_API_URL||'https://api-misionjardines.listoenlinea.host/api';
 const $=id=>document.getElementById(id);
 // Un enlace público de comprobante no habilita ninguna precarga de perfil.
 const token=/^#(?:comprobante|mis-reservas)=/.test(location.hash)?null:(localStorage.getItem('misionJardinesToken')||sessionStorage.getItem('misionJardinesToken'));
 if(/^#mis-reservas=/.test(location.hash))return; // vista privada del correo, sin autocompletar perfiles
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=v=>Number(v||0).toLocaleString('es-MX',{style:'currency',currency:'MXN',minimumFractionDigits:0,maximumFractionDigits:0});
 const fmt=d=>window.MJDateDisplay.format(d);
 const fechaSolicitud=d=>d?new Date(d).toLocaleString('es-MX',{timeZone:'America/Mexico_City',dateStyle:'short',timeStyle:'short'}):'—';
 const today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 let profile=null,admin=false;
 let currentMonth=today().slice(0,7),selectedDate='',occupied=new Map(),adminRows=[],historicGoogleRows=[],activeReview=null;
 let calendarRequest=0,submitting=false,calendarReady=false,rulesAccepted=false;
 let mobileDetailsSaved=false;
 const tomorrow=()=>new Date(Date.parse(today()+'T12:00:00Z')+86400000).toISOString().slice(0,10);
 const lastDay=()=>new Date(Date.parse(today()+'T12:00:00Z')+365*86400000).toISOString().slice(0,10);
 const whatsappValido=value=>/^(?:52)?[0-9]{10}$/.test(value.replace(/[\s()+-]/g,''));
 // Permitir pulsar Guardar aunque falte un campo: el modal de errores explica
 // qué corregir, marca el control en rojo y lleva al lugar correspondiente.
 const canSubmit=()=>!submitting&&calendarReady&&Boolean(selectedDate);
 const syncSubmit=()=>{
  $('clubSubmit').disabled=!canSubmit();
  // El botón de envío de la pantalla principal solo aparece después de
  // leer y aceptar el reglamento, incluso antes de completar los demás datos.
  const send=$('clubMobileSendRequest'),area=$('clubMobileSubmitArea');
  if(send&&area){send.disabled=!rulesAccepted||submitting;}
 };
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
  // En teléfonos, mostrar al usuario dónde quedó habilitado el envío.
  if(window.matchMedia('(max-width: 700px)').matches)
   $('clubMobileSubmitArea').scrollIntoView({behavior:'smooth',block:'nearest'});
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
   err.codigo=d.codigo||null;err.adeudos=d.adeudos||null;err.tarjetas=d.tarjetas||null;
   err.campos=Array.isArray(d.campos)?d.campos:[];err.accion=d.accion||null;
   throw err;
  }
  return d;
 }
 const notify=(msg,bad=false,scroll=true)=>{const el=$('clubNotice');el.textContent=msg;el.style.borderColor=bad?'#f2caca':'#d9e9dd';el.style.background=bad?'#fff2f3':'#f2faf5';el.hidden=false;if(scroll)window.scrollTo({top:0,behavior:'smooth'});};
 const debtDialog=$('clubDebtModal');
 const debtNames={MANTENIMIENTO:'Mantenimiento'};
 const monthNames=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
 const monthPeriod=p=>{
  const m=/^(\d{4})-(0[1-9]|1[0-2])(?:-\d{2})?$/.exec(String(p||''));
  return m?monthNames[Number(m[2])-1]+' '+m[1]:String(p||'');
 };
 function showDebtAlert(error){
  if(error.codigo!=='ADEUDOS_RESERVA'||!error.adeudos)return false;
  const adeudos=error.adeudos;
  $('clubDebtExplanation').textContent='Esta vivienda no puede solicitar una reserva hasta cubrir los adeudos de mantenimiento. Las cuotas extraordinarias no bloquean Casa Club.';
  $('clubDebtSummary').innerHTML=['MANTENIMIENTO'].map(tipo=>
   '<div class="club-debt-stat '+(tipo==='MANTENIMIENTO'?'maintenance':'extra')+'"><small>'+debtNames[tipo]+'</small><strong>'+esc(money(adeudos.totales?.[tipo]))+'</strong></div>'
  ).join('')+'<div class="club-debt-total"><span>Total por regularizar</span><strong>'+esc(money(adeudos.total))+'</strong></div>';
  const rows=['MANTENIMIENTO'].flatMap(tipo=>(adeudos.tipos?.[tipo]||[]).map(item=>({tipo,...item})));
  $('clubDebtDetails').innerHTML=rows.length?'<h3>Desglose de los adeudos</h3>'+rows.map(item=>
   '<div class="club-debt-item"><div><b>'+esc(debtNames[item.tipo])+'</b><small>'+esc(monthPeriod(item.periodo))+
   (item.concepto?' · '+esc(item.concepto):'')+'</small></div><div><strong>'+esc(money(item.monto))+'</strong>'+
   (Number(item.recargo)>0?'<small>Incluye '+esc(money(item.recargo))+' de recargo por atraso</small>':'')+'</div></div>'
  ).join(''):'<p>Consulta el saldo actualizado en Pagos.</p>';
  debtDialog.showModal();
  return true;
 }
 const redDialog=$('clubRedCardsModal');
 function showRedCards(data){
  if(!data)return false;
  const count=Number(data.totalActivas||0);
  $('clubRedCardsScore').textContent=count;
  $('clubRedCardsTitle').textContent='Tarjetas rojas de tu vivienda';
  $('clubRedCardsIntro').textContent='Tienes '+count+' tarjeta(s) roja(s) activa(s). Una cuarta tarjeta activa puede impedir reservar Casa Club.';
  const isBlocked=data.bloqueada||Boolean(data.bloqueadoHasta&&count>3);
  $('clubRedCardsRestriction').classList.toggle('blocked',isBlocked);
  $('clubRedCardsRestriction').textContent=isBlocked
   ?'Tu vivienda no puede reservar Casa Club hasta el '+fmt(data.bloqueadoHasta)+' por superar tres tarjetas rojas activas.'
   :count===3?'Atención: una nueva tarjeta roja iniciaría una suspensión de '+Number(data.aniosBloqueo||1)+' año(s).':
     count>3?'La suspensión anterior ya venció. Una nueva tarjeta puede activar otra restricción.':
      'Tu vivienda no tiene suspensión vigente por tarjetas rojas. El límite es de 3 tarjetas activas.';
  $('clubRedCardsList').innerHTML=Array.isArray(data.tarjetas)&&data.tarjetas.length
   ?data.tarjetas.map(t=>'<div class="club-red-card-item"><b>Tarjeta #'+Number(t.id)+'</b><small>'+esc(fechaSolicitud(t.asignadaEn))+
      '</small><p>'+esc(t.motivo||'Motivo no disponible')+'</p></div>').join('')
   :'<p>Para conocer el detalle de una tarjeta, consulta con Administración.</p>';
  if(!redDialog.open)redDialog.showModal();
  return true;
 }
 $('closeClubRedCards').addEventListener('click',()=>redDialog.close());
 $('ackClubRedCards').addEventListener('click',()=>redDialog.close());
 async function cargarMisRojas(abrir=false){
  if(!token||!profile||admin)return;
  try{
   const result=await api('/tarjetas-rojas/mias');
   $('clubMyRedCount').textContent=result.data.totalActivas;
   if(abrir)showRedCards(result.data);
  }catch(err){if(abrir)notify(err.message,true);}
 }
 $('clubMyRedCards').addEventListener('click',()=>void cargarMisRojas(true));
 const closeDebt=()=>debtDialog.close();
 $('closeClubDebt').addEventListener('click',closeDebt);
 $('ackClubDebt').addEventListener('click',closeDebt);
 function tab(name){
  document.querySelectorAll('[data-tab]').forEach(b=>b.setAttribute('aria-current',b.dataset.tab===name?'page':'false'));
  document.querySelectorAll('.club-panel').forEach(x=>x.hidden=x.id!=='tab-'+name);
  if(name==='mis-reservas')void mine();
  if(name==='administracion')void adminList();
  if(name==='aprobacion')void adminList();
  if(admin&&['tarjetas','historial-rojas'].includes(name))void window.MJClubRojasAdmin?.mostrar(name);
 }
 document.querySelectorAll('[data-tab]').forEach(b=>b.addEventListener('click',()=>tab(b.dataset.tab)));
 function historicalMonths(){
  return [...new Set([...adminRows,...historicGoogleRows]
   .map(r=>String(r.fecha||'').slice(0,7))
   .filter(m=>/^\d{4}-(0[1-9]|1[0-2])$/.test(m)))].sort();
 }
 function monthShift(offset){
  const [y,m]=currentMonth.split('-').map(Number);
  const nowMonth=today().slice(0,7);
  if(admin&&offset<0&&currentMonth<=nowMonth){
   const previous=historicalMonths().filter(v=>v<currentMonth);
   if(!previous.length)return;
   currentMonth=previous[previous.length-1];
  }else if(admin&&offset>0&&currentMonth<nowMonth){
   currentMonth=historicalMonths().find(v=>v>currentMonth&&v<nowMonth)||nowMonth;
  }else{
   const dt=new Date(Date.UTC(y,m-1+offset,1));
   currentMonth=dt.toISOString().slice(0,7);
  }
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
  const googleVerificado=response.disponibilidadVerificada!==false;
  calendarReady=googleVerificado;
  if(!googleVerificado){
   selectedDate='';$('clubDate').value='';
   $('clubCalendarHint').textContent='No se pudo verificar Google Sheets. Se muestran las reservas ya guardadas en Misión Jardines, pero las fechas nuevas están temporalmente deshabilitadas para evitar reservas duplicadas. Administración debe revisar la conexión.';
  }else{
   $('clubCalendarHint').textContent='Elige una fecha y completa la solicitud. Recibirás por correo un enlace privado para subir el comprobante exclusivamente a esa vivienda y fecha.';
  }
  $('nextMonth').disabled=!admin&&currentMonth>=lastDay().slice(0,7);
  occupied=new Map(response.ocupadas.map(x=>[x.fecha,x.estatus]));
  if(admin){
   // Histórico privado: no enviar nombres ni datos antiguos a la liga pública.
   for(const r of [...adminRows,...historicGoogleRows]){
    if(!/^\d{4}-\d{2}-\d{2}$/.test(String(r.fecha||''))||occupied.has(r.fecha))continue;
    if(r.estatus==='APROBADA')occupied.set(r.fecha,'APROBADA');
    else if(r.estatus==='PENDIENTE')occupied.set(r.fecha,'PENDIENTE');
    else if(r.soloLectura)occupied.set(r.fecha,'HISTORICA_GOOGLE');
    else if(['RECHAZADA','CANCELADA'].includes(r.estatus))
     occupied.set(r.fecha,'HISTORICA_INACTIVA');
   }
  }
  $('calendarLabel').textContent=new Intl.DateTimeFormat('es-MX',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(start+'T12:00:00Z'));
  $('prevMonth').disabled=admin?
   (currentMonth<=today().slice(0,7)&&!historicalMonths().some(v=>v<currentMonth)):
   start.slice(0,7)<=today().slice(0,7);
  if(occupied.has(selectedDate)){selectedDate='';$('clubDate').value='';}
  syncSubmit();
  const days=$('calendarDays');
  const offset=(new Date(Date.UTC(year,month-1,1)).getUTCDay()+6)%7;
  for(let n=0;n<offset;n++){let gap=document.createElement('div');gap.className='calendar-blank';days.append(gap);}
  for(let n=1;n<=new Date(Date.UTC(year,month,0)).getUTCDate();n++){
   const date=currentMonth+'-'+String(n).padStart(2,'0'),status=occupied.get(date),past=admin?date<today():date<tomorrow()||date>lastDay();
   const btn=document.createElement('button');btn.type='button';
   // La fecha ocupada conserva su color incluso si ya no permite reservar.
   btn.className=status==='APROBADA'?'booked':
    status==='PENDIENTE'||status==='HISTORICA_GOOGLE'?'waiting':
    status==='HISTORICA_INACTIVA'?'past':
    past||!googleVerificado?'past':'available';
   if(admin&&date<today()&&status)btn.classList.add('historic-entry');
   // Hoy según America/Mexico_City; solo añade contorno, conserva color de estado.
   if(date===today())btn.classList.add('today-mx');
   // Fecha anterior a hoy (Guadalajara): solo color informativo, no cambia estado MySQL.
   if(date<today())btn.classList.add('past-date-red');
   if(date===selectedDate)btn.classList.add('selected');
   btn.disabled=Boolean(status)||past||!googleVerificado;
   btn.setAttribute('aria-label',fmt(date)+(date<today()?' · Fecha pasada: no disponible':'')+' · '+(
    status==='APROBADA'?'Reservada':status==='PENDIENTE'||status==='HISTORICA_GOOGLE'?'En revisión':
    status==='HISTORICA_INACTIVA'?'Registro histórico cancelado o rechazado':
    past||!googleVerificado?'No disponible':'Disponible'));
   btn.textContent=n;
   btn.addEventListener('click',()=>{selectedDate=date;mobileDetailsSaved=false;
    $('clubMobileSavedStatus').textContent='Completa y guarda los datos para enviar esta solicitud.';
    $('clubDate').value=fmt(date);days.querySelectorAll('button').forEach(x=>x.classList.remove('selected'));btn.classList.add('selected');syncSubmit();abrirSolicitudMovil();});
   days.append(btn);
  }
 }
  // El mismo formulario se mueve al modal solo en teléfonos: nunca duplicar IDs.
 const mobileReservationQuery=window.matchMedia('(max-width: 700px)');
 const mobileReservationDialog=$('clubMobileReservationDialog');
 const reservationCard=$('clubReservationCard');
 const reservationAnchor=document.createComment('Posición original del formulario de Casa Club');
 reservationCard.parentNode.insertBefore(reservationAnchor,reservationCard);
 const rulesCard=$('clubRegulationsAcceptance');
 const rulesAnchor=document.createComment('Posición del reglamento en formulario de escritorio');
 rulesCard.parentNode.insertBefore(rulesAnchor,rulesCard);
 function situarFormulario(){
  if(mobileReservationQuery.matches){
   $('clubCalendarHint').insertAdjacentElement('afterend',rulesCard);
   mobileReservationDialog.appendChild(reservationCard);
   $('clubSubmit').type='button';
   $('clubSubmit').textContent='Guardar';
  }else{
   if(mobileReservationDialog.open)mobileReservationDialog.close();
   reservationAnchor.parentNode.insertBefore(reservationCard,reservationAnchor.nextSibling);
   rulesAnchor.parentNode.insertBefore(rulesCard,rulesAnchor.nextSibling);
   $('clubSubmit').type='submit';
   $('clubSubmit').textContent=admin?'Reservar':'Enviar solicitud de reservación';
  }
 }
 function abrirSolicitudMovil(){
  if(!mobileReservationQuery.matches||!selectedDate)return;
  $('clubMobileSelectedDate').textContent='Fecha seleccionada: '+fmt(selectedDate);
  $('clubMobileSubmitError').hidden=true;
  mobileReservationDialog.showModal();
 }

 // Toda falla de reservación se presenta con explicación accionable.
 // El foco vuelve al campo incorrecto tras cerrar el diálogo, también en móvil.
 const errorDialog=$('clubErrorDialog');
 const camposMap={
  fecha:{id:'clubDate',nombre:'Fecha solicitada'},
  calle:{id:'clubStreet',nombre:'Calle de tu vivienda'},
  numero:{id:'clubNumber',nombre:'Número de casa'},
  vivienda:{id:'clubHouse',nombre:'Vivienda seleccionada'},
  solicitante:{id:'clubName',nombre:'Nombre del solicitante'},
  telefono:{id:'clubPhone',nombre:'Teléfono de contacto'},
  correo:{id:'clubEmail',nombre:'Correo de contacto'},
  propietario:{id:'clubOwner',nombre:'¿Eres propietario?'},
  motivo:{id:'clubReason',nombre:'Motivo del evento'},
  reglamento:{id:'clubRegulationsAcceptance',nombre:'Lectura y aceptación del reglamento'}
 };
 const titulosError={
  RESERVA_PREVIA_PENDIENTE:'Ya hay una reservación pendiente',
  FECHA_OCUPADA:'La fecha elegida ya está ocupada',
  FECHA_INVALIDA:'Revisa la fecha solicitada',
  VIVIENDA_INVALIDA:'Revisa los datos de la vivienda',
  VIVIENDA_NO_ELEGIBLE:'No se pudo verificar la vivienda',
  REGLAMENTO_PENDIENTE:'Falta aceptar el reglamento',
  CAMPOS_INVALIDOS:'Hay datos por corregir',
  SERVICIO_NO_DISPONIBLE:'No pudimos conectar con el sistema',
  ERROR_RESERVA:'No se pudo completar la reservación'
 };
 function limpiarCamposInvalidos(){
  $('clubForm').querySelectorAll('.club-invalid-field').forEach(el=>{
   el.classList.remove('club-invalid-field');el.removeAttribute('aria-invalid');
  });
  rulesCard.classList.remove('club-invalid-field');
 }
 let campoParaCorregir=null;
 function dirigirAlCampo(campo){
  if(!campo)return;
  const field=campo==='reglamento'?rulesCard:$(camposMap[campo]?.id);
  if(!field)return;
  const outsideDialog=campo==='reglamento'||campo==='fecha';
  if(mobileReservationQuery.matches&&outsideDialog&&mobileReservationDialog.open)
   mobileReservationDialog.close();
  if(mobileReservationQuery.matches&&!outsideDialog&&!mobileReservationDialog.open)
   abrirSolicitudMovil();
  const target=campo==='fecha'?$('clubAvailabilityCard'):field;
  target.scrollIntoView({behavior:'smooth',block:'center'});
  if(campo==='reglamento'){
   try{$('clubOpenRules').focus({preventScroll:true});}catch(_){}
  }else if(campo==='fecha'){
   const dayButton=$('calendarDays').querySelector('button.selected');
   try{dayButton?.focus({preventScroll:true});}catch(_){}
  }else{
   try{field.focus({preventScroll:true});}catch(_){field.focus();}
  }
 }
 function mostrarError(err,detalle=[]){
  limpiarCamposInvalidos();
  const info=detalle.length?detalle:(Array.isArray(err.campos)?err.campos.map(campo=>({
   campo,mensaje:'Revisa el campo «'+(camposMap[campo]?.nombre||campo)+'».'
  })):[]);
  const campos=[...new Set(info.map(x=>x.campo))];
  for(const campo of campos){
   const target=campo==='reglamento'?rulesCard:$(camposMap[campo]?.id);
   if(!target)continue;
   target.classList.add('club-invalid-field');
   if(campo!=='reglamento')target.setAttribute('aria-invalid','true');
  }
  campoParaCorregir=campos[0]||null;
  $('clubErrorTitle').textContent=titulosError[err.codigo]||'No se pudo completar la reservación';
  $('clubErrorMessage').textContent=String(err.message||'Revisa la información e inténtalo nuevamente.');
  const list=$('clubErrorFields');
  list.replaceChildren();
  for(const item of info){
   const li=document.createElement('li');li.textContent=item.mensaje||'Revisa '+(camposMap[item.campo]?.nombre||item.campo)+'.';
   list.appendChild(li);
  }
  list.hidden=!info.length;
  const accion=err.accion||(
   err.codigo==='RESERVA_PREVIA_PENDIENTE'
   ?'Para solicitar otra fecha, espera a que se confirme la reservación actual o pide a Administración cancelarla o rechazarla. Después podrás volver a intentar.'
   :campoParaCorregir?'Cierra este aviso y te llevaremos al primer campo por corregir.':'Inténtalo nuevamente o contacta a Administración si el problema continúa.'
  );
  $('clubErrorAction').textContent=accion;
  $('clubErrorAction').hidden=!accion;
  if(!errorDialog.open)errorDialog.showModal();
 }
 function cerrarError(){
  if(errorDialog.open)errorDialog.close();
  const campo=campoParaCorregir;
  campoParaCorregir=null;
  dirigirAlCampo(campo);
 }
 $('closeClubError').addEventListener('click',cerrarError);
 $('ackClubError').addEventListener('click',cerrarError);
 errorDialog.addEventListener('close',()=>{
  if(campoParaCorregir){
   const campo=campoParaCorregir;campoParaCorregir=null;
   dirigirAlCampo(campo);
  }
 });
 function validarSolicitud({omitirReglamento=false}={}){
  const errores=[];
  const invalid=(campo,mensaje)=>errores.push({campo,mensaje});
  if(!selectedDate)invalid('fecha','Selecciona primero una fecha disponible en el calendario.');
  if(profile&&!profile.casa)invalid('vivienda','Selecciona una vivienda vinculada con tu cuenta.');
  if(!profile){
   if(!$('clubStreet').value.trim())invalid('calle','Selecciona la calle de tu vivienda.');
   if(!$('clubNumber').value.trim())invalid('numero','Selecciona el número de casa.');
  }
  if(!$('clubName').value.trim())invalid('solicitante','Escribe el nombre de quien solicita.');
  const telefono=$('clubPhone').value.replace(/[\s()+-]/g,'');
  if(!/^(?:52)?[0-9]{10}$/.test(telefono))invalid('telefono','Escribe un teléfono válido de 10 dígitos.');
  if(!$('clubEmail').value.trim()||!$('clubEmail').validity.valid)
   invalid('correo','Escribe un correo electrónico válido.');
  if(!['SI','NO'].includes($('clubOwner').value))invalid('propietario','Indica si eres propietario o residente/inquilino.');
  if(!$('clubReason').value.trim())invalid('motivo','Describe el motivo del evento.');
  if(!omitirReglamento&&!rulesAccepted)invalid('reglamento','Lee y acepta los términos del reglamento en la pantalla principal.');
  if(errores.length)mostrarError({
   codigo:'CAMPOS_INVALIDOS',
   message:'Encontramos '+errores.length+' dato(s) por completar o corregir. No se ha enviado la solicitud.'
  },errores);
  return errores.length===0;
 }
 for(const ev of ['input','change']){
  $('clubForm').addEventListener(ev,event=>{
   const target=event.target;
   if(target.classList?.contains('club-invalid-field')){
    target.classList.remove('club-invalid-field');
    target.removeAttribute('aria-invalid');
   }
   if(mobileReservationQuery.matches){
    mobileDetailsSaved=false;
    $('clubMobileSavedStatus').textContent='Hay cambios sin guardar. Abre la fecha y pulsa Guardar.';
   }
  });
 }

 $('clubMobileReservationClose').addEventListener('click',()=>mobileReservationDialog.close());
 if(mobileReservationQuery.addEventListener)mobileReservationQuery.addEventListener('change',situarFormulario);
 else if(mobileReservationQuery.addListener)mobileReservationQuery.addListener(situarFormulario);
 situarFormulario();

 // Guardar se limita a validar los campos y cerrar el modal móvil.
 $('clubSubmit').addEventListener('click',()=>{
  if(!mobileReservationQuery.matches)return;
  if(!validarSolicitud({omitirReglamento:true}))return;
  mobileDetailsSaved=true;
  $('clubMobileSavedStatus').textContent='Datos guardados para '+fmt(selectedDate)+'. Ya puedes enviar la solicitud.';
  mobileReservationDialog.close();
  syncSubmit();
  if(rulesAccepted)$('clubMobileSubmitArea').scrollIntoView({behavior:'smooth',block:'center'});
 });
 // Único envío real: desde el botón principal después de aceptar el reglamento.
 $('clubMobileSendRequest').addEventListener('click',()=>{
  if(!mobileReservationQuery.matches||!rulesAccepted||submitting)return;
  if(!canSubmit()){
   $('clubMobileSavedStatus').textContent='Selecciona una fecha disponible en el calendario para continuar.';
   $('clubAvailabilityCard').scrollIntoView({behavior:'smooth',block:'center'});
   return;
  }
  if(!mobileDetailsSaved){
   $('clubMobileSavedStatus').textContent='Antes de enviar, completa los datos de la fecha elegida y pulsa Guardar.';
   abrirSolicitudMovil();
   return;
  }
  $('clubForm').requestSubmit();
 });
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
  const titulo=document.createElement('strong');
  titulo.textContent='Solicitud '+p.folio+' · Fecha '+fmt(result.fecha);
  const resumen=document.createElement('p');
  resumen.textContent='Total '+money(p.monto)+'. Consulta tu correo: recibirás las instrucciones bancarias y un enlace personal que muestra exactamente tu vivienda y fecha. Solo desde ese enlace podrás subir el comprobante.';
  host.append(titulo,resumen);
  host.hidden=false;
 }
 $('clubForm').addEventListener('submit',async e=>{
  e.preventDefault();
  if(submitting||!calendarReady)return;
  if(!validarSolicitud())return;
  $('clubMobileSubmitError').hidden=true;
  submitting=true;syncSubmit();
  const values={fecha:selectedDate,calle:$('clubStreet').value.trim(),numero:$('clubNumber').value.trim(),
   solicitante:$('clubName').value.trim(),telefono:$('clubPhone').value.trim(),correo:$('clubEmail').value.trim(),
   propietario:$('clubOwner').value==='SI',motivo:$('clubReason').value.trim(),aceptaReglamento:rulesAccepted};
  try{
   const result=await api(profile?'/reservas':'/publico/solicitudes','POST',values);
   if(mobileReservationDialog.open)mobileReservationDialog.close();
   notify(result.data?.estatus==='APROBADA'?'Reserva confirmada. El pago se registra por separado.':
    result.data?.notificaciones?.correo===false
     ?'Solicitud registrada, pero no se confirmó el envío del correo. Contacta a Administración para recuperar el enlace privado.'
     :'Solicitud registrada. Revisa tu correo: ahí recibirás las instrucciones de pago y el enlace exclusivo para subir el comprobante.');
   // El estado de pago se abre después del aviso para que el desplazamiento
   // se mantenga en el formulario de comprobante y no vuelva arriba.
   if(result.data?.pago)showPayment(result.data);
   $('clubForm').reset();$('clubDate').value='';selectedDate='';mobileDetailsSaved=false;
   $('clubMobileSavedStatus').textContent='Selecciona una fecha y guarda los datos de la reservación para enviar tu solicitud.';
   fillProfile();rulesAccepted=false;actualizarAceptacionReglamento();
   actualizarBancoPublico();
   if(admin)tab('mis-reservas');
  }catch(err){
   // Los modales especiales de adeudos y tarjetas rojas ya contienen su desglose.
   // El resto de errores utiliza el diálogo universal de reservación.
   if(err.codigo==='TARJETAS_ROJAS'&&err.tarjetas){
    if(mobileReservationDialog.open)mobileReservationDialog.close();
    showRedCards(err.tarjetas);
   }else if(err.codigo==='ADEUDOS_RESERVA'&&err.adeudos){
    if(mobileReservationDialog.open)mobileReservationDialog.close();
    showDebtAlert(err);
   }else mostrarError(err);
  }
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
  btn.disabled=true;try{await api('/reservas/'+Number(btn.dataset.cancel)+'/cancelar','PATCH');notify('Reserva cancelada.');await Promise.all([mine(),calendar()]);}catch(err){mostrarError(err);btn.disabled=false;}
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
  }catch(err){
   if(reviewModal.open&&activeReview===r){error.textContent=err.message;error.hidden=false;}
   mostrarError(err);
  }
  finally{reviewing=false;syncReview();}
 }
 async function liberarReserva(r){
  if(!admin||r.estatus!=='APROBADA')return;
  const motivo=prompt('Motivo de cancelación (mínimo 8 caracteres). Se conserva el historial de pagos:', '');
  if(motivo===null)return;
  if(motivo.trim().length<8){mostrarError({codigo:'CAMPOS_INVALIDOS',message:'El motivo de cancelación debe tener por lo menos 8 caracteres.'});return;}
  if(!confirm('¿Cancelar CC-'+r.id+' del '+fmt(r.fecha)+' y liberar ese día?'+
    (r.pagado?' El pago permanecerá registrado y su devolución requerirá conciliación.':'')))return;
  try{
   const d=await api('/administracion/'+Number(r.id)+'/liberar','PATCH',{motivo:motivo.trim()});
   if(reviewModal.open)reviewModal.close();
   notify(d.message+(d.pagoPendienteDeRevision?' Revisa la devolución del dinero.':'')+
    (!d.avisoCorreo?' No se confirmó el correo de aviso.':''));
   await Promise.all([adminList(),calendar()]);
  }catch(e){mostrarError(e);}
 }
 $('clubRelease').addEventListener('click',()=>{if(activeReview)void liberarReserva(activeReview);});
 const mon=d=>new Intl.DateTimeFormat('es-MX',{month:'long',timeZone:'UTC'}).format(new Date(d+'T12:00:00Z'));
 const filterStreet=$('clubFilterStreet'),filterNumber=$('clubFilterNumber'),filterMonth=$('clubFilterMonth');
 const allAdminRecords=()=>[...adminRows,...historicGoogleRows];
 function actualizarOpcionesCalle(){
  const previo=filterStreet.value;
  const calles=[...new Set(allAdminRecords().map(r=>String(r.casa?.calleCorrecta||r.casa?.calle||'').trim()).filter(Boolean))]
   .sort((a,b)=>a.localeCompare(b,'es-MX',{sensitivity:'base'}));
  filterStreet.innerHTML='<option value="">Todas las calles</option>'+
   calles.map(v=>'<option value="'+esc(v)+'">'+esc(v)+'</option>').join('');
  filterStreet.value=calles.includes(previo)?previo:'';
 }
 // El mes se determina por la fecha del EVENTO, no por la fecha de solicitud.
 function actualizarOpcionesMes(){
  const previo=filterMonth.value;
  const meses=[...new Set(allAdminRecords().map(r=>String(r.fecha||'').slice(0,7))
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
 let adminPage=1,adminTableRows=[];
 const adminPageSize=()=>window.matchMedia('(max-width: 720px), (orientation: landscape) and (max-height: 550px) and (pointer: coarse)').matches?3:10;
 function renderAdminTable(rows){
   $('clubAdminRows').innerHTML=rows.map(r=>{
      const acciones=r.soloLectura?'<span class="club-google-readonly">Solo consulta · Google</span>':
       '<button type="button" class="soft">Ver detalles</button> '+
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
       r.soloLectura?(r.fechaRegistroGoogle||'—'):fechaSolicitud(r.creadoEn),
       r.soloLectura?money(1000):money(r.cuotaRecuperacion),
       r.soloLectura?money(700):money(r.depositoGarantia)+(r.garantiaDevuelta?' · Devuelta':''),
       r.soloLectura?money(300):money(r.limpieza),
       r.folio||'—',
       r.propietario?'Sí':'No',
       r.soloLectura?'No verificado en Google':paymentStatus(r),
       r.soloLectura?'Tarifa de referencia $2,000 (1000/700/300); pago no verificado en Google.':r.motivo||'—',
       r.soloLectura?(r.estatus==='HISTORICA_GOOGLE'?'Histórica · Google':
        r.estatus==='CONFLICTO_GOOGLE'?'Conflicto · Google':'En revisión · Google'):r.estatus
      ];
      return '<tr data-reserva="'+Number(r.id)+'">'+
       valores.map((v,idx)=>'<td'+(idx===11?' class="club-event-reason"':'')+'>'+esc(v)+'</td>').join('')+
       '<td class="club-reservation-actions"><div class="club-actions-inline">'+acciones+'</div></td></tr>';
    }).join('')||'<tr><td colspan="14">Aún no hay reservas registradas.</td></tr>';


  const labels=['Calle','Casa','Solicitante','Fecha del evento','Fecha de solicitud',
   'Pago recuperación','Depósito garantía','Limpieza','Folio','Propietario',
   'Estatus pago','Observaciones','Estado'];
  $('clubAdminCards').innerHTML=rows.map(r=>{
   const values=[
    r.casa?.calleCorrecta||r.casa?.calle||'—',r.casa?.numero||'—',
    r.solicitante||'—',fmt(r.fecha),
    r.soloLectura?(r.fechaRegistroGoogle||'—'):fechaSolicitud(r.creadoEn),
    r.soloLectura?money(1000):money(r.cuotaRecuperacion),
    r.soloLectura?money(700):money(r.depositoGarantia)+(r.garantiaDevuelta?' · Devuelta':''),
    r.soloLectura?money(300):money(r.limpieza),r.folio||'—',
    r.propietario?'Sí':'No',r.soloLectura?'No verificado en Google':paymentStatus(r),
    r.soloLectura?'Tarifa de referencia $2,000; pago no verificado (solo consulta)':r.motivo||'—',
    r.soloLectura?'Histórica · Google':r.estatus
   ];
   const details=labels.map((label,i)=>'<div class="club-admin-mobile-line"><span>'+
    esc(label)+'</span><strong>'+esc(values[i])+'</strong></div>').join('');
   const actions=r.soloLectura?'<span class="club-google-readonly">Solo consulta · Google</span>':
    '<button type="button" class="soft" data-admin-details="'+Number(r.id)+'">Ver detalles</button> '+
    (r.estatus==='APROBADA'
     ?'<button type="button" class="danger" data-release="'+Number(r.id)+'">Cancelar / liberar día</button>'
     :!r.pagado?'<button type="button" class="danger" data-delete="'+Number(r.id)+'">Eliminar registro</button>':'');
   return '<article class="club-admin-mobile-card" data-reserva="'+Number(r.id)+'">'+
    details+'<div class="club-admin-mobile-actions">'+actions+'</div></article>';
  }).join('')||'<p>No hay reservaciones con esos filtros.</p>';
  $('clubAdminCards').hidden=false;

 }
 function aplicarFiltroReservas(){
  const filtro={
   calle:filterStreet.value.trim().toLocaleLowerCase('es-MX'),
   numero:filterNumber.value.trim().toLocaleLowerCase('es-MX'),
   mes:filterMonth.value
  };
  const rows=adminTableRows.filter(r=>coincideFiltrosReserva(r,filtro));
  const pageSize=adminPageSize(),pages=Math.max(1,Math.ceil(rows.length/pageSize));
  adminPage=Math.min(Math.max(adminPage,1),pages);
  const start=(adminPage-1)*pageSize;
  renderAdminTable(rows.slice(start,start+pageSize));
  $('clubFilterCount').textContent=rows.length?
   'Mostrando '+(start+1)+'–'+Math.min(start+pageSize,rows.length)+' de '+rows.length+
   ' · '+adminTableRows.length+' registros totales':
   '0 de '+adminTableRows.length+' registros';
  $('clubAdminPagination').hidden=pages<=1;
  $('clubAdminPageIndicator').textContent='Página '+adminPage+' de '+pages;
  $('clubAdminPrevious').disabled=adminPage<=1;
  $('clubAdminNext').disabled=adminPage>=pages;
 }
 filterStreet.addEventListener('change',()=>{adminPage=1;aplicarFiltroReservas();});
 filterNumber.addEventListener('input',()=>{adminPage=1;aplicarFiltroReservas();});
 filterMonth.addEventListener('change',()=>{adminPage=1;aplicarFiltroReservas();});
 $('clubClearFilters').addEventListener('click',()=>{
  filterStreet.value='';filterNumber.value='';filterMonth.value='';adminPage=1;aplicarFiltroReservas();
 });
 $('clubAdminPrevious').addEventListener('click',()=>{if(adminPage>1){adminPage--;aplicarFiltroReservas();}});
 $('clubAdminNext').addEventListener('click',()=>{if(adminPage*adminPageSize()<adminTableRows.filter(r=>
  coincideFiltrosReserva(r,{calle:filterStreet.value.trim().toLocaleLowerCase('es-MX'),
   numero:filterNumber.value.trim().toLocaleLowerCase('es-MX'),mes:filterMonth.value})).length){
  adminPage++;aplicarFiltroReservas();
 }});
 window.matchMedia('(max-width: 720px), (orientation: landscape) and (max-height: 550px) and (pointer: coarse)')
  .addEventListener?.('change',()=>{adminPage=1;aplicarFiltroReservas();});
 let reviewPage=1;
 const reviewText=$('clubReviewSearch'),reviewMonth=$('clubReviewMonth');
 const reviewSize=()=>window.matchMedia('(max-width: 720px), (orientation: landscape) and (max-height: 550px) and (pointer: coarse)').matches?3:4;
 const cleanReview=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLocaleLowerCase('es-MX').trim().replace(/\s+/g,' ');
 function filteredReview(){
  const needle=cleanReview(reviewText.value),month=reviewMonth.value;
  const base=month?[...adminRows,...historicGoogleRows].filter(r=>
   r.estatus==='PENDIENTE'||r.soloLectura||String(r.fecha||'')<today()):
   adminRows.filter(r=>r.estatus==='PENDIENTE');
  return base.filter(r=>!month||String(r.fecha||'').slice(0,7)===month)
   .filter(r=>{
    if(!needle)return true;
    const street=String(r.casa?.calleCorrecta||r.casa?.calle||'');
    const number=String(r.casa?.numero||'');
    return cleanReview([street,number,r.solicitante].join(' ')).includes(needle)||
     cleanReview(street).includes(needle)||
     cleanReview(number).includes(needle)||
     cleanReview(r.solicitante).includes(needle);
   })
   .sort((a,b)=>String(b.fecha||'').localeCompare(String(a.fecha||''))||
     Number(b.id)-Number(a.id));
 }
 function refreshReviewMonths(){
  const previous=reviewMonth.value;
  const months=[...new Set([...adminRows,...historicGoogleRows]
   .map(r=>String(r.fecha||'').slice(0,7))
   .filter(v=>/^\d{4}-(0[1-9]|1[0-2])$/.test(v)))].sort((a,b)=>b.localeCompare(a));
  reviewMonth.innerHTML='<option value="">Todos los meses</option>'+
   months.map(m=>{
    const [year,mm]=m.split('-');
    const name=new Intl.DateTimeFormat('es-MX',{month:'long',timeZone:'UTC'}).format(
     new Date(Date.UTC(Number(year),Number(mm)-1,1)));
    return '<option value="'+esc(m)+'">'+esc(name.charAt(0).toUpperCase()+name.slice(1)+' '+year)+'</option>';
   }).join('');
  reviewMonth.value=months.includes(previous)?previous:'';
 }
 function renderReviewRequests(){
  const rows=filteredReview(),size=reviewSize();
  const pages=Math.max(1,Math.ceil(rows.length/size));
  reviewPage=Math.min(Math.max(1,reviewPage),pages);
  const from=(reviewPage-1)*size;
  $('clubRequests').innerHTML=rows.slice(from,from+size).map(r=>{
   const past=String(r.fecha||'')<today(),canReview=!r.soloLectura&&!past&&r.estatus==='PENDIENTE';
   const state=r.soloLectura?
    '<span class="club-google-readonly">'+(past?'Histórica · Google':'Solo consulta · Google')+'</span>':
    statusBadge(r.estatus);
   return '<article class="reserve-card" data-pendiente-id="'+Number(r.id)+'"><h3>'+esc(fmt(r.fecha))+'</h3>'+state+
    '<p><b>'+esc(r.solicitante)+'</b> · '+esc(homeText(r))+'</p><p>Solicitud recibida: '+
    esc(r.soloLectura?r.fechaRegistroGoogle:fechaSolicitud(r.creadoEn))+' (Guadalajara)</p><p>'+
    esc(r.soloLectura?'Registro del formulario original':r.motivo||'')+'</p>'+
    (canReview?'<button type="button" class="primary" data-review="'+Number(r.id)+'">Revisar solicitud</button>':
     '<span class="club-google-readonly">Solo consulta · sin cambios a fechas anteriores</span>')+'</article>';
  }).join('')||'<div class="reserve-card">No hay solicitudes para los filtros elegidos.</div>';
  $('clubReviewCount').textContent=rows.length?
   'Mostrando '+(from+1)+'–'+Math.min(from+size,rows.length)+' de '+rows.length+
   ' solicitudes · fecha más reciente primero':'0 solicitudes en revisión';
  $('clubReviewPagination').hidden=pages<=1;
  $('clubReviewPageIndicator').textContent='Página '+reviewPage+' de '+pages;
  $('clubReviewPrevious').disabled=reviewPage===1;
  $('clubReviewNext').disabled=reviewPage>=pages;
 }
 reviewText.addEventListener('input',()=>{reviewPage=1;renderReviewRequests();});
 reviewMonth.addEventListener('change',()=>{reviewPage=1;renderReviewRequests();});
 $('clubReviewPrevious').addEventListener('click',()=>{if(reviewPage>1){reviewPage--;renderReviewRequests();}});
 $('clubReviewNext').addEventListener('click',()=>{
  if(reviewPage*reviewSize()<filteredReview().length){reviewPage++;renderReviewRequests();}
 });
 const reviewMedia=window.matchMedia('(max-width: 720px), (orientation: landscape) and (max-height: 550px) and (pointer: coarse)');
 reviewMedia.addEventListener?.('change',()=>{reviewPage=1;renderReviewRequests();});
 async function adminList(){
  if(!admin)return;
  try{
   const d=await api('/administracion');adminRows=[...(d.data||[])].sort((a,b)=>String(a.casa?.calleCorrecta||a.casa?.calle||'').localeCompare(String(b.casa?.calleCorrecta||b.casa?.calle||''),'es-MX',{numeric:true,sensitivity:'base'})||String(a.casa?.numero||'').localeCompare(String(b.casa?.numero||''),'es-MX',{numeric:true})||String(a.fecha||'').localeCompare(String(b.fecha||'')));
   // Los folios del formulario antiguo son solo consulta si no corresponden
   // a una reserva MySQL. Nunca se habilitan botones de edición en esas filas.
   historicGoogleRows=(d.historialGoogle||[]).map((row,i)=>({...row,id:-(i+1),soloLectura:true}));
   const totalRows=allAdminRecords();
   const summary=d.resumenGoogle||{
    solicitudes:totalRows.length,
    personas:new Set(totalRows.map(r=>String(r.correo||r.telefono||r.solicitante||'').toLowerCase())).size,
    enRevision:adminRows.filter(r=>r.estatus==='PENDIENTE').length,
    reservadas:adminRows.filter(r=>r.estatus==='APROBADA').length
   };
   const cards=[
    ['Solicitudes únicas',summary.solicitudes],
    ['Personas distintas (estimación)',summary.personas],
    ['En revisión',summary.enRevision],
    ['Reservadas',summary.reservadas]
   ];
   $('clubReviewSummary').innerHTML=cards.map(([title,value])=>
    '<div class="club-overview-stat"><small>'+esc(title)+'</small><strong>'+esc(Number(value)||0)+'</strong></div>').join('');
   const driveOk=d.googleDisponible===true&&Boolean(d.googleSincronizadoEn);
   document.querySelectorAll('.club-drive-status').forEach(el=>{
    el.classList.toggle('offline',!driveOk);
    el.title=driveOk?'Última sincronización: '+fechaSolicitud(d.googleSincronizadoEn):
     'Google Drive sin confirmación de sincronización';
   });
   for(const id of ['clubDriveAdminStatusText','clubDriveReviewStatusText'])
    $(id).textContent=driveOk?'Drive sincronizado':'Drive sin conexión verificada';
   $('clubHistoryInfo').textContent=d.googleDisponible===false?
    'Google no respondió. Se muestran solo los registros de MySQL y el resumen podría estar incompleto.':
    'Incluye '+historicGoogleRows.length+' solicitudes adicionales de Google (solo consulta). Las duplicadas de MySQL se omiten; ningún pago se valida por importar la hoja.';
   // Una reserva cancelada NO equivale a devolver el pago: conservarlo en lo recaudado.
   let paid=adminRows.filter(r=>r.pagado);
   let income=paid.reduce((a,r)=>a+Number(r.cuotaRecuperacion),0),
       guarantee=paid.reduce((a,r)=>a+Number(r.depositoGarantia),0),
       cleaning=paid.reduce((a,r)=>a+Number(r.limpieza),0);
   $('clubTotals').innerHTML=[['Solicitudes únicas (MySQL + Google)',summary.solicitudes],
    ['Personas distintas (estimación)',summary.personas],
    ['Reservas aprobadas (MySQL)',adminRows.filter(r=>r.estatus==='APROBADA').length],
    ['Recuperación cobrada',money(income)],['Garantías recibidas',money(guarantee)],
    ['Limpieza cobrada',money(cleaning)]].map(([name,value])=>
     '<div class="stat"><small>'+esc(name)+'</small><strong>'+esc(value)+'</strong></div>').join('');
   adminTableRows=totalRows.sort((a,b)=>Number(b.estatus==='PENDIENTE')-Number(a.estatus==='PENDIENTE')||String(b.fecha||'').localeCompare(String(a.fecha||'')));
    refreshReviewMonths();renderReviewRequests();
   actualizarOpcionesCalle();actualizarOpcionesMes();aplicarFiltroReservas();
  }catch(e){notify(e.message,true);}
 }
 $('clubRequests').addEventListener('click',e=>{const btn=e.target.closest('[data-review]');if(btn){const r=adminRows.find(x=>Number(x.id)===Number(btn.dataset.review));if(r)editReview(r);}});
 const handleAdminAction=async e=>{
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
 };
 $('clubAdminRows').addEventListener('click',handleAdminAction);
 $('clubAdminCards').addEventListener('click',handleAdminAction);
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
  // La barra inferior es exclusiva del contador de condóminos.
  // Administración usa las dos pestañas del menú superior derecho.
  if(!admin){
   $('clubCardsToolbar').hidden=false;
   $('clubMyRedCards').hidden=false;
   void cargarMisRojas();
  }
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
   bancoPublico=result.data;
   window.MJClubPublicProof?.setOfficialAccount(result.data);
   actualizarBancoPublico();
  }).catch(e=>{
   $('clubTransferHelp').hidden=false;
   $('clubTransferHelp').textContent='No se pudieron consultar los datos bancarios oficiales. No deposites hasta confirmar la cuenta: '+e.message;
  });
 }
 if(profile){
  $('clubInstructionsOpen').hidden=true;
  if(!/^#comprobante=/.test(location.hash)){
   $('clubProofIntro').hidden=true;
   $('clubPublicProofFlow').hidden=true;
  }
 }
 if(admin){
  document.querySelectorAll('[data-admin]').forEach(x=>x.hidden=false);
  
  $('clubSubmit').textContent=mobileReservationQuery.matches?'Guardar':'Reservar';
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
  importePublico=Number(p.total);
  window.MJClubPublicProof?.setExpectedAmount(importePublico);
  actualizarBancoPublico();
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
 if(admin)await adminList();
 try{await calendar();}catch(e){notify(e.message,true);}
 tab('reservar');
})();
