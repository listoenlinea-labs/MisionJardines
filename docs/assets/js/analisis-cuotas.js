(async()=>{
 if(!await window.MJAccessReady)return;
 const $=id=>document.getElementById(id);
 const API=window.MJ_API_URL||'https://api-misionjardines.listoenlinea.host/api';
 const token=localStorage.getItem('misionJardinesToken')||sessionStorage.getItem('misionJardinesToken');
 const fmt=n=>Number(n||0).toLocaleString('es-MX',{style:'currency',currency:'MXN',minimumFractionDigits:0,maximumFractionDigits:0});
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
 const shortMonths=['ENE','FEB','MAR','ABR','MAY','JUN','JUL','AGO','SEP','OCT','NOV','DIC'];
 const displayDate=value=>{
  if(!value)return 'Sin fecha';
  let date=String(value);
  if(value instanceof Date||date.includes('T')||/\d\d:\d\d:\d\d/.test(date)){
   const parsed=new Date(value);
   if(!Number.isNaN(parsed.getTime()))date=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(parsed);
  }
  const match=/^(\d{4})-(\d{2})-(\d{2})/.exec(date);
  return match&&Number(match[2])>=1&&Number(match[2])<=12?match[3]+'-'+shortMonths[Number(match[2])-1]+'-'+match[1]:date;
 };
 const mexicoYear=()=>Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/Mexico_City',year:'numeric'}).format(new Date()));
 const moment=new Date();$('financeYear').value=moment.getFullYear();$('financeMonth').value=String(moment.getMonth()+1);
 $('expenseDate').value=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(moment);
 $('expenseStart').value=$('expenseDate').value.slice(0,7);
 $('financeProjectExpenseDate').value=$('expenseDate').value;
 function syncExtraExpense(){
 const project=$('expenseCategory').value==='PROYECTO';
 document.querySelectorAll('.extra-expense-option').forEach(e=>e.hidden=true);
 $('expenseMonths').required=false;$('expenseStart').required=false;
 $('expenseScopeWrap').hidden=project;
 $('expenseFormHint').textContent=project
  ?'Se creará un proyecto con este presupuesto. Registra sus gastos reales en Conceptos dentro del proyecto.'
  :'El egreso se asignará únicamente a '+($('expenseScope').value==='CASA_CLUB'?'Casa Club':'Mantenimiento')+'.';
 $('saveExpense').textContent=project?'Crear proyecto':'Registrar egreso';
}
$('expenseScope').addEventListener('change',syncExtraExpense);
$('expenseCategory').addEventListener('change',syncExtraExpense);syncExtraExpense();
 // Texto de fecha independiente del ancho intrínseco del date picker iOS.
 // El input de tipo date permanece funcional y es el único valor enviado.
 function syncExpenseDateDisplay(input){
  const text=input.previousElementSibling;
  if(!text||!text.classList.contains('mj-date-display'))return;
  const formatted=window.MJDateDisplay?.format(input.value)||'';
  text.textContent=formatted||'Elegir fecha';
  text.classList.toggle('is-empty',!formatted);
 }
 // El input nativo está transparente para mostrar DD-MES-AAAA. En Chrome,
 // tocar la zona de texto solo le da foco; abrir el calendario explícitamente
 // desde la interacción del usuario permite seleccionar cualquier fecha.
 function openExpenseDatePicker(input){
  if(input.disabled||input.readOnly)return;
  if(typeof input.showPicker==='function'){
   try{input.showPicker();return;}catch(_){/* Safari/navegador sin picker programático */}
  }
  input.focus();
 }
 const expenseDateInputs=['expenseDate','expenseFilterFrom','expenseFilterTo'].map($);
 expenseDateInputs.forEach(input=>{
  input.addEventListener('click',()=>openExpenseDatePicker(input));
  input.addEventListener('keydown',event=>{
   if(typeof input.showPicker==='function'&&(event.key==='Enter'||event.key===' ')){
    event.preventDefault();
    openExpenseDatePicker(input);
   }
  });
  input.addEventListener('input',()=>syncExpenseDateDisplay(input));
  input.addEventListener('change',()=>syncExpenseDateDisplay(input));
  syncExpenseDateDisplay(input);
 });
 let data=null;
 let lastSuccessfulFinanceLoad=Date.now(),lastRevisionSeen=null,revisionBusy=false;
 async function refreshWhenChanged(){
  if(revisionBusy||document.visibilityState==='hidden'||!data||
   document.querySelector('.finance-pay-overlay:not([hidden])')||
   document.querySelector('#financeProjectRulesModal:not([hidden])')||
   document.querySelector('#financeBulkModal:not([hidden])'))return;
  revisionBusy=true;
  try{
   const response=await request('/revision');
   const version=Number(response.data?.revision);
   if(!Number.isSafeInteger(version))return;
   if(lastRevisionSeen===null){lastRevisionSeen=version;return;}
   const changed=version!==lastRevisionSeen;
   if(changed||Date.now()-lastSuccessfulFinanceLoad>=10*60*1000){
    lastRevisionSeen=version;
    $('financeLiveStatus').textContent='Sincronizando cambios de otras sesiones…';
    const ok=await load();
    $('financeLiveStatus').textContent=ok
     ?'Datos sincronizados automáticamente.':'No se pudo sincronizar. Usa Actualizar análisis.';
   }
  }catch(_){$('financeLiveStatus').textContent='Sin conexión. Se reintentará sin consultar repetidamente MySQL.';}
  finally{revisionBusy=false;}
 }

 let housePage=1;
 let houseSort={key:"calle",direction:"asc"};
 let activeConcept='MANTENIMIENTO';
let expensePage=1;
 let activeProyectoId=null;
 let importacionExtraordinaria=null;
 let importacionPrevisualizada=false;
 
 let selectedExpenseCategory=null;
 let expenseMonthlySaving=false;
 let selectedIncomeStreet=null;
 let historyPreviousFocus=null;
 let selectedReceiptHouseId=null;
 // La selección corresponde al concepto y al proyecto, nunca a otra pestaña.
 let receiptSelectionScope=null;
 // Puente de lectura para el módulo DOCUMENTAL aislado. No escribe en pagos,
 // filtros, gráficos ni estados; solo ofrece la vivienda elegida para prellenar.
 window.MJManualReceiptContext=()=>({
  selectedHouseId:selectedReceiptHouseId,
  viviendas:(data?.viviendas||[]).map(h=>({
   casaId:Number(h.casaId),calle:String(h.calle||''),
   numero:String(h.numero||''),nombre:String(h.nombre||'')
  }))
 });

 // Tres viviendas por página únicamente en celular; 12 en otras pantallas.
 const phoneLayout=window.matchMedia('(max-width: 700px)');
 const HOUSE_PAGE_SIZE_DESKTOP=12,HOUSE_PAGE_SIZE_PHONE=3;
 const housePageSize=()=>phoneLayout.matches?HOUSE_PAGE_SIZE_PHONE:HOUSE_PAGE_SIZE_DESKTOP;
 let previousHousePageSize=housePageSize();
 const updateHousePageSize=()=>{
  const firstVisibleIndex=(housePage-1)*previousHousePageSize;
  previousHousePageSize=housePageSize();
  housePage=Math.floor(firstVisibleIndex/previousHousePageSize)+1;
  renderHouses();
 };
 if(phoneLayout.addEventListener)phoneLayout.addEventListener('change',updateHousePageSize);
 else phoneLayout.addListener(updateHousePageSize);

 // Cada gráfica tiene su propio control; en escritorio el CSS deja ambos
 // paneles visibles y oculta estos botones, sin alterar el render financiero.
 document.querySelectorAll('.analysis-chart-toggle').forEach(button=>{
  const card=button.closest('.analysis-chart-card');
  const label=button.querySelector('.analysis-chart-toggle-label');
  const panel=document.getElementById(button.getAttribute('aria-controls'));
  if(!card||!label||!panel)return;
  // Cerrados al cargar en escritorio y móvil. El contenido se sigue
  // actualizando en segundo plano, pero no ocupa espacio hasta abrir.
  card.classList.remove('is-expanded');
  panel.hidden=true;
  button.setAttribute('aria-expanded','false');
  label.textContent='Mostrar';
  button.addEventListener('click',()=>{
   const expanded=card.classList.toggle('is-expanded');
   panel.hidden=!expanded;
   button.setAttribute('aria-expanded',String(expanded));
   label.textContent=expanded?'Ocultar':'Mostrar';
  });
 });

 // En celular las tres tarjetas se navegan con scroll-snap horizontal.
 // Ajustar la altura a la tarjeta activa evita espacio vacío innecesario.
 function setupFinancialCarousel(){
  const slider=$('financeMonthlyColumns');
  if(!slider)return;
  const slides=[...slider.querySelectorAll('.finance-chart-card')];
  const buttons=[...document.querySelectorAll('.finance-monthly-jump')];
  if(slides.length!==3||buttons.length!==3)return;
  let activeSlide=0,scrollScheduled=false;
  const clamp=index=>Math.max(0,Math.min(slides.length-1,index));
  const updateHeight=()=>{
   if(!phoneLayout.matches){slider.style.height='';return;}
   const height=Math.ceil(slides[activeSlide].getBoundingClientRect().height);
   if(height>0)slider.style.height=height+'px';
  };
  const updateButtons=()=>{
   buttons.forEach((button,index)=>{
    const current=phoneLayout.matches&&index===activeSlide;
    button.classList.toggle('is-active',current);
    if(current)button.setAttribute('aria-current','true');
    else button.removeAttribute('aria-current');
   });
   updateHeight();
  };
  const syncSlide=()=>{
   if(!phoneLayout.matches)return;
   const index=clamp(Math.round(slider.scrollLeft/Math.max(1,slider.clientWidth)));
   if(index!==activeSlide){activeSlide=index;updateButtons();}
  };
  const goToSlide=index=>{
   if(!phoneLayout.matches)return;
   activeSlide=clamp(index);
   updateButtons();
   slider.scrollTo({left:activeSlide*slider.clientWidth,
    behavior:window.matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  };
  buttons.forEach((button,index)=>button.addEventListener('click',()=>goToSlide(index)));
  slider.addEventListener('scroll',()=>{
   if(scrollScheduled)return;
   scrollScheduled=true;
   requestAnimationFrame(()=>{scrollScheduled=false;syncSlide();});
  },{passive:true});
  slider.addEventListener('keydown',event=>{
   if(!phoneLayout.matches||!['ArrowLeft','ArrowRight'].includes(event.key))return;
   event.preventDefault();
   goToSlide(activeSlide+(event.key==='ArrowRight'?1:-1));
  });
  const layoutChanged=()=>{
   if(!phoneLayout.matches){slider.style.height='';slider.scrollLeft=0;activeSlide=0;}
   else slider.scrollLeft=activeSlide*slider.clientWidth;
   updateButtons();
  };
  if(phoneLayout.addEventListener)phoneLayout.addEventListener('change',layoutChanged);
  else phoneLayout.addListener(layoutChanged);
  window.addEventListener('resize',()=>{
   if(phoneLayout.matches)slider.scrollLeft=activeSlide*slider.clientWidth;
   updateHeight();
  },{passive:true});
  if(typeof ResizeObserver!=='undefined'){
   const observer=new ResizeObserver(updateHeight);
   slides.forEach(slide=>observer.observe(slide));
  }
  updateButtons();
 }
 setupFinancialCarousel();

 const notice=(msg,kind='error')=>{const el=$('financeNotice');el.textContent=msg;el.hidden=false;el.dataset.kind=kind;};
 async function request(path,body,method=body?'POST':'GET'){
  const response=await fetch(API+'/finanzas'+path,{method,
   headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});
  const json=await response.json().catch(()=>({}));
  if(response.status===401){location.replace('login.html');throw Error('Sesión expirada');}
  if(!response.ok||!json.ok)throw Error(json.message||'Error consultando el análisis');
  return json;
 }
 function bar(name,value,max,cost=false,suffix=''){
  const pct=Math.max(0,Math.min(100,max?100*value/max:0));
  return '<div class="bar-row"><strong>'+esc(name)+'</strong><div class="track"><div class="fill'+(cost?' cost':'')+'" style="width:'+pct.toFixed(2)+'%"></div></div><b>'+esc(suffix||pct.toFixed(0)+'%')+'</b></div>';
 }
 function canonicalExpenseCategory(value){return ({LUZ:'CFE',AGUA:'SIAPA',PROYECTOS:'CUOTA_EXTRAORDINARIA'})[value]||value;}
 function expenseLabel(value){return {CFE:'CFE',SIAPA:'SIAPA',JARDINERIA:'Jardinería',MANTENIMIENTO:'Mantenimiento',
  CUOTA_EXTRAORDINARIA:'Cuota extraordinaria',PROYECTO:'Proyecto',INTERNET:'Internet',SERVICIOS:'Servicios',OTROS:'Otros'}[canonicalExpenseCategory(value)]||value;}
 function periodTotals(monthly,accumulated){
  return '<span>Este mes: <b>'+esc(fmt(monthly))+'</b></span><span>Acumulado: <b>'+esc(fmt(accumulated))+'</b></span>';
 }
 function financialCard(label,value){
  const isProjectTitle=label==='Proyecto extraordinario';
  return '<div class="metric'+(isProjectTitle?' finance-project-name-card':'')+
   '"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong></div>';
 }
 // El icono es decorativo: toda la tarjeta sigue siendo el mismo botón de Excel.
 const financeDownloadIcon='<span class="finance-export-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" focusable="false"><path d="M12 3v12m-4-4 4 4 4-4M5 17v3h14v-3"/></svg></span>';
 function downloadableFinancialCard(label,value,tipo){
  return '<button type="button" class="metric finance-export-card" data-finance-export="'+tipo+'" title="Descargar reporte completo en Excel" aria-label="Descargar Excel de '+esc(label)+'"><small>'+financeDownloadIcon+'<span class="finance-export-label">'+esc(label)+'</span></small><strong>'+esc(value)+'</strong></button>';
 }
 function setFinanceHistoryOverlay(id,open){
  const overlay=$(id);
  overlay.hidden=!open;
  overlay.setAttribute('aria-hidden',String(!open));
  if(open){
   overlay.querySelector('.finance-pay-dialog')?.focus();
  }
 }
 function renderExpenseHistory(){
  if(activeConcept!=='MANTENIMIENTO'){selectedExpenseCategory=null;setFinanceHistoryOverlay('financeExpenseHistory',false);return;}
  const rows=data?.egresosPorConcepto?.historialMensual?.[selectedExpenseCategory];
  if(!selectedExpenseCategory||!Array.isArray(rows)){
   setFinanceHistoryOverlay('financeExpenseHistory',false);
   return;
  }
  const name=expenseLabel(selectedExpenseCategory);
  $('financeExpenseHistoryTitle').textContent='Historial de '+name;
  $('financeExpenseHistoryDescription').textContent=
   'Edita el Total pagado de cualquier mes. El cambio se guarda en MySQL como un ajuste contable con folio; no borra los gastos originales.';
  $('financeExpenseHistoryRows').innerHTML=rows.map(r=>
   '<tr data-expense-month="'+esc(r.periodo)+'"><th scope="row">'+esc(r.concepto)+'</th><td>'+esc(r.mes+' '+r.anio)+'</td>'+
   '<td class="finance-expense-month-cell">'+
    '<span class="finance-expense-month-display"><strong>'+esc(fmt(r.totalPagado))+'</strong>'+
     '<button type="button" class="soft finance-expense-month-edit-button" data-edit-expense-month="'+esc(r.periodo)+'" aria-label="Editar total de '+esc(r.concepto+' '+r.mes+' '+r.anio)+'">Editar</button></span>'+
    '<form class="finance-expense-month-form" data-save-expense-month="'+esc(r.periodo)+'" hidden>'+
     '<label class="finance-expense-month-input-label">Importe MXN'+
      '<input type="number" min="0" max="100000000" step="1" required inputmode="numeric" value="'+Math.round(Number(r.totalPagado))+'" aria-label="Nuevo total pagado de '+esc(r.mes+' '+r.anio)+'"></label>'+
     '<div class="finance-expense-month-actions">'+
      '<button type="submit" class="primary">Guardar</button>'+
      '<button type="button" class="soft" data-cancel-expense-month>Cancelar</button></div>'+
    '</form><small class="finance-expense-month-feedback" aria-live="polite"></small>'+
   '</td></tr>'
  ).join('');
  const cents=rows.reduce((sum,r)=>sum+Math.round(Number(r.totalPagado||0)*100),0);
  $('financeExpenseHistoryTotal').innerHTML='<tr><th>Total '+esc(name)+'</th><td>Hasta '+esc(data.periodo)+
   '</td><td>'+esc(fmt(cents/100))+'</td></tr>';
  setFinanceHistoryOverlay('financeExpenseHistory',true);
 }
 function renderIncomeHistory(){
  if(activeConcept!=='MANTENIMIENTO'){selectedIncomeStreet=null;setFinanceHistoryOverlay('financeIncomeHistoryModal',false);return;}
  const street=data?.ingresosMantenimientoCalles?.calles?.find(c=>c.calle===selectedIncomeStreet);
  const rows=street?.historialMensual;
  if(!selectedIncomeStreet||!Array.isArray(rows)){
   setFinanceHistoryOverlay('financeIncomeHistoryModal',false);
   return;
  }
  $('financeIncomeHistoryTitle').textContent='Historial de '+street.calle;
  $('financeIncomeHistoryDescription').textContent=
   'Cuotas cubiertas de '+street.calle+' desde enero hasta '+data.periodo+
   '. Los meses sin pagos muestran $0; cada pago anual se distribuye según los meses que cubre.';
  $('financeIncomeHistoryRows').innerHTML=rows.map(r=>
   '<tr><th scope="row">'+esc(r.calle)+'</th><td>'+esc(r.mes+' '+r.anio)+
   '</td><td>'+esc(fmt(r.totalPagado))+'</td></tr>'
  ).join('');
  const cents=rows.reduce((sum,r)=>sum+Math.round(Number(r.totalPagado||0)*100),0);
  $('financeIncomeHistoryTotal').innerHTML='<tr><th>Total '+esc(street.calle)+'</th><td>Hasta '+esc(data.periodo)+
   '</td><td>'+esc(fmt(cents/100))+'</td></tr>';
  setFinanceHistoryOverlay('financeIncomeHistoryModal',true);
 }
 function closeFinanceHistory(kind){
  if(kind==='income'){
   selectedIncomeStreet=null;
   setFinanceHistoryOverlay('financeIncomeHistoryModal',false);
   $('financeCashChart').querySelectorAll('button[data-income-street]').forEach(b=>b.setAttribute('aria-expanded','false'));
  }else{
   if(expenseMonthlySaving)return;
   selectedExpenseCategory=null;
   setFinanceHistoryOverlay('financeExpenseHistory',false);
   $('financeExpenseChart').querySelectorAll('button[data-expense-concept]').forEach(b=>b.setAttribute('aria-expanded','false'));
  }
  if(historyPreviousFocus?.isConnected)historyPreviousFocus.focus();
  historyPreviousFocus=null;
 }

 function renderMaintenanceDashboard(){
  const houses=data.casas||0;
  const financialCards=[
   ['Casas en padrón',houses],['Con pago registrado',data.pagadas+' · '+data.porcentaje+'%'],
   ['Sin pago completo',data.pendientes+' · '+(houses>0?Math.round(Number(data.pendientes||0)*100/houses):0)+'%'],['Cuotas cubiertas del mes',data.ingresosMantenimientoCalles?fmt(data.ingresosMantenimientoCalles.mes):'Actualiza API'],
   ['Mantenimiento bancario validado',fmt(data.ingresosReportados.mantenimiento)],
   ['Egresos de mantenimiento',fmt(data.finanzasAmbitos?.MANTENIMIENTO?.egresos)],
   ['Diferencia de mantenimiento',fmt(Number(data.finanzasAmbitos?.MANTENIMIENTO?.ingresos||0)-Number(data.finanzasAmbitos?.MANTENIMIENTO?.egresos||0))]
  ];
  $('financialSummary').innerHTML=financialCards.slice(0,4).map(([n,v],i)=>downloadableFinancialCard(n,v,['padron','pagadas','pendientes','historicas'][i])).join('');
  $('financialSecondary').innerHTML=financialCards.slice(4).map(([n,v])=>financialCard(n,v)).join('');
  $('financeDonut').style.setProperty('--percent',data.porcentaje+'%');
  $('financeDonutText').innerHTML=esc(data.porcentaje)+'%<small>Casas pagadas</small>';
  $('financeLegend').innerHTML='<div>Pagadas <b>'+data.pagadas+'</b></div><div>Pendientes <b>'+data.pendientes+'</b></div><div>Total <b>'+houses+'</b></div>';
  $('financeStreetChart').innerHTML=data.calles.length?data.calles.map(c=>bar(c.calle,c.porcentaje,100,false,c.pagadas+'/'+c.total)).join(''):'Sin datos';
  const padronNote=$('financePadronNote');
  if(padronNote){padronNote.textContent=data.avisoPadron||'';padronNote.hidden=!data.avisoPadron;}
  document.querySelector('#financeCompliancePanel h2').textContent='Casas que pagaron';
  document.querySelector('#financeStreetPanel h2').textContent='Porcentaje de viviendas pagadas';
 }
 function renderProjectDashboard(project){
  const houses=(data.viviendasMantenimiento||[]).filter(h=>!h.esPrueba),details=project.viviendasDetalle||[];
  const byId=new Map(details.map(x=>[Number(x.casaId),x]));
  const applied=houses.length-Number(project.noAplica||0),complete=Number(project.cumplidos||0);
  const partial=Number(project.parciales||0),registered=complete+partial;
  const incomplete=Number(project.pendientes||0)+partial;
  const pct=applied?Math.round(registered/applied*10000)/100:0;
  const cards=[['Casas en padrón',houses.length],
   ['Meta alcanzada',complete+' · '+(houses.length?Math.round(complete*100/houses.length):0)+'%'],
   ['Sin meta alcanzada',(houses.length-complete)+' · '+(houses.length?Math.round((houses.length-complete)*100/houses.length):0)+'%'],
   ['Recaudado del proyecto',fmt(project.recaudado)]];
  $('financialSummary').innerHTML=cards.map(([name,val],index)=>
   downloadableFinancialCard(name,val,['padron','pagadas','pendientes','historicas'][index])).join('');
  $('financialSecondary').innerHTML=[
   ['Proyecto extraordinario',project.nombre],['Meta del proyecto',fmt(project.totalEsperado)],
   ['Recaudado',fmt(project.recaudado)],['Por recaudar',fmt(project.saldoPendiente)],
   ['Saldo a favor',fmt(project.saldoFavor)],['Meta alcanzada',complete],
   ['Abonos parciales',partial],['Sin aportaciones',project.pendientes],
   ['No aplica',Number(project.noAplica||0)],['Casas con cuota',applied]
  ].map(([n,v])=>financialCard(n,v)).join('');
  const completion=applied?Math.round(complete/applied*10000)/100:0;
  $('financeDonut').style.setProperty('--percent',completion+'%');
  $('financeDonutText').innerHTML=esc(completion)+'%<small>Meta alcanzada</small>';
  $('financeLegend').innerHTML='<div>Meta alcanzada <b>'+complete+'</b></div>'+
   '<div>Sin meta completa <b>'+incomplete+'</b></div>'+
   '<div>No aplica <b>'+Number(project.noAplica||0)+'</b></div>'+
   '<div>Total viviendas <b>'+houses.length+'</b></div>';
  const grouped=new Map();
  for(const h of houses){
   const name=String(h.calle||'Sin calle'),detail=byId.get(Number(h.casaId));
   if(!grouped.has(name))grouped.set(name,{total:0,eligible:0,completed:0});
   const x=grouped.get(name);x.total++;
   if(detail?.estatus==='NO_APLICA')continue;
   x.eligible++;if(detail?.estatus==='PAGADO')x.completed++;
  }
  $('financeStreetChart').innerHTML=[...grouped].sort(([a],[b])=>a.localeCompare(b,'es-MX',{numeric:true}))
   .map(([name,x])=>bar(name,x.eligible?x.completed/x.eligible*100:0,100,false,
    x.completed+'/'+x.eligible+(x.total!==x.eligible?' · '+(x.total-x.eligible)+' exenta(s)':''))).join('');
  $('financePadronNote').hidden=false;
  $('financePadronNote').textContent='Datos exclusivos del proyecto «'+project.nombre+
   '». Los porcentajes excluyen casas No aplica; las aportaciones no son cobros de mantenimiento.';
  document.querySelector('#financeCompliancePanel h2').textContent='Viviendas con meta alcanzada';
  document.querySelector('#financeStreetPanel h2').textContent='Cumplimiento del proyecto por calle';
 }

 function renderClubDashboard(){
 const scope=data?.finanzasAmbitos?.CASA_CLUB||{},houses=Number(data.casas||0);
 $('financialSummary').innerHTML=[
  ['Casas en padrón',houses],['Reservas pagadas',Number(scope.reservasPagadas||0)],
  ['Ingresos Casa Club',fmt(scope.ingresos)],['Egresos Casa Club',fmt(scope.egresos)]]
  .map(([n,v])=>financialCard(n,v)).join('');
 $('financialSecondary').innerHTML=[['Ámbito','Casa Club · contabilidad independiente'],
  ['Diferencia',fmt(Number(scope.ingresos||0)-Number(scope.egresos||0))]]
  .map(([n,v])=>financialCard(n,v)).join('');
 $('financeDonut').style.setProperty('--percent','0%');
 $('financeDonutText').innerHTML='Club<small>Independiente</small>';
 $('financeLegend').innerHTML='<div>Reservas pagadas <b>'+Number(scope.reservasPagadas||0)+'</b></div>';
 $('financeStreetChart').textContent='Los cobros de Casa Club no son mantenimiento ni proyectos.';
 $('financePadronNote').hidden=true;
 document.querySelector('#financeCompliancePanel h2').textContent='Actividad de Casa Club';
 document.querySelector('#financeStreetPanel h2').textContent='Movimientos de Casa Club';
}
function renderBalanceCard(){
 window.MJFinanceAmbitosUI?.render({data,scope:activeConcept,projectId:activeProyectoId,$,fmt,esc,bar});
}
function render(){
  if(!data)return;
  renderMaintenanceDashboard();
  renderBalanceCard();
  renderExpenseHistory();
  renderIncomeHistory();
  renderExpenses();
  const select=$('financeStreet'),selected=select.value;
  select.innerHTML='<option value="">Todas las calles</option>'+[...data.calles].sort((a,b)=>a.calle.localeCompare(b.calle,'es-MX',{numeric:true,sensitivity:'base'})).map(c=>'<option value="'+esc(c.calle)+'">'+esc(c.calle)+'</option>').join('');
  select.value=data.calles.some(x=>x.calle===selected)?selected:'';
  actualizarAniosUltimoPago();
  renderHouses();
 }
 function renderExpenses(){
 if(!data)return;
 const {proyecto:project,egresos:rows}=window.MJExpenseScope.egresosDelAmbito(
  data,activeConcept,activeProyectoId);
 const normalize=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const text=normalize($('expenseFilterConcept').value.trim()),category=$('expenseFilterCategory').value;
 const from=$('expenseFilterFrom').value,to=$('expenseFilterTo').value,order=$('expenseSort').value;
 const filtered=rows.filter(e=>(!text||normalize(e.concepto).includes(text))
  &&(!category||canonicalExpenseCategory(e.categoria)===category)
  &&(!from||String(e.fecha).slice(0,10)>=from)
  &&(!to||String(e.fecha).slice(0,10)<=to));
 filtered.sort((a,b)=>{
  let cmp=0;
  if(order==='monto_asc')cmp=Number(a.monto)-Number(b.monto);
  else if(order==='monto_desc')cmp=Number(b.monto)-Number(a.monto);
  else if(order==='categoria_asc')cmp=String(a.categoria).localeCompare(String(b.categoria),'es-MX');
  else if(order==='categoria_desc')cmp=String(b.categoria).localeCompare(String(a.categoria),'es-MX');
  else if(order==='fecha_asc')cmp=String(a.fecha).localeCompare(String(b.fecha));
  else cmp=String(b.fecha).localeCompare(String(a.fecha));
  return cmp||String(b.fecha).localeCompare(String(a.fecha))||Number(b.id)-Number(a.id);
 });
 const size=window.matchMedia('(max-width:700px)').matches?3:10;
 const pages=Math.max(1,Math.ceil(filtered.length/size));
 expensePage=Math.max(1,Math.min(expensePage,pages));
 const first=(expensePage-1)*size,shown=filtered.slice(first,first+size);
 $('expenseResultCount').textContent='Mostrando '+(filtered.length?first+1:0)+'–'+(first+shown.length)+
  ' de '+filtered.length+' egresos de '+(activeConcept==='EXTRAORDINARIO'?
  (project?'«'+project.nombre+'»':'proyecto sin seleccionar'):
  activeConcept==='CASA_CLUB'?'Casa Club':'Mantenimiento');
 const cell=(label,value)=>'<td data-label="'+label+'"><span class="expense-field-value">'+value+'</span></td>';
 $('financeExpenseRows').innerHTML=shown.length?shown.map(e=>'<tr>'+
  cell('Fecha',esc(displayDate(e.fecha)))+cell('Categoría',esc(expenseLabel(e.categoria)))+
  cell('Concepto',esc(e.concepto))+cell('Referencia',esc(e.referencia||'—'))+
  cell('Monto',esc(fmt(e.monto)))+cell('Comprobante',e.comprobanteDisponible?
   '<button type="button" class="soft" data-expense-proof="'+Number(e.id)+'">Descargar comprobante</button>':
   (!e.esAjusteMensual&&e.categoria==='CUOTA_EXTRAORDINARIA'&&!e.tieneCuota?
   '<button type="button" class="soft" data-extra-expense="'+Number(e.id)+'">Configurar cobro</button>':'—'))+
  '</tr>').join(''):'<tr><td colspan="6">No hay egresos que coincidan con los filtros.</td></tr>';
 $('expensePageInfo').textContent='Página '+expensePage+' de '+pages;
 $('expensePrev').disabled=expensePage===1;$('expenseNext').disabled=expensePage===pages;
}
 
// Resumen ligero desde MySQL; al abrir el detalle se solicita lectura física C3.
 const c3Key=v=>{const value=String(v??'').trim(),digits=value.replace(/\D/g,'');return digits?digits.replace(/^0+(?=\d)/,''):value.toLowerCase();};
 const todayC3=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
 function tagStateForHouse(tag,diagnosis){
   if(!diagnosis)return tag.estado||{codigo:'SIN_CONFIRMAR',etiqueta:'Por verificar'};
   const reading=(diagnosis.tarjetas||[]).find(d=>c3Key(d.numeroTarjeta)===c3Key(tag.numeroTarjeta));
   if(!reading||!reading.fisicamenteObservado)return {codigo:'SIN_CONFIRMAR',etiqueta:'No observado en esta lectura'};
   if(reading.estadoFisico==='PRESENTE_AUTORIZACION_DESCONOCIDA')
     return {codigo:'SIN_CONFIRMAR',etiqueta:'Permisos C3 sin confirmar'};
   if(reading.estadoFisico==='PRESENTE_SIN_AUTORIZACION')
     return {codigo:'INACTIVO',etiqueta:'Sin autorización en C3'};
   if(reading.estadoFisico!=='PRESENTE_AUTORIZADO')
     return {codigo:'SIN_CONFIRMAR',etiqueta:'Estado C3 por verificar'};
   if(reading.fechaFinC3&&String(reading.fechaFinC3).slice(0,10)<todayC3())
     return {codigo:'INACTIVO',etiqueta:'Vigencia C3 vencida'};
   return tag.bloqueado
     ? {codigo:'ACTIVO',etiqueta:'ALERTA: autorizado en C3 pese a bloqueo'}
     : {codigo:'ACTIVO',etiqueta:'Autorizado en C3'};
 }
 function tagsView(h){
   const t=h.tags||{detalle:[],controlesNoEnlazados:[]};
   const detail=(t.detalle||[]).map(item=>({...item,estadoVista:tagStateForHouse(item,h.tagDiagnostico),
     lecturaC3:(h.tagDiagnostico?.tarjetas||[]).find(r=>c3Key(r.numeroTarjeta)===c3Key(item.numeroTarjeta))||null}));
   return {detail,unlinked:t.controlesNoEnlazados||[],
     activos:detail.filter(x=>x.estadoVista.codigo==='ACTIVO').length,
     inactivos:detail.filter(x=>x.estadoVista.codigo==='INACTIVO').length,
     sinConfirmar:detail.filter(x=>x.estadoVista.codigo==='SIN_CONFIRMAR').length};
 }
 function tagMismatch(h,view){
   if(activeConcept!=='MANTENIMIENTO')return '';
   if(Number(h.saldoPendiente)>0&&view.activos>0)return 'Revisar: deuda y TAG activo';
   if(Number(h.saldoPendiente)===0&&view.inactivos>0)return 'Revisar: sin deuda y TAG inactivo';
   return '';
 }
 // El filtro usa exactamente las mismas alertas que el botón pastel y el modal.
 // Los TAGs SIN_CONFIRMAR nunca se presumen activos/inactivos.
 function isProjectNoAplica(h){
  return activeConcept==='EXTRAORDINARIO'&&Boolean(activeProyectoId)&&
   String(h?.estatus||'').toUpperCase()==='NO_APLICA';
 }
 function houseMatchesStatus(h,status){
   if(!status)return true;
   if(status==='NO_APLICA')return isProjectNoAplica(h);
   if(status==='ADVERTENCIAS')return Boolean(tagMismatch(h,tagsView(h)));
   if(status==='ABONO_CON_ADEUDO')return activeConcept==='MANTENIMIENTO' && Boolean(h.abonoConAdeudo) && Number(h.saldoPendiente)>0;
   if(status==='PAGO_ANUAL')return Boolean(h.ultimoMesPagado?.pagoAnual)&&
     String(h.estatus||'').toUpperCase()==='PAGADO';
   const pagadoCompleto=String(h.estatus||'').toUpperCase()==='PAGADO';
   if(status==='PAGADO')return pagadoCompleto;
   if(status==='PENDIENTE')return ['PENDIENTE','PAGO_PARCIAL'].includes(String(h.estatus||'').toUpperCase());
   return false;
 }
 function renderHouseTagCell(h){
   const v=tagsView(h),count=v.detail.length;
   const parts=[v.activos?v.activos+' activos':'',v.inactivos?v.inactivos+' inactivos':'',
     v.sinConfirmar?v.sinConfirmar+' sin confirmar':'',v.unlinked.length?v.unlinked.length+' sin enlazar':''].filter(Boolean);
   const alert=tagMismatch(h,v);
   const description=['Ver '+count+' '+(count===1?'TAG':'TAGs')+' de '+h.calle+' '+h.numero,
     ...parts,alert].filter(Boolean).join('. ');
   // La celda muestra solo el contador: detalles y alertas se conservan
   // en el modal y en la descripción accesible del botón.
   return '<button type="button" class="house-tags-button'+(alert?' is-warning':'')+
     '" data-tags-house="'+Number(h.casaId)+'" aria-label="'+esc(description)+
     '"><strong>'+count+' '+(count===1?'TAG':'TAGs')+'</strong></button>';
 }
 function renderHousePayCell(h){
   if(isProjectNoAplica(h))
    return '<span class="house-not-applicable-pay" title="Esta vivienda no tiene cuota en el proyecto seleccionado">No aplica</span>';
   // Reutiliza openHousePayment(casaId); no duplica la lógica de cobro.
   const houseName=[h.calle,h.numero].filter(x=>x!==null&&x!==undefined).join(' ');
   return '<button type="button" class="house-pay-button" data-pay-house="'+Number(h.casaId)+
     '" aria-label="Registrar pago para '+esc(houseName)+'">Registrar pago</button>';
 }
 let openedTagsHouse=null;
 let tagVerificationSequence=0;
 const tagsModal=$('houseTagsModal');
 function renderTagsModal(){
   const h=openedTagsHouse;
   if(!h)return;
   const v=tagsView(h);
   const mismatch=tagMismatch(h,v);
   $('houseTagsAddress').textContent=h.calle+' '+h.numero+' · '+(h.nombre||'Sin residente');
   const summary=$('houseTagsSummary');
   summary.textContent=v.detail.length+' TAG(s) · '+v.activos+' activos · '+v.inactivos+
     ' inactivos · '+v.sinConfirmar+' sin confirmar';
   if(mismatch){
     const warning=document.createElement('strong');
     warning.className='tags-summary-alert';
     warning.textContent=mismatch;
     summary.append(' · ',warning);
   }
   // Los tres encabezados se presentan una única vez, sobre todas las filas.
   $('houseTagsColumns').hidden=!v.detail.length;
   $('houseTagsRows').innerHTML=v.detail.length?v.detail.map(t=>{
     const estado=t.estadoVista;
     const cls=estado.codigo==='ACTIVO'?'is-active':estado.codigo==='INACTIVO'?'is-inactive':'is-unknown';
     const fisica=t.lecturaC3?.fisicamenteObservado?String(t.lecturaC3.fechaFinC3||'').slice(0,10):'';
     const guardada=String(t.fechaFin||'').slice(0,10);
     const vigencias='<div class="tags-dates"><strong'+(fisica?'':' class="tags-date-unverified"')+'>'+
       (fisica?'C3: '+esc(displayDate(fisica)):'C3: sin fecha física confirmada')+'</strong>'+
       '<small>MySQL: '+esc(displayDate(guardada))+'</small></div>';
     return '<article class="tags-detail-item">'+
       '<strong class="tags-number">'+esc(t.numeroTarjeta)+'</strong>'+
       '<span class="tags-state '+cls+'">'+esc(estado.etiqueta)+'</span>'+
       vigencias+'</article>';
   }).join(''):'<p class="tags-empty">Esta vivienda no tiene TAGs vinculados en MySQL.</p>';
   if(v.unlinked.length)$('houseTagsRows').innerHTML+='<p class="tags-check-note">Controles registrados sin vínculo confirmado: '+
     esc(v.unlinked.join(', '))+'. Revisa la asignación en ZKTeco.</p>';
 }
 async function verifyHouseTags(){
   const h=openedTagsHouse;
   if(!h)return;
   const requestId=++tagVerificationSequence;
   $('houseTagsC3Status').textContent='Consultando ahora el inventario y las autorizaciones físicas del C3-200…';
   $('houseTagsRefresh').disabled=true;
   try{
     const response=await fetch(API+'/zkteco/diagnostico/viviendas/'+Number(h.casaId),{
       headers:{Authorization:'Bearer '+token},cache:'no-store'
     });
     const json=await response.json().catch(()=>({}));
     if(!response.ok||!json.ok)throw Error([json.message,json.error].filter((value,index,parts)=>value&&parts.indexOf(value)===index).join(' · ')||'No fue posible verificar el C3');
     if(requestId!==tagVerificationSequence||openedTagsHouse!==h)return;
     h.tagDiagnostico=json.data;
     $('houseTagsC3Status').textContent=json.data?.panel?.permisosConfiables
       ? 'Lectura directa del C3 completada. Los TAGs no observados siguen como sin confirmar; una lectura parcial no demuestra su baja.'
       : 'C3 leído, pero las autorizaciones no fueron comprobables. Los estados dudosos se muestran sin confirmar.';
     renderTagsModal();renderHouses();
   }catch(error){
     if(requestId!==tagVerificationSequence||openedTagsHouse!==h)return;
     h.tagDiagnostico=null;
     $('houseTagsC3Status').textContent='No se pudo verificar el C3: '+error.message+
       '. Mostrando únicamente la última información guardada; no se confirma el acceso físico.';
     renderTagsModal();renderHouses();
   }finally{
     if(requestId===tagVerificationSequence)$('houseTagsRefresh').disabled=false;
   }
 }
 function openHouseTags(casaId){
   const h=data?.viviendas?.find(item=>Number(item.casaId)===Number(casaId));
   if(!h)return;
   openedTagsHouse=h;
   tagsModal.hidden=false;
   $('houseTagsC3Status').textContent='Datos guardados en MySQL; esperando verificación física C3.';
   renderTagsModal();
   $('houseTagsClose').focus();
   verifyHouseTags();
 }
 function closeHouseTags(){
   ++tagVerificationSequence;
   tagsModal.hidden=true;
   openedTagsHouse=null;
   $('houseTagsRefresh').disabled=false;
 }
 $('houseTagsClose').addEventListener('click',closeHouseTags);
 $('houseTagsRefresh').addEventListener('click',verifyHouseTags);
 tagsModal.addEventListener('click',event=>{if(event.target===tagsModal)closeHouseTags();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!tagsModal.hidden)closeHouseTags();});
 $('houseTagsEdit').addEventListener('click',()=>{
   const h=openedTagsHouse;if(!h)return;
   const params=new URLSearchParams({casaId:String(h.casaId),calle:h.calle,numero:String(h.numero),from:'analisis'});
   try{sessionStorage.setItem('mj_analisis_return_v1',JSON.stringify({
    at:Date.now(),concept:activeConcept,projectId:activeProyectoId,
    year:$('financeYear').value,month:$('financeMonth').value,
    search:$('financeSearch').value,street:$('financeStreet').value,
    status:$('financeStatus').value,registration:$('financeRegistrationOrder').value,
    paidMonth:$('financeLastPaidMonth').value,paidYear:$('financeLastPaidYear').value,
    page:housePage,sort:houseSort,selectedHouse:Number(h.casaId)
   }));}catch(_){}
   window.location.assign('zkteco.html?'+params.toString());
 });
// Las mensualidades adelantadas se comparan por año y mes real, sin
// condicionar el último pago al año/mes de la gráfica actual.
function indiceUltimoMesPagado(ultimo){
  const year=Number(ultimo?.anio);
  const month=monthsES.findIndex(name=>name.toUpperCase()===String(ultimo?.mes||'').trim().toUpperCase())+1;
  if(!Number.isInteger(year)||year<2020||year>2100||month<1)return null;
  return year*12+month-1;
}
function actualizarAniosUltimoPago(){
  const select=$('financeLastPaidYear'),previous=Number(select.value)||moment.getFullYear();
  const pagos=(data?.viviendas||[]).map(h=>indiceUltimoMesPagado(h.ultimoMesPagado))
    .filter(index=>index!==null).map(index=>Math.floor(index/12));
  const first=Math.max(2020,Math.min(2026,moment.getFullYear(),...pagos));
  const last=Math.min(2100,Math.max(moment.getFullYear()+3,...pagos));
  select.innerHTML=Array.from({length:last-first+1},(_,i)=>first+i)
    .map(year=>'<option value="'+year+'">'+year+'</option>').join('');
  select.value=String(previous>=first&&previous<=last?previous:moment.getFullYear());
}
function cumpleUltimoPago(h,month,year){
  if(!month)return true;
  const actual=indiceUltimoMesPagado(h.ultimoMesPagado);
  return actual!==null&&actual>=year*12+month-1;
}
function elegirConcepto(concepto,{resetPage=true}={}){
  if(!data)return;
  const registros=data.viviendasConceptos?.[concepto];
  if(concepto!=='MANTENIMIENTO'&&!Array.isArray(registros)){
    notice('El servidor todavía no ofrece el análisis de '+(concepto==='CASA_CLUB'?'Casa club':'Cuotas extraordinarias')+'. Despliega también el backend para consultar saldos reales.');
    return;
  }
  const proyectos=data.proyectosExtraordinarios||[];
  $('financeProjectPanel').hidden=concepto!=='EXTRAORDINARIO';
  
  let seleccionado=null;
  if(concepto==='EXTRAORDINARIO'){
   seleccionado=proyectos.find(p=>Number(p.id)===Number(activeProyectoId))||proyectos[0]||null;
   activeProyectoId=seleccionado?.id||null;
   $('financeProjectSelect').innerHTML=proyectos.length
    ?proyectos.map(p=>'<option value="'+Number(p.id)+'">'+esc(p.nombre)+'</option>').join('')
    :'<option value="">Aún no hay proyectos configurados</option>';
   $('financeProjectSelect').value=String(activeProyectoId||'');
   $('financeProjectSelect').dataset.hasSelection=String(Boolean(seleccionado));
   $('financeProjectSelect').title=seleccionado?'Proyecto seleccionado: '+seleccionado.nombre:'Selecciona un proyecto';
   $('financeProjectRulesEdit').disabled=!seleccionado;
   $('financeProjectRulesEdit').title=seleccionado?'Modificar las cuotas de '+seleccionado.nombre:'Selecciona un proyecto para editar sus importes';
   $('financeProjectMetrics').innerHTML=seleccionado?[
    ['Meta',fmt(seleccionado.totalEsperado)],
    ['Recaudado',fmt(seleccionado.recaudado)],
    ['Por recaudar',fmt(seleccionado.saldoPendiente)],
    ['Casas cumplidas',String(seleccionado.cumplidos)+' / '+String(seleccionado.viviendas-Number(seleccionado.noAplica||0))],
    ['Sin aportaciones',String(seleccionado.pendientes)],
    ['Avance',String(seleccionado.porcentaje)+'%']
   ].map(([label,value])=>'<div><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong></div>').join('')
    :'<p class="hint">Crea un proyecto para configurar el presupuesto y sus 231 viviendas.</p>';
   $('financeProjectInfo').textContent=seleccionado
    ?'Proyecto: '+seleccionado.nombre+'. Los importes son independientes del mantenimiento y no bloquean TAGs.'+
     (seleccionado.sinCargo?' Atención: '+seleccionado.sinCargo+' viviendas sin cargo.':'')+
     (seleccionado.noAplica?' · '+seleccionado.noAplica+' vivienda(s) No aplica.':'')
    :'Las aportaciones se registran por proyecto sin modificar mantenimiento ni TAGs.';
  }
  const registrosProyecto=seleccionado?.viviendasDetalle||null;
  const financial=new Map((registrosProyecto||registros||[]).map(h=>[String(h.casaId),h]));
  if(concepto!=='MANTENIMIENTO'&&data.viviendasMantenimiento.some(h=>!h.esPrueba&&!financial.has(String(h.casaId)))){
    notice('Faltan movimientos por vivienda en la respuesta del servidor. No se mostrarán importes incompletos.');
    return;
  }
  activeConcept=concepto;
  // Al cambiar de concepto o de proyecto, no arrastrar la fila ni su recibo.
  // Una recarga del MISMO proyecto sí conserva la selección que siga visible.
  const nextSelectionScope=concepto==='EXTRAORDINARIO'
   ?'EXTRAORDINARIO:'+String(activeProyectoId||''):concepto;
  if(receiptSelectionScope!==nextSelectionScope){
   selectedReceiptHouseId=null;expensePage=1;
   // Cada pestaña y proyecto tiene sus filtros de consulta independientes.
   for(const id of ['expenseFilterConcept','expenseFilterCategory','expenseFilterFrom','expenseFilterTo'])
    $(id).value='';
   $('expenseSort').value='fecha_desc';
   expenseDateInputs.forEach(syncExpenseDateDisplay);
  }
  receiptSelectionScope=nextSelectionScope;
  const esProyecto=concepto==='EXTRAORDINARIO';
  for(const option of $('expenseFilterCategory').options){
   const disponible=!option.value||(esProyecto?option.value==='PROYECTO':option.value!=='PROYECTO');
   option.hidden=!disponible;option.disabled=!disponible;
  }
  $('expenseHistoryTitle').textContent=esProyecto?'Gastos del proyecto seleccionado':
   concepto==='CASA_CLUB'?'Movimientos de Casa Club':'Movimientos de mantenimiento';
  $('expenseHistoryScope').textContent=esProyecto
   ?(seleccionado?'Solo gastos registrados de «'+seleccionado.nombre+'».':'Selecciona un proyecto para consultar sus gastos.')
   :concepto==='CASA_CLUB'?'Solo gastos de Casa Club; sin mantenimiento ni proyectos.'
   :'Solo gastos de mantenimiento; sin proyectos ni Casa Club.';
  if(concepto==='CASA_CLUB')selectedReceiptHouseId=null;
  $('financeReceiptToolbar').hidden=concepto==='CASA_CLUB';
  $('financeHousePanel').classList.toggle('maintenance-receipt-active',concepto==='MANTENIMIENTO');
  $('financeHousePanel').classList.toggle('extraordinary-receipt-active',concepto==='EXTRAORDINARIO'&&!!seleccionado);
  data.viviendas=data.viviendasMantenimiento.filter(h=>concepto==='MANTENIMIENTO'||!h.esPrueba).map(h=>concepto==='MANTENIMIENTO'?h:{...h,...financial.get(String(h.casaId)),
   ...(concepto==='EXTRAORDINARIO'&&seleccionado?{ultimoMesPagado:null}: {})}); 
  if(concepto==='EXTRAORDINARIO'&&seleccionado)renderProjectDashboard(seleccionado);
  else if(concepto==='CASA_CLUB')renderClubDashboard();
  else renderMaintenanceDashboard();
  if(['MANTENIMIENTO','CASA_CLUB'].includes(concepto)){$('expenseScope').value=concepto;syncExtraExpense();}
  renderBalanceCard();renderExpenses();
  $('financeLastPeriodTitle').textContent=concepto==='EXTRAORDINARIO'&&seleccionado?'Último abono':'Último mes pagado';
  if(concepto==='EXTRAORDINARIO'){
   $('financeLastPaidMonth').value='';
   const periodFilter=document.querySelector('.paid-through-filter');
   if(periodFilter)periodFilter.hidden=!!seleccionado;
  }else{
   const periodFilter=document.querySelector('.paid-through-filter');
   if(periodFilter)periodFilter.hidden=false;
  }
  document.querySelectorAll('[data-finance-concept]').forEach(tab=>{
    const selected=tab.dataset.financeConcept===concepto;
    tab.classList.toggle('active',selected);
    tab.setAttribute('aria-selected',String(selected));
    tab.tabIndex=selected?0:-1;
    if(selected)$('financeHousePanel').setAttribute('aria-labelledby',tab.id);
  });
  const noAplicaOption=$('financeStatus').querySelector('option[value="NO_APLICA"]');
  if(noAplicaOption){
   noAplicaOption.hidden=concepto!=='EXTRAORDINARIO';
   noAplicaOption.disabled=concepto!=='EXTRAORDINARIO';
  }
  for(const choice of ['ADVERTENCIAS','PAGO_ANUAL','ABONO_CON_ADEUDO']){
   const option=$('financeStatus').querySelector('option[value="'+choice+'"]');
   if(option)option.disabled=concepto!=='MANTENIMIENTO';
  }
  if(concepto!=='EXTRAORDINARIO'&&$('financeStatus').value==='NO_APLICA')$('financeStatus').value='';
  if(concepto!=='MANTENIMIENTO'&&['ADVERTENCIAS','PAGO_ANUAL','ABONO_CON_ADEUDO'].includes($('financeStatus').value))
   $('financeStatus').value='';
  $('financeConceptHint').textContent={
    MANTENIMIENTO:'Mantenimiento: pagos mensuales, recargos y saldos acumulados hasta el período seleccionado.',
    EXTRAORDINARIO:'Selecciona un proyecto para consultar sus aportaciones, cuotas especiales y saldos. El proyecto es independiente de mantenimiento y TAGs.',
    CASA_CLUB:'Casa club: solo reservas aprobadas. El saldo vence en la fecha límite de pago, no en la fecha del evento.'
  }[concepto];
  // Cambio explícito de pestaña: página 1. La recarga de datos tras
  // editar, anular o registrar un pago preserva la página actual.
  if(resetPage)housePage=1;
  actualizarAniosUltimoPago();
  renderHouses();
}
function syncHouseSort(){
  const labels={calle:'Calle',numero:'Casa',nombre:'Residente registrado',estatus:'Estado',pagado:'Pagado',registro:'Fecha de registro',mes:'Último mes pagado',saldo:'Saldo pendiente',tags:'TAGs',pago:'Pago'};
  document.querySelectorAll('[data-house-sort]').forEach(button=>{
   const active=button.dataset.houseSort===houseSort.key;
   button.closest('th').setAttribute('aria-sort',active?(houseSort.direction==='desc'?'descending':'ascending'):'none');
   button.querySelector('[data-sort-indicator]').textContent=active?(houseSort.direction==='desc'?'↓':'↑'):'↓';
  });
  $('financeColumnSort').value=houseSort.key;
  $('financeRegistrationOrder').value=houseSort.key==='registro'?'registro_'+houseSort.direction:'';
  $('financeColumnDirection').textContent=houseSort.direction==='desc'?'Descendente ↓':'Ascendente ↑';
  $('financeSortStatus').textContent='Orden: '+labels[houseSort.key]+', '+(houseSort.direction==='desc'?'descendente':'ascendente')+'. '+(houseSort.key==='registro'?'Los registros sin fecha aparecen al final.':'Presiona de nuevo para invertir.');
}
function orderHouses(key){
 houseSort=window.MJHouseSort.nextSort(houseSort,key);
 housePage=1;renderHouses();
}

 // Alta rápida en el padrón: usa el ID estable de vivienda, no su nombre visible.
 const residentModal=$('financeResidentModal');
 let openedResidentHouseId=null;
 let residentPreviousFocus=null;
 let residentSaving=false;
 const hasResident=h=>h?.residenteRegistrado===false?false:Boolean(String(h?.nombre||'').trim());
 function residentCell(h){
   if(hasResident(h))return esc(h.nombre);
   return '<button type="button" class="finance-resident-register" data-resident-register="'+Number(h.casaId)+'"'
     +' aria-label="Registrar residente en '+esc(h.calle+' '+h.numero)+'">+ Registrar residente</button>';
 }
 function openResidentRegistration(houseId,trigger){
   const id=Number(houseId);
   if(!Number.isSafeInteger(id)||id<1||residentSaving)return;
   const house=data?.viviendas?.find(h=>Number(h.casaId)===id);
   if(!house)return;
   if(hasResident(house)){
     notice('La vivienda '+house.calle+' '+house.numero+' ya tiene un residente registrado. Actualiza el análisis para consultarlo.');
     return;
   }
   openedResidentHouseId=id;
   residentPreviousFocus=trigger||document.activeElement;
   $('financeResidentForm').reset();
   $('financeResidentHouse').textContent='Vivienda: '+house.calle+' '+house.numero;
   $('financeResidentStatus').textContent='';
   $('financeResidentSubmit').disabled=false;
   residentModal.hidden=false;
   $('financeResidentName').focus();
 }
 function closeResidentRegistration(){
   if(residentSaving)return;
   residentModal.hidden=true;
   openedResidentHouseId=null;
   $('financeResidentForm').reset();
   $('financeResidentStatus').textContent='';
   if(residentPreviousFocus?.isConnected)residentPreviousFocus.focus();
   residentPreviousFocus=null;
 }
 $('financeResidentClose').addEventListener('click',closeResidentRegistration);
 $('financeResidentCancel').addEventListener('click',closeResidentRegistration);
 residentModal.addEventListener('click',event=>{
   if(event.target===residentModal)closeResidentRegistration();
 });
 document.addEventListener('keydown',event=>{
   if(residentModal.hidden)return;
   if(event.key==='Escape'){event.preventDefault();closeResidentRegistration();return;}
   if(event.key!=='Tab')return;
   const enabled=[...residentModal.querySelectorAll('button:not([disabled]),input:not([disabled])')]
     .filter(element=>!element.closest('[hidden]'));
   const first=enabled[0],last=enabled.at(-1);
   if(!first||!last)return;
   if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus();}
   else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
 });
 $('financeResidentForm').addEventListener('submit',async event=>{
   event.preventDefault();
   if(residentSaving||!openedResidentHouseId)return;
   const casaId=openedResidentHouseId;
   const nombreCompleto=$('financeResidentName').value.trim().replace(/\s+/g,' ');
   if(nombreCompleto.length<2||nombreCompleto.length>150){
     $('financeResidentStatus').textContent='Escribe el nombre completo del residente (de 2 a 150 caracteres).';
     return;
   }
   residentSaving=true;
   $('financeResidentSubmit').disabled=true;
   $('financeResidentStatus').textContent='Guardando residente…';
   try{
     const response=await request('/viviendas/'+casaId+'/registrar-residente',{nombreCompleto});
     const saved=response.data;
     // No repetir jamás la escritura si falla solo la posterior actualización.
     if(data?.viviendas){
       const house=data.viviendas.find(h=>Number(h.casaId)===casaId);
       if(house){house.nombre=saved.nombre;house.residenteRegistrado=true;}
     }
     residentSaving=false;
     closeResidentRegistration();
     const refreshed=await load();
     if(!refreshed)renderHouses();
     notice('Residente "'+saved.nombre+'" registrado en '+(data?.viviendas?.find(h=>Number(h.casaId)===casaId)?.calle||'la vivienda')+
       '. Nombre guardado en MySQL.'+(refreshed?'':' No se pudo recargar el análisis; no repitas el registro.'),'success');
   }catch(error){
     $('financeResidentStatus').textContent=error.message;
     residentSaving=false;
     $('financeResidentSubmit').disabled=false;
   }
 });

function renderHouses(){
  if(!data)return;
  const query=$('financeSearch').value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),
    street=$('financeStreet').value,status=$('financeStatus').value;
  const ultimoMes=Number($('financeLastPaidMonth').value)||0;
  const ultimoAnio=Number($('financeLastPaidYear').value);
  const filtered=data.viviendas.filter(h=>{
   const hay=[h.calle,h.numero,h.nombre].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
   return (!query||hay.includes(query))&&(!street||h.calle===street)&&
     houseMatchesStatus(h,status)&&cumpleUltimoPago(h,ultimoMes,ultimoAnio);
  }).sort((a,b)=>window.MJHouseSort.compareHouses(a,b,houseSort));
  syncHouseSort();
  const pageSize=housePageSize();
  const totalPages=Math.max(1,Math.ceil(filtered.length/pageSize));
  housePage=Math.min(Math.max(housePage,1),totalPages);
  const visible=filtered.slice((housePage-1)*pageSize,housePage*pageSize);
  const selectionAvailable=activeConcept==='MANTENIMIENTO'||(activeConcept==='EXTRAORDINARIO'&&!!activeProyectoId);
  if(!selectionAvailable||!visible.some(h=>Number(h.casaId)===selectedReceiptHouseId))selectedReceiptHouseId=null;
  const selected=visible.find(h=>Number(h.casaId)===selectedReceiptHouseId);
  $('financeGenerateReceipt').disabled=!selected||isProjectNoAplica(selected);
  $('financeGenerateReceipt').title=selected
    ?'Generar recibo de '+selected.calle+' '+selected.numero
    :'Selecciona una vivienda de la tabla para generar su recibo';
  $('financeGenerateReceipt').setAttribute('aria-label',$('financeGenerateReceipt').title);
  $('financeReceiptSelection').textContent=selected
    ? (isProjectNoAplica(selected)
       ? 'Vivienda seleccionada: '+selected.calle+' '+selected.numero+' · No aplica; no hay recibo por generar.'
       : 'Vivienda seleccionada: '+selected.calle+' '+selected.numero+' · '+(selected.nombre||'Sin residente'))
    : 'Selecciona una sola vivienda para generar el recibo de su último pago registrado.';
  const houseCell=(label,value)=>'<td data-label="'+label+'"><span class="house-field-value">'+value+'</span></td>';
  $('financeHouseRows').innerHTML=visible.length?visible.map(h=>'<tr data-receipt-row="'+Number(h.casaId)+'"'+' class="'+[(Number(h.casaId)===selectedReceiptHouseId?'house-receipt-selected':''),(activeConcept==='MANTENIMIENTO'&&Number(h.saldoPendiente)>0&&String(h.estatus||'').toUpperCase()!=='PAGADO'?'house-row-overdue':'')].filter(Boolean).join(' ')+'"'+(selectionAvailable?' tabindex="0" aria-selected="'+(Number(h.casaId)===selectedReceiptHouseId)+'" aria-label="Seleccionar vivienda '+esc(h.calle+' '+h.numero)+' para generar recibo"':'')+'>'+
    houseCell('Calle',esc(h.calle))+houseCell('Casa',esc(h.numero))+
    houseCell('Residente',residentCell(h))+
    houseCell('Estado',activeConcept==='MANTENIMIENTO'&&h.abonoConAdeudo&&Number(h.saldoPendiente)>0
      ?'<span class="house-abono-debt-tag" title="Tiene un pago registrado y todavía conserva adeudos pendientes">Abono con adeudo</span>'
      :'<span class="'+(isProjectNoAplica(h)?'house-no-aplica-tag':h.estatus==='SIN CARGOS'?'status-neutral':String(h.estatus||'').toUpperCase()==='PAGADO'?'status-paid':'status-pending')+'">'+esc(activeConcept==='EXTRAORDINARIO'&&activeProyectoId
       ?({PENDIENTE:'SIN APORTES',PAGO_PARCIAL:'ABONANDO',PAGADO:'META ALCANZADA',NO_APLICA:'No aplica'}[h.estatus]||h.estatus)
       :h.estatus)+'</span>')+
    houseCell('Pagado','<button type="button" class="house-paid-history'+(isProjectNoAplica(h)?' is-no-aplica':h.estatus==='SIN CARGOS'?' is-neutral':String(h.estatus||'').toUpperCase()==='PAGADO'?'':' is-pending')+'" data-paid-history="'+Number(h.casaId)+'" aria-label="Ver historial de pagos de '+esc(h.calle+' '+h.numero)+'" title="Consultar historial de pagos"><strong>'+esc(activeConcept==='EXTRAORDINARIO'&&activeProyectoId
       ?(isProjectNoAplica(h)?'No aplica':Number(h.montoPagado)>0?fmt(h.montoPagado):'Sin pagos')
       :(Number(h.ultimoPago?.monto||0)>0?fmt(h.ultimoPago.monto):'Sin pagos'))+'</strong></button>')+
    houseCell('Último mes pagado',activeConcept==='EXTRAORDINARIO'&&activeProyectoId
     ?esc(isProjectNoAplica(h)?'No aplica':h.ultimoPago?.fecha?displayDate(h.ultimoPago.fecha):'Sin abono')
     :h.ultimoMesPagado?.pagoAnual?
      '<span class="house-annual-label" title="Hasta diciembre de '+esc(h.ultimoMesPagado.anio)+'">Pago anual</span>':
      esc(h.ultimoMesPagado?h.ultimoMesPagado.mes+' '+h.ultimoMesPagado.anio:'Sin pago'))+
    houseCell('Saldo pendiente',isProjectNoAplica(h)
      ?'<span class="house-amount-no-aplica">No aplica</span>'
      :'<span class="house-amount'+(String(h.estatus||'').toUpperCase()==='PENDIENTE'&&Number(h.saldoPendiente)>0?' is-overdue':'')+'">'+esc(fmt(h.saldoPendiente))+'</span>')+
    houseCell('TAGs',renderHouseTagCell(h))+
    houseCell('Pago',renderHousePayCell(h))+'</tr>').join(''):'<tr><td colspan="9">No hay viviendas que coincidan con estos filtros.</td></tr>';
  $('financePageInfo').textContent=filtered.length ? 'Página '+housePage+' de '+totalPages+' · '+filtered.length+' viviendas' : 'Sin resultados';
  $('financePrev').disabled=housePage===1;
  $('financeNext').disabled=housePage>=totalPages;
 }
 let activePaymentHouse=null;
 let currentPaymentQuote=null;
 let annualPaymentSelected=false;
 function selectAnnualPayment(selected){
   annualPaymentSelected=Boolean(selected);
   $('housePaymentAnnual').setAttribute('aria-pressed',String(annualPaymentSelected));
   $('housePaymentAnnual').classList.toggle('active',annualPaymentSelected);
 }
 let confirmedPaymentTarget=null;
 let quoteSequence=0;
 const paymentModal=$('housePaymentModal');
 let currentAbonoAdeudo=null;
 let abonoSequence=0;
 async function checkAbonoAdeudo(){
   const seq=++abonoSequence;
   currentAbonoAdeudo=null;
   $('houseAbonoAdeudoOpen').hidden=true;
   if(!activePaymentHouse || $('housePaymentType').value!=='MANTENIMIENTO')return;
   try{
     const response=await request('/pagos-vivienda/'+Number(activePaymentHouse.casaId)+'/abono-con-adeudo');
     if(seq!==abonoSequence || !activePaymentHouse)return;
     currentAbonoAdeudo=response.data;
     $('houseAbonoAdeudoOpen').hidden=!response.data?.disponible;
     $('houseAbonoAdeudoOpen').title=response.data?.motivo||'';
   }catch(_){ $('houseAbonoAdeudoOpen').hidden=true; }
 }
 function syncAbonoAdeudoConfirm(){
   $('houseAbonoAdeudoSave').disabled = !Boolean(activePaymentHouse && currentAbonoAdeudo?.disponible && $('houseAbonoAdeudoConfirm').checked);
 }
 function showAbonoAdeudo(){
   if(!currentAbonoAdeudo?.disponible || !activePaymentHouse)return;
   $('housePaymentForm').hidden=true;
   $('houseAbonoAdeudoPanel').hidden=false;
   $('houseAbonoAdeudoPeriod').value=currentAbonoAdeudo.nombreMes+' '+currentAbonoAdeudo.anio;
   $('houseAbonoAdeudoAmount').value=String(currentAbonoAdeudo.importe);
   $('houseAbonoAdeudoMethod').value=$('housePaymentMethod').value;
   $('houseAbonoAdeudoConfirm').checked=false;
   syncAbonoAdeudoConfirm();
   $('houseAbonoAdeudoStatus').textContent='';
   $('houseAbonoAdeudoConfirm').focus();
 }
 function backFromAbonoAdeudo(){
   $('houseAbonoAdeudoSave').disabled=true;
   $('houseAbonoAdeudoConfirm').checked=false;
   $('houseAbonoAdeudoPanel').hidden=true;
   $('housePaymentForm').hidden=false;
   $('houseAbonoAdeudoStatus').textContent='';
 }
 async function saveAbonoAdeudo(event){
   event.preventDefault();
   const house=activePaymentHouse;
   const quote=currentAbonoAdeudo;
   if(!house || !quote?.disponible || !$('houseAbonoAdeudoConfirm').checked || $('houseAbonoAdeudoSave').disabled)return;
   const confirmText='¿Confirmas que recibiste '+fmt(quote.importe)+' de '+house.calle+' '+house.numero+
     ' correspondiente a '+quote.nombreMes+' '+quote.anio+'?'+
     '\nLos adeudos anteriores continuarán pendientes y NO se actualizarán los TAGs.';
   if(!window.confirm(confirmText))return;
   const button=$('houseAbonoAdeudoSave');
   button.disabled=true;
   $('houseAbonoAdeudoStatus').textContent='Registrando el abono…';
   try{
     const response=await request('/pagos-vivienda/abono-con-adeudo',{
       casaId:Number(house.casaId),anio:quote.anio,mes:quote.mes,monto:quote.importe,
       formaPago:$('houseAbonoAdeudoMethod').value,confirmarAdeudo:true
     });
     const result=response.data;
     const casaId=Number(house.casaId);
     closeHousePayment();
     const refreshed=await load();
     let verificado=false;
     try{
       const historial=(await request('/pagos-vivienda/'+casaId+'/historial?concepto=MANTENIMIENTO')).data;
       verificado=(historial.movimientos||[]).some(p=>p.referencia===result.referencia &&
         p.fuente==='ABONO_CON_ADEUDO' &&
         Math.round(Number(p.monto)*100)===Math.round(Number(result.monto)*100));
     }catch(_){/* El movimiento exitoso no debe registrarse otra vez si falla la consulta. */}
     notice('Abono con adeudo registrado para '+result.nombreMes+' '+result.anio+
       '. Los meses anteriores siguen pendientes. Sin cambios en TAGs.'+
       (refreshed?'':' No se pudo actualizar la tabla; no repitas el pago.')+
       (verificado?' El movimiento aparece en el historial de mantenimiento.':
       ' No se pudo comprobar el historial; revísalo antes de intentar otro cobro.'),'success');
     try{await openHouseReceipt(casaId,result.referencia);}
     catch(_){notice('El abono se registró. Abre el historial para generar el recibo con su referencia.','success');}
   }catch(error){
     $('houseAbonoAdeudoStatus').textContent=error.message;
     syncAbonoAdeudoConfirm();
     void checkAbonoAdeudo();
   }
 }
 $('houseAbonoAdeudoOpen').addEventListener('click',showAbonoAdeudo);
 $('houseAbonoAdeudoBack').addEventListener('click',backFromAbonoAdeudo);
 $('houseAbonoAdeudoPanel').addEventListener('submit',saveAbonoAdeudo);
 $('houseAbonoAdeudoConfirm').addEventListener('change',syncAbonoAdeudoConfirm);

 const historyModal=$('houseHistoryModal');
 let historySequence=0;
 let historyReturnFocus=null;
 let currentHistoryHouseId=null;
 let historyMovements=[];
 const tariffPanel=$('houseTariffPanel');
 const projectNoAplicaButton=$('houseProjectNoAplica');
 const projectNoAplicaStatus=$('houseProjectNoAplicaStatus');
 let projectNoAplicaSaving=false;
 let savedTariffSettings=null;
 function syncProjectNoAplica(house){
  const isProject=activeConcept==='EXTRAORDINARIO'&&Boolean(activeProyectoId);
  const exempt=isProject&&isProjectNoAplica(house);
  const hasPaid=isProject&&Number(house?.montoPagado||0)>0;
  projectNoAplicaButton.hidden=!isProject;
  projectNoAplicaButton.setAttribute('aria-pressed',String(Boolean(exempt)));
  projectNoAplicaButton.disabled=!isProject||Boolean(exempt)||Boolean(hasPaid)||projectNoAplicaSaving;
  projectNoAplicaButton.title=exempt
   ?'Esta vivienda ya está exenta. Utiliza Modificar cuota del proyecto para asignar otro importe.'
   :hasPaid?'La vivienda tiene aportaciones registradas. No se puede exentar sin conciliarlas.'
   :'Dejar la cuota de esta vivienda en $0 para el proyecto seleccionado.';
  projectNoAplicaStatus.hidden=!exempt&&!hasPaid;
  projectNoAplicaStatus.textContent=exempt
   ?'No aplica: esta vivienda no debe pagar este proyecto. Para volver a cobrar, usa Modificar cuota del proyecto.'
   :hasPaid?'No es posible marcar No aplica: existen aportaciones registradas.':'';
 }

 const houseHasNoFee=house=>{
  const mes=todayC3().slice(0,7);
  return Array.isArray(house?.exencionesRecargo)&&house.exencionesRecargo.some(r=>r?.desde<=mes&&(!r.hasta||r.hasta>=mes));
 };
 function paintTariffSavedIndicator(state){
  const badge=$('houseTariffSavedState');
  const project=activeConcept==='EXTRAORDINARIO';
  const labels=project?{active:'Cuota guardada',pending:'Cambios sin guardar',unknown:'Sin verificar'}:
   {exempt:'Exención guardada',active:'Recargo activo · Guardado',pending:'Cambios sin guardar',unknown:'Sin verificar'};
  badge.dataset.state=state;
  $('houseTariffSavedText').textContent=labels[state]||labels.unknown;
 }
 function syncTariffIndicator(){
  if(!savedTariffSettings||currentHistoryHouseId!==savedTariffSettings.casaId||
     savedTariffSettings.tipo!==activeConcept){paintTariffSavedIndicator('unknown');return;}
  const changed=Math.round(Number($('houseTariffInput').value)*100)!==Math.round(savedTariffSettings.tarifa*100)||
   (activeConcept==='MANTENIMIENTO'&&$('houseTariffNoFee').checked!==savedTariffSettings.sinRecargo);
  paintTariffSavedIndicator(changed?'pending':activeConcept==='MANTENIMIENTO'&&savedTariffSettings.sinRecargo?'exempt':'active');
 }
 function showSavedTariff(house){
  const project=activeConcept==='EXTRAORDINARIO';
  const amount=Number(project?house.montoCuota:(house.tarifaMensual||300));
  savedTariffSettings={casaId:Number(house.casaId),tarifa:amount,
   sinRecargo:project?false:houseHasNoFee(house),tipo:activeConcept,proyectoId:project?Number(activeProyectoId):null};
  $('houseTariffAddress').textContent=house.calle+' '+house.numero+
   (project?' · '+((data?.proyectosExtraordinarios||[]).find(p=>Number(p.id)===Number(activeProyectoId))?.nombre||'Proyecto'):'');
  $('houseTariffConceptLabel').textContent=project?'CUOTA EXTRAORDINARIA POR VIVIENDA':'TARIFA POR VIVIENDA';
  $('houseTariffTitle').textContent=project?'Modificar cuota del proyecto':'Modificar cuotas';
  $('houseTariffAmountLabel').textContent=project?'Importe por aportar al proyecto (MXN)':'Cuota mensual de mantenimiento (MXN)';
  $('houseTariffInput').min=project?'0':'1';
  $('houseTariffInput').max=project?'10000000':'10000';
  $('houseTariffInput').step=project?'0.01':'1';
  $('houseTariffInput').value=String(amount);
  $('houseTariffNoFeeWrap').hidden=project;
  $('houseProjectTariffInfo').hidden=!project;
  $('houseTariffSave').textContent=project?'Guardar cuota del proyecto':'Guardar cuota mensual';
  $('houseTariffNoFee').checked=savedTariffSettings.sinRecargo;
  syncTariffIndicator();
 }
 function conceptTitle(type){return {MANTENIMIENTO:'Mantenimiento',EXTRAORDINARIO:'Cuotas extraordinarias',CASA_CLUB:'Casa club'}[type]||type;}
 function debtPeriod(value){
  const match=/^(\d{4})-(\d{2})/.exec(String(value||''));
  return match&&Number(match[2])>=1&&Number(match[2])<=12?
   monthsES[Number(match[2])-1]+' '+match[1]:(value||'Sin período');
 }
 function closeHouseHistory(){
  tariffPanel.hidden=true;
  projectNoAplicaStatus.hidden=true;
  currentHistoryHouseId=null;
  historyMovements=[];
  ++historySequence;
  historyModal.hidden=true;
  historyReturnFocus?.focus();
  historyReturnFocus=null;
 }
 async function openHouseHistory(casaId,trigger){
  const house=data?.viviendas?.find(h=>Number(h.casaId)===Number(casaId));
  if(!house)return;
  const seq=++historySequence;
  historyReturnFocus=trigger||null;
  currentHistoryHouseId=Number(casaId);
  tariffPanel.hidden=true;
  $('houseTariffOpen').hidden=activeConcept==='CASA_CLUB'||(activeConcept==='EXTRAORDINARIO'&&!activeProyectoId);
  $('houseTariffOpen').textContent=activeConcept==='EXTRAORDINARIO'?'Modificar cuota del proyecto':'Modificar cuotas';
  syncProjectNoAplica(house);
  historyModal.hidden=false;
  $('houseHistoryTitle').textContent='Historial de '+conceptTitle(activeConcept).toLowerCase();
  $('houseHistoryAddress').textContent=house.calle+' '+house.numero+' · '+(house.nombre||'Sin residente');
  $('houseHistorySummary').textContent='Consultando pagos y saldos confirmados…';
  $('houseHistoryTimeline').innerHTML='';
  $('houseHistoryDebts').innerHTML='';
  $('houseHistoryDeleteStatus').textContent='';
  $('houseHistoryClose').focus();
  try{
   const {data:detail}=await request('/pagos-vivienda/'+Number(casaId)+'/historial?concepto='+activeConcept+
    (activeConcept==='EXTRAORDINARIO'&&activeProyectoId?'&proyectoId='+Number(activeProyectoId):''));
   if(seq!==historySequence||historyModal.hidden)return;
   const movements=detail.movimientos||[],debts=detail.deudas||[];
   historyMovements=movements;
   const total=movements.reduce((n,p)=>n+Number(p.monto||0),0);
   $('houseHistorySummary').innerHTML='<div class="history-stat"><small>Último pago registrado</small><strong>'+esc(fmt(movements[0]?.monto||0))+'</strong></div>'+
    '<div class="history-stat"><small>Total en movimientos</small><strong>'+esc(fmt(total))+'</strong></div>'+
    '<div class="history-stat debt"><small>Saldo pendiente actual</small><strong>'+esc(fmt(detail.saldoPendiente))+'</strong></div>'+ '<div class="history-stat credit"><small>Saldo a favor</small><strong>'+esc(fmt(detail.saldoFavor||0))+'</strong></div>';
   $('houseHistoryTimeline').innerHTML=movements.length?movements.map((p,index)=>{
    const months=(p.periodos||[]).map(x=>x.mes+' '+x.anio);
    return '<article class="history-event"><div class="history-dot" aria-hidden="true"></div><div class="history-event-card">'+
      '<div class="history-event-top"><strong>'+esc(fmt(p.monto))+'</strong><time>'+esc(displayDate(p.fecha))+'</time></div>'+
      '<p class="history-concept">'+esc(p.fuente==='ABONO_CON_ADEUDO'?'Abono con adeudo · Mantenimiento':conceptTitle(activeConcept))+(p.pagoAnual?' · Pago anual '+(p.periodos?.at(-1)?.anio||''):'')+(p.meses?' · '+p.meses+' '+(p.meses===1?'mes cubierto':'meses cubiertos'):'')+'</p>'+
      (months.length?'<div class="history-months">'+months.map(name=>'<span>'+esc(name)+'</span>').join('')+'</div>':'')+
      (Number(p.recargo)>0?'<p class="history-penalty">Incluye '+esc(fmt(p.recargo))+' de recargo por pago tardío.</p>':'')+
      '<div class="history-event-footer"><small>'+esc(p.formaPago||'Pago registrado')+(p.referencia?' · Ref. '+esc(p.referencia):'')+'</small>'+
      (['MANTENIMIENTO','EXTRAORDINARIO'].includes(activeConcept)?'<button type="button" class="history-receipt-button" data-history-receipt="'+index+'"'+(p.referencia?'':' disabled title="No hay referencia verificable para este movimiento"')+' aria-label="Generar recibo del pago de '+esc(fmt(p.monto))+' del '+esc(displayDate(p.fecha))+'">Generar recibo</button>':'')+
      (activeConcept==='MANTENIMIENTO'?'<button type="button" class="history-delete-button" data-history-delete="'+index+'" aria-label="Borrar pago de '+esc(fmt(p.monto))+' del '+esc(displayDate(p.fecha))+'" title="Verificar y anular este movimiento de mantenimiento">Borrar</button>':'')+
       (activeConcept==='EXTRAORDINARIO'?'<button type="button" class="history-delete-button" data-extra-history-delete="'+index+'"'+
        (!['APORTACION','MANUAL'].includes(p.origenTipo)||!Number.isSafeInteger(Number(p.movimientoId))?
         ' disabled title="Comprobante bancario o movimiento sin identificador: requiere conciliación."':
         ' title="Anular con auditoría solo esta aportación del proyecto"')+
        ' aria-label="Borrar aportación de '+esc(fmt(p.monto))+' del '+esc(displayDate(p.fecha))+'">Borrar</button>':'')+'</div></div></article>';
   }).join(''):'<div class="history-empty">Esta vivienda todavía no tiene pagos confirmados de este concepto.</div>';
   $('houseHistoryDebts').innerHTML='<h3>Deudas pendientes ('+debts.length+')</h3>'+
    (debts.length?'<div class="history-debt-list">'+debts.map(d=>'<div class="history-debt"><div><strong>'+esc(d.concepto||conceptTitle(activeConcept))+'</strong><small>'+esc(debtPeriod(d.periodo))+(d.estado==='EN_REVISION'?' · Comprobante en revisión':'')+'</small></div><div><b>'+esc(fmt(d.monto))+'</b>'+
      (Number(d.recargo)>0?'<small>Incluye '+esc(fmt(d.recargo))+' de recargo por atraso</small>':'')+'</div></div>').join('')+'</div>':'<p class="history-paid-up">Sin deudas pendientes actualmente.</p>');
  }catch(error){
   if(seq===historySequence)$('houseHistorySummary').textContent='No fue posible consultar el historial: '+error.message;
  }
 }
 $('houseHistoryClose').addEventListener('click',closeHouseHistory);
 // Exención del proyecto: reutiliza el PATCH auditado de cuota individual.
 // El backend no permite exentar si existen aportaciones o comprobantes en revisión.
 projectNoAplicaButton.addEventListener('click',async()=>{
  const id=Number(currentHistoryHouseId),pid=Number(activeProyectoId);
  if(projectNoAplicaSaving||historyModal.hidden||activeConcept!=='EXTRAORDINARIO'||
     !Number.isSafeInteger(id)||id<1||!Number.isSafeInteger(pid)||pid<1)return;
  if(!tariffPanel.hidden){
   projectNoAplicaStatus.hidden=false;
   projectNoAplicaStatus.textContent='Cierra la edición de cuota antes de seleccionar No aplica.';
   return;
  }
  const house=data?.viviendas?.find(h=>Number(h.casaId)===id);
  if(!house||isProjectNoAplica(house)||Number(house.montoPagado||0)>0)return;
  const project=(data?.proyectosExtraordinarios||[]).find(x=>Number(x.id)===pid);
  if(!project)return;
  const question='¿Marcar '+house.calle+' '+house.numero+' como «No aplica» en «'+project.nombre+'»?\n\n'+
   'Su cuota extraordinaria quedará en $0, no tendrá saldo pendiente y no aparecerá como pagada.'+
   '\nLos pagos previos o en revisión impiden esta acción.'+
   '\nNo se modifican mantenimiento, TAGs ni otros proyectos.'+
   '\n\nPodrás asignarle una cuota nuevamente desde «Modificar cuota del proyecto».';
  if(!window.confirm(question))return;
  projectNoAplicaSaving=true;
  projectNoAplicaButton.disabled=true;
  projectNoAplicaStatus.hidden=false;
  projectNoAplicaStatus.textContent='Guardando la exención del proyecto…';
  let saved=false;
  try{
   await request('/proyectos-extraordinarios/'+pid+'/viviendas/'+id,{monto:0},'PATCH');
   saved=true;
   const refreshed=await load();
   if(!refreshed){
    projectNoAplicaStatus.textContent='La exención se guardó, pero no pudo verificarse al recargar. Actualiza la página antes de volver a intentar.';
    notice(projectNoAplicaStatus.textContent,'success');
    return;
   }
   if(historyModal.hidden||currentHistoryHouseId!==id||activeConcept!=='EXTRAORDINARIO'||
      Number(activeProyectoId)!==pid){
    notice('Se guardó No aplica para '+house.calle+' '+house.numero+'.','success');return;
   }
   const current=data?.viviendas?.find(h=>Number(h.casaId)===id);
   if(!isProjectNoAplica(current)){
    projectNoAplicaStatus.textContent='La API guardó el cambio pero no confirmó el estado No aplica. Vuelve a consultar el proyecto.';
    return;
   }
   const focus=historyReturnFocus;
   await openHouseHistory(id,focus);
   if(!historyModal.hidden&&currentHistoryHouseId===id){
    projectNoAplicaStatus.hidden=false;
    projectNoAplicaStatus.textContent='No aplica guardado. Cuota $0; sin cobro ni deuda de este proyecto.';
   }
   notice('La vivienda '+house.calle+' '+house.numero+' quedó como No aplica para este proyecto.','success');
  }catch(error){
   projectNoAplicaStatus.hidden=false;
   projectNoAplicaStatus.textContent='No se pudo marcar No aplica: '+error.message;
   notice(error.message);
  }finally{
   projectNoAplicaSaving=false;
   if(saved)projectNoAplicaButton.disabled=true;
   else if(currentHistoryHouseId===id&&activeConcept==='EXTRAORDINARIO'&&Number(activeProyectoId)===pid){
    const current=data?.viviendas?.find(h=>Number(h.casaId)===id);
    projectNoAplicaButton.disabled=!current||isProjectNoAplica(current)||Number(current.montoPagado||0)>0;
   }
  }
 });
 $('houseTariffOpen').addEventListener('click',()=>{
  if(!currentHistoryHouseId||!['MANTENIMIENTO','EXTRAORDINARIO'].includes(activeConcept))return;
  const h=data?.viviendas?.find(x=>Number(x.casaId)===currentHistoryHouseId);
  if(!h)return;
  showSavedTariff(h);
  $('houseTariffStatus').textContent='';
  tariffPanel.hidden=false;
  $('houseTariffInput').focus();
 });
 $('houseTariffClose').addEventListener('click',()=>{
  tariffPanel.hidden=true;
  $('houseTariffOpen').focus();
 });
 $('houseTariffInput').addEventListener('input',syncTariffIndicator);
 $('houseTariffNoFee').addEventListener('change',syncTariffIndicator);
 $('houseTariffForm').addEventListener('submit',async event=>{
  event.preventDefault();
  const casaId=currentHistoryHouseId;
  const cuota=Number($('houseTariffInput').value);
  if(activeConcept==='EXTRAORDINARIO'){
   if(!casaId||!activeProyectoId||$('houseTariffInput').value.trim()===''||!Number.isFinite(cuota)||cuota<0||cuota>10000000||
      Math.abs(cuota*100-Math.round(cuota*100))>0.001){
    $('houseTariffStatus').textContent='Ingresa un importe válido con máximo dos decimales.';
    return;
   }
   const house=data?.viviendas?.find(h=>Number(h.casaId)===casaId);
   if(!house)return;
   if(Math.round(cuota*100)<Math.round(Number(house.montoPagado||0)*100)){
    $('houseTariffStatus').textContent='El importe no puede ser menor a '+fmt(house.montoPagado)+' ya aportados.';
    return;
   }
   if(!confirm('¿Actualizar la cuota extraordinaria de '+house.calle+' '+house.numero+' a '+fmt(cuota)+'? No se alterarán ni los pagos, ni el mantenimiento, ni los TAGs.'))return;
   const button=$('houseTariffSave');button.disabled=true;
   $('houseTariffStatus').textContent='Guardando cuota del proyecto…';
   const pid=Number(activeProyectoId);
   try{
    await request('/proyectos-extraordinarios/'+pid+'/viviendas/'+casaId,{monto:cuota},'PATCH');
    const updated=await load();
    if(historyModal.hidden||currentHistoryHouseId!==casaId)return;
    if(!updated){
     paintTariffSavedIndicator('unknown');
     $('houseTariffStatus').textContent='Se guardó el cambio, pero no se pudo comprobar al recargar. Verifica antes de repetirlo.';
     return;
    }
    const focus=historyReturnFocus;
    await openHouseHistory(casaId,focus);
    if(historyModal.hidden||currentHistoryHouseId!==casaId)return;
    tariffPanel.hidden=false;
    const actual=data?.viviendas?.find(h=>Number(h.casaId)===casaId);
    if(actual)showSavedTariff(actual);
    const ok=Number(activeProyectoId)===pid&&Math.round(Number(actual?.montoCuota||0)*100)===Math.round(cuota*100);
    $('houseTariffStatus').textContent=ok
     ?'Cuota extraordinaria de '+fmt(cuota)+' guardada. Se recalcularon los saldos y metas.'
     :'No se pudo confirmar el importe en la lectura nueva. Revisa el proyecto.';
    if(!ok)paintTariffSavedIndicator('unknown');
   }catch(error){$('houseTariffStatus').textContent=error.message;}
   finally{button.disabled=false;}
   return;
  }
  if(!casaId||!Number.isInteger(cuota)||cuota<1||cuota>10000){
   $('houseTariffStatus').textContent='Ingresa una cuota mensual entera de $1 a $10,000.';
   return;
  }
  const boton=$('houseTariffSave');
  boton.disabled=true;
  $('houseTariffStatus').textContent='Guardando cuota de la vivienda…';
  try{
   const sinRecargo=$('houseTariffNoFee').checked;
   await request('/viviendas/'+casaId+'/cuota-por-cobrar',{cuotaPorCobrar:cuota,sinRecargo},'PATCH');
   // Solo mostrar «guardado» cuando la nueva lectura de la API coincida con lo enviado.
   const actualizado=await load();
   if(historyModal.hidden||currentHistoryHouseId!==casaId)return;
   if(!actualizado){
    paintTariffSavedIndicator('unknown');
    $('houseTariffStatus').textContent='Se envió el cambio, pero no se pudo comprobar al recargar. Vuelve a abrir para verificar.';
    return;
   }
   const foco=historyReturnFocus;
   await openHouseHistory(casaId,foco);
   if(historyModal.hidden||currentHistoryHouseId!==casaId)return;
   tariffPanel.hidden=false;
   const casaActual=data?.viviendas?.find(h=>Number(h.casaId)===casaId);
   const confirmado=Boolean(casaActual)&&Number(casaActual.tarifaMensual)===cuota&&houseHasNoFee(casaActual)===sinRecargo;
   if(casaActual)showSavedTariff(casaActual);
   if(confirmado){
    const mensajeRecargo=sinRecargo
     ? 'Se exentó el recargo de $50 por mora.'
     : 'Se habilitó el recargo de $50 por mora.';
    $('houseTariffStatus').textContent='Tarifa de '+fmt(cuota)+' guardada. '+mensajeRecargo+' Se actualizó el adeudo sin borrar pagos.';
   }else{
    paintTariffSavedIndicator('unknown');
    $('houseTariffStatus').textContent='No se pudo confirmar la configuración guardada. Vuelve a consultar esta vivienda.';
   }
   $('houseTariffInput').focus();
  }catch(error){$('houseTariffStatus').textContent=error.message;}
  finally{boton.disabled=false;}
 });
 historyModal.addEventListener('click',e=>{if(e.target===historyModal)closeHouseHistory();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!historyModal.hidden&&receiptModal.hidden){if(!tariffPanel.hidden){tariffPanel.hidden=true;$('houseTariffOpen').focus();}else closeHouseHistory();}});
 const receiptModal=$('houseReceiptModal');
 let receiptObjectUrl=null;
 let receiptBlob=null;
 let receiptDetails=null;
 let receiptSequence=0;
 let receiptReturnFocus=null;
 let receiptCurrentHouseId=null;
 let receiptEmailSending=false;
 let receiptPhoneSaving=false,receiptEmailSavingContact=false;
 let receiptSavedPhone='',receiptSavedEmail='';
 let receiptPhoneSavedHere=false,receiptEmailSavedHere=false;
 let receiptEmailToastTimeout=null;
 function showReceiptEmailCenterSuccess(destino){
  const toast=$('financeReceiptEmailSuccess');
  $('financeReceiptEmailSuccessDestination').textContent='Enviado a '+String(destino||'');
  toast.hidden=false;
  if(receiptEmailToastTimeout)clearTimeout(receiptEmailToastTimeout);
  receiptEmailToastTimeout=setTimeout(()=>{toast.hidden=true;receiptEmailToastTimeout=null;},4200);
 }
 const validReceiptEmail=value=>{
  const text=String(value||'').trim();
  return text.length<=150&&text.length>=3&&/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(text);
 };
 function updateReceiptEmail(){
  const input=$('houseReceiptEmailInput');
  const valid=validReceiptEmail(input.value);
  input.setAttribute('aria-invalid',String(Boolean(input.value.trim())&&!valid));
  const dirty=valid&&input.value.trim()!==receiptSavedEmail;
  $('houseReceiptEmailHint').dataset.saved=String(receiptEmailSavedHere&&!dirty);
  $('houseReceiptEmailHint').textContent=input.value.trim()&&!valid
   ?'Escribe un solo correo electrónico válido de máximo 150 caracteres.'
   :dirty?'Correo listo. Pulsa Guardar correo para conservarlo o envía solo este recibo.'
   :receiptEmailSavedHere?'Correo guardado en la vivienda para los próximos recibos.'
   :'Puedes editar el correo para este envío o pulsar Guardar correo para conservarlo.';
  $('houseReceiptEmailSave').disabled=!receiptBlob||!receiptCurrentHouseId||
   receiptEmailSavingContact||!dirty;
  $('houseReceiptEmailSend').disabled=receiptEmailSending||!receiptBlob||!valid;
 }
 $('houseReceiptEmailInput').addEventListener('input',updateReceiptEmail);
 const receiptIsMobile=()=>Boolean(navigator.userAgentData?.mobile)||/Android.+Mobile|iPhone|iPod/i.test(navigator.userAgent||'');
 const receiptWhatsAppLabel=receiptIsMobile()?'Enviar recibo por WhatsApp':'Enviar recibo por WhatsApp Web';
 $('houseReceiptWhatsApp').textContent=receiptWhatsAppLabel;
 function normalizeReceiptPhone(value){
  const digits=String(value||'').replace(/\D/g,'');
  if(/^\d{10}$/.test(digits))return '52'+digits;
  if(/^52\d{10}$/.test(digits))return digits;
  if(/^521\d{10}$/.test(digits))return '52'+digits.slice(3);
  return null;
 }
 function updateReceiptPhone(){
  const input=$('houseReceiptPhoneInput');
  const valid=Boolean(normalizeReceiptPhone(input.value));
  input.setAttribute('aria-invalid',String(input.value.length>0&&!valid));
  const dirty=valid&&normalizeReceiptPhone(input.value)!==receiptSavedPhone;
  $('houseReceiptPhoneHint').dataset.saved=String(receiptPhoneSavedHere&&!dirty);
  $('houseReceiptPhoneHint').textContent=input.value&&!valid
   ?'Escribe 10 dígitos de México, o 52 seguido de los 10 dígitos.'
   :dirty?'Número listo. Pulsa Guardar teléfono para conservarlo en la vivienda.'
   :receiptPhoneSavedHere?'Teléfono guardado en la vivienda para los próximos recibos.'
   :'Puedes usarlo una vez o pulsar Guardar teléfono para conservarlo.';
  $('houseReceiptPhoneSave').disabled=!receiptBlob||!receiptCurrentHouseId||
   receiptPhoneSaving||!dirty;
  $('houseReceiptWhatsApp').disabled=!receiptBlob||!valid;
 }
 async function guardarContactoDelRecibo(campo){
  const isPhone=campo==='telefono';
  const input=$(isPhone?'houseReceiptPhoneInput':'houseReceiptEmailInput');
  const button=$(isPhone?'houseReceiptPhoneSave':'houseReceiptEmailSave');
  const valor=input.value.trim(),houseId=Number(receiptCurrentHouseId),seq=receiptSequence;
  const valido=isPhone?Boolean(normalizeReceiptPhone(valor)):validReceiptEmail(valor);
  if(!receiptBlob||!Number.isSafeInteger(houseId)||houseId<1||!valido||
    receiptPhoneSaving||receiptEmailSavingContact)return;
  const label=button.textContent;
  if(isPhone)receiptPhoneSaving=true;else receiptEmailSavingContact=true;
  input.disabled=true;button.disabled=true;button.textContent='Guardando…';
  try{
   const response=await request('/viviendas/'+houseId+'/contacto-recibo/'+campo,
    {valor},'PATCH');
   if(response.data?.guardado!==true)throw Error('El servidor no confirmó el guardado.');
   if(seq!==receiptSequence||receiptModal.hidden||receiptCurrentHouseId!==houseId)return;
   input.value=response.data.valor;
   if(isPhone){
    receiptSavedPhone=response.data.valor;
    receiptPhoneSavedHere=true;
   }else{
    receiptSavedEmail=response.data.valor;
    receiptEmailSavedHere=true;
    if(receiptDetails)receiptDetails.correo=response.data.valor;
   }
   receiptStatus((isPhone?'Teléfono':'Correo')+' guardado correctamente en esta vivienda.','success');
  }catch(error){
   if(seq===receiptSequence&&!receiptModal.hidden&&receiptCurrentHouseId===houseId)
    receiptStatus('No se pudo guardar '+(isPhone?'el teléfono':'el correo')+': '+error.message,'error');
  }finally{
   if(isPhone)receiptPhoneSaving=false;else receiptEmailSavingContact=false;
   input.disabled=false;button.textContent=label;
   if(!receiptModal.hidden){updateReceiptPhone();updateReceiptEmail();}
  }
 }
 $('houseReceiptPhoneSave').addEventListener('click',()=>void guardarContactoDelRecibo('telefono'));
 $('houseReceiptEmailSave').addEventListener('click',()=>void guardarContactoDelRecibo('correo'));
 function receiptStatus(message,kind='info'){
  const el=$('houseReceiptStatus');el.textContent=message;el.dataset.kind=kind;
 }
 function closeHouseReceipt(){
  ++receiptSequence;
  receiptModal.hidden=true;
  $('houseReceiptPreview').src='about:blank';
  $('houseReceiptPreview').hidden=true;
  if(receiptObjectUrl)URL.revokeObjectURL(receiptObjectUrl);
  receiptObjectUrl=null;receiptBlob=null;receiptDetails=null;
  $('houseReceiptEmailSend').disabled=true;
  $('houseReceiptEmailInput').value='';
  receiptSavedPhone='';receiptSavedEmail='';
  receiptPhoneSavedHere=false;receiptEmailSavedHere=false;
  $('houseReceiptPhoneSave').disabled=true;
  $('houseReceiptEmailSave').disabled=true;
  receiptCurrentHouseId=null;
  receiptReturnFocus?.focus();receiptReturnFocus=null;
 }
 function guardarRecibo(){
  if(!receiptBlob||!receiptObjectUrl||!receiptDetails)return;
  const link=document.createElement('a');
  link.href=receiptObjectUrl;
  link.download=String(receiptDetails.folio||'Mantenimiento').replace(/[^a-zA-Z0-9._-]/g,'_')+'.pdf';
  document.body.appendChild(link);link.click();link.remove();
 }
 async function cargarPdfDelPeriodo(casaId,periodo,referencia=null){
  const seq=++receiptSequence;
  if(receiptObjectUrl)URL.revokeObjectURL(receiptObjectUrl);
  receiptObjectUrl=null;receiptBlob=null;receiptDetails=null;
  $('houseReceiptPreview').src='about:blank';
  $('houseReceiptPreview').hidden=true;
  $('houseReceiptDownload').disabled=true;
  $('houseReceiptWhatsApp').disabled=true;
  $('houseReceiptEmailSend').disabled=true;
  $('houseReceiptPhoneSave').disabled=true;
  $('houseReceiptEmailSave').disabled=true;
  receiptStatus('Generando el recibo del mes seleccionado…');
  const qs=new URLSearchParams();if(activeConcept==='EXTRAORDINARIO'){qs.set('concepto','EXTRAORDINARIO');qs.set('proyectoId',activeProyectoId);}if(referencia)qs.set('referencia',referencia);else if(periodo&&activeConcept==='MANTENIMIENTO')qs.set('periodo',periodo);const query=qs.toString()?'?'+qs:'';
  try{
   const {data:detail}=await request('/pagos-vivienda/'+casaId+'/recibo/datos'+query);
   if(seq!==receiptSequence||receiptModal.hidden)return;
   const response=await fetch(API+'/finanzas/pagos-vivienda/'+casaId+'/recibo'+query,{
    headers:{Authorization:'Bearer '+token},cache:'no-store'
   });
   if(response.status===401){location.replace('login.html');throw Error('Sesión expirada');}
   if(!response.ok){const error=await response.json().catch(()=>({}));throw Error(error.message||'No se pudo generar el PDF');}
   const pdf=await response.blob();
   if(seq!==receiptSequence||receiptModal.hidden)return;
   if(pdf.type!=='application/pdf'&&!pdf.type.includes('pdf'))throw Error('El servidor no devolvió un archivo PDF');
   receiptBlob=pdf;
   receiptDetails=detail;
   receiptSavedEmail=String(detail.correo||'').trim();
   $('houseReceiptEmailInput').value=receiptSavedEmail;
   updateReceiptEmail();
   receiptObjectUrl=URL.createObjectURL(pdf);
   // Chrome descarga con UUID cuando el iframe recibe blob:. Esta URL
   // temporal devuelve Content-Disposition con el folio del recibo.
   const {data:vista}=await request('/pagos-vivienda/'+casaId+'/recibo/vista'+query);
   if(seq!==receiptSequence||receiptModal.hidden)return;
   if(!vista?.url||!vista.url.startsWith('/api/recibo-vista/'))throw Error('No fue posible abrir la vista protegida del PDF');
   $('houseReceiptPreview').referrerPolicy='no-referrer';
   $('houseReceiptPreview').src=new URL(vista.url,new URL(API).origin).href;
   $('houseReceiptPreview').hidden=false;
   $('houseReceiptAddress').textContent=detail.calle+' '+detail.numero+' · '+(detail.nombre||'Sin residente');
   $('houseReceiptTitle').textContent='Recibo '+detail.folio;
   receiptStatus((detail.pagoAnual?'Pago ANUAL registrado: ':'Pago registrado: ')+fmt(detail.monto)+' · '+(detail.periodo||'')+' · '+(detail.sello||'PAGADO'));
   $('houseReceiptDownload').disabled=false;
   updateReceiptPhone();
   updateReceiptEmail();
   if(!$('houseReceiptPhoneInput').value){
    receiptStatus('Recibo listo para guardar. Ingresa un número celular para enviarlo por WhatsApp.');
   }
  }catch(error){
   if(seq===receiptSequence)receiptStatus(error.message,'error');
  }
 }
 async function openHouseReceipt(casaId=selectedReceiptHouseId,referencia=null,trigger=document.activeElement){
  if(!['MANTENIMIENTO','EXTRAORDINARIO'].includes(activeConcept)||!Number.isSafeInteger(Number(casaId))||Number(casaId)<1||(activeConcept==='EXTRAORDINARIO'&&!activeProyectoId))return;
  casaId=Number(casaId);
  const seq=++receiptSequence;
  receiptCurrentHouseId=casaId;
  receiptReturnFocus=trigger;
  receiptModal.hidden=false;
  $('houseReceiptTitle').textContent=activeConcept==='EXTRAORDINARIO'?'Generar recibo del proyecto':'Generar recibo de mantenimiento';
  $('houseReceiptAddress').textContent='Consultando vivienda…';
  receiptStatus(referencia?'Consultando el pago del historial seleccionado…':'Buscando los meses pagados y los teléfonos registrados…');
  $('houseReceiptPeriod').hidden=true;
  $('houseReceiptMonth').innerHTML='';
  $('houseReceiptSendSection').hidden=true;
  receiptSavedPhone='';receiptSavedEmail='';
  receiptPhoneSavedHere=false;receiptEmailSavedHere=false;
  $('houseReceiptPhoneInput').value='';
  $('houseReceiptEmailInput').value='';
  $('houseReceiptPhoneSave').disabled=true;
  $('houseReceiptEmailSave').disabled=true;
  $('houseReceiptEmailSend').disabled=true;
  updateReceiptPhone();
  $('houseReceiptDownload').disabled=true;
  $('houseReceiptWhatsApp').disabled=true;
  $('houseReceiptPreview').hidden=true;
  $('houseReceiptClose').focus();
  try{
   const qs=new URLSearchParams();if(referencia)qs.set('referencia',referencia);if(activeConcept==='EXTRAORDINARIO'){qs.set('concepto','EXTRAORDINARIO');qs.set('proyectoId',activeProyectoId);}const {data:detail}=await request('/pagos-vivienda/'+casaId+'/recibo/datos'+(qs.toString()?'?'+qs:''));
   if(seq!==receiptSequence||receiptModal.hidden)return;
   const periodos=detail.periodosDisponibles||[];
   if(!referencia&&periodos.length){
    $('houseReceiptMonth').innerHTML=periodos.map(p=>'<option value="'+esc(p.valor)+'">'+esc(p.etiqueta)+'</option>').join('');
    $('houseReceiptMonth').value=detail.periodoSeleccionado||periodos[0].valor;
    $('houseReceiptPeriod').hidden=false;
   }
   const phones=(detail.telefonos||[]).filter(p=>/^52\d{10}$/.test(String(p.numero)));
   receiptSavedPhone=phones[0]?.numero||'';
   $('houseReceiptPhoneInput').value=receiptSavedPhone;
   $('houseReceiptSendSection').hidden=false;
   updateReceiptPhone();
   await cargarPdfDelPeriodo(casaId,referencia?null:($('houseReceiptMonth').value||null),referencia);
  }catch(error){if(seq===receiptSequence)receiptStatus(error.message,'error');}
 }
 $('financeGenerateReceipt').addEventListener('click',()=>void openHouseReceipt());
 // Reutilizar el visor PDF existente para la referencia exacta del movimiento.
 historyModal.addEventListener('click',event=>{
  const button=event.target.closest('button[data-history-receipt]');
  if(!button||!historyModal.contains(button)||historyModal.hidden||!['MANTENIMIENTO','EXTRAORDINARIO'].includes(activeConcept))return;
  const index=Number(button.dataset.historyReceipt);
  if(!Number.isSafeInteger(index)||index<0||!currentHistoryHouseId)return;
  const movement=historyMovements[index];
  if(!movement?.referencia)return;
  void openHouseReceipt(currentHistoryHouseId,movement.referencia,button);
 });
 $('houseReceiptMonth').addEventListener('change',()=>{
  if(!receiptModal.hidden&&receiptCurrentHouseId)void cargarPdfDelPeriodo(receiptCurrentHouseId,$('houseReceiptMonth').value);
 });
 $('houseReceiptClose').addEventListener('click',closeHouseReceipt);
 receiptModal.addEventListener('click',e=>{if(e.target===receiptModal)closeHouseReceipt();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!receiptModal.hidden)closeHouseReceipt();});
 $('houseReceiptDownload').addEventListener('click',guardarRecibo);
 $('houseReceiptPhoneInput').addEventListener('input',()=>{
  const input=$('houseReceiptPhoneInput');
  input.value=input.value.replace(/\D/g,'').slice(0,13);
  updateReceiptPhone();
 });
 $('houseReceiptWhatsApp').addEventListener('click',()=>{
  const phone=normalizeReceiptPhone($('houseReceiptPhoneInput').value);
  if(!receiptBlob||!receiptDetails||!phone)return;
  const message='Hola, te compartimos tu recibo de '+(activeConcept==='EXTRAORDINARIO'?'proyecto extraordinario':'mantenimiento')+' de Misión Jardines, folio '+receiptDetails.folio+'. Adjunto el documento PDF.';
  const link=receiptIsMobile()
   ? 'https://wa.me/'+encodeURIComponent(phone)+'?text='+encodeURIComponent(message)
   : 'https://web.whatsapp.com/send?phone='+encodeURIComponent(phone)+'&text='+encodeURIComponent(message);
  guardarRecibo();
  const chat=window.open(link,'_blank');
  if(chat)chat.opener=null;
  const destino=receiptIsMobile()?'WhatsApp':'WhatsApp Web';
  receiptStatus(!chat?'El PDF se descargó. Permite abrir '+destino+' y adjuntar el recibo.':'PDF descargado y chat abierto en '+destino+'. Adjunta el archivo y confirma el envío.');
 });
 $('houseReceiptEmailSend').addEventListener('click',async()=>{
  if(receiptEmailSending||!receiptBlob||!receiptDetails||!receiptCurrentHouseId)return;
  const emailField=$('houseReceiptEmailInput');
  const correoDestino=emailField.value.trim();
  if(!validReceiptEmail(correoDestino)){
   emailField.focus();
   updateReceiptEmail();
   receiptStatus('Escribe un correo de destino válido antes de enviar.','error');
   return;
  }
  const houseId=Number(receiptCurrentHouseId),folio=receiptDetails.folio;
  const concept=activeConcept,projectId=concept==='EXTRAORDINARIO'?Number(activeProyectoId):null;
  const referencia=String(receiptDetails.referencia||'').trim();
  if(!referencia){receiptStatus('No se identificó la referencia del recibo. Reabre el historial.','error');return;}
  if(!window.confirm('¿Enviar el recibo '+folio+' a '+correoDestino+
   '?\n\nConfirma que esta dirección pertenece al destinatario correcto. El correo guardado de la vivienda no se modificará.'))return;
  receiptEmailSending=true;
  const button=$('houseReceiptEmailSend');button.disabled=true;
  receiptStatus('Enviando recibo oficial por correo…');
  try{
   const response=await request('/pagos-vivienda/'+houseId+'/recibo/enviar-correo',{
    concepto:concept,proyectoId:projectId,referencia,correoDestino
   });
   if(response.data?.enviado!==true)throw Error('El servidor no confirmó la entrega a SMTP.');
   if(!receiptModal.hidden&&receiptCurrentHouseId===houseId&&receiptDetails?.folio===folio){
    receiptStatus('Recibo enviado correctamente a '+response.data.correo+'.','success');
   }
   showReceiptEmailCenterSuccess(response.data.correo);
  }catch(err){
   if(!receiptModal.hidden&&receiptCurrentHouseId===houseId)
    receiptStatus('No se envió el recibo: '+err.message,'error');
   notice('Error enviando recibo: '+err.message);
  }finally{
   receiptEmailSending=false;
   updateReceiptEmail();
  }
 });

 $('financialSummary').addEventListener('click',async event=>{
  const card=event.target.closest('[data-finance-export]');
  if(!card||!data)return;
  card.disabled=true;
  try{
   if(activeConcept==='EXTRAORDINARIO'){
    const pid=Number(activeProyectoId),snapshot=data;
    const project=snapshot.proyectosExtraordinarios?.find(x=>Number(x.id)===pid);
    if(!project||!window.MJFinanceExcelProyectos?.prepararReporteProyecto)
     throw Error('Selecciona un proyecto o vuelve a cargar el generador del Excel.');
    const result=(await request('/proyectos-extraordinarios/'+pid+'/movimientos-exportacion')).data;
    if(Number(result.proyectoId)!==pid)throw Error('El servidor devolvió otro proyecto.');
    const report=window.MJFinanceExcelProyectos.prepararReporteProyecto(
     snapshot,card.dataset.financeExport,pid,result.movimientos);
    await window.MJFinanceExport.descargarReporte(snapshot,card.dataset.financeExport,window.ExcelJS,{report});
    notice('Excel de «'+project.nombre+'» generado con todas sus viviendas, aportaciones y gráficas.','success');
   }else{
    await window.MJFinanceExport.descargarReporte(data,card.dataset.financeExport,window.ExcelJS);
    notice('Excel completo generado para el período '+data.periodo+'.','success');
   }
  }catch(error){notice('No se pudo descargar el Excel: '+error.message);}
  finally{card.disabled=false;}
 });

 // Acciones financieras: un botón no es funcional si no tiene un listener registrado.
 const backupModal=$('financeBackupModal');
 const backupPeriod=$('financeBackupPeriod');
 const backupStatus=$('financeBackupStatus');
 const backupConfirm=$('financeBackupConfirm');
 const backupAllMonths=$('financeBackupAllMonths');
 const backupPeriodHint=$('financeBackupPeriodsNote');
 let backupAction=null;
 let backupBusy=false;
 let backupAvailablePeriods=[];
 let drivePickerLoading=null;
 let drivePickerActive=false;
 const backupMonths=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
 const backupSelectedPeriod=()=>String($('financeYear').value)+'-'+String($('financeMonth').value).padStart(2,'0');
 const validBackupPeriod=value=>/^20\d{2}-(0[1-9]|1[0-2])$/.test(String(value||''));
 function setBackupStatus(message,kind='info'){
  backupStatus.textContent=message;
  backupStatus.dataset.kind=kind;
 }
 function setBackupBusy(value){
  backupBusy=value;
  backupConfirm.disabled=value || (backupAction!=='connect'&&!backupPeriod.value);
  $('financeBackupClose').disabled=value;
  backupPeriod.disabled=value;
  backupAllMonths.disabled=value;
  $('financeDriveChooseFolder').disabled=value;
 }
 function setDrivePickerActive(active){
  drivePickerActive=Boolean(active);
  // Google Picker no expone un método público confiable para z-index.
  // Se oculta solo visualmente este overlay mientras se usa Google Picker.
  backupModal.classList.toggle('finance-picker-active',drivePickerActive);
  if(drivePickerActive)backupModal.setAttribute('aria-hidden','true');
  else backupModal.removeAttribute('aria-hidden');
 }
 function closeBackupModal(){
  if(backupBusy||drivePickerActive)return;
  backupModal.hidden=true;
  backupAction=null;
 }
 async function loadBackupPeriods(){
  const initial=backupSelectedPeriod();
  backupPeriod.innerHTML='<option value="">Consultando meses disponibles…</option>';
  backupPeriod.value='';
  setBackupBusy(true);
  try{
   const projectQuery=activeConcept==='EXTRAORDINARIO'&&activeProyectoId?'?proyectoId='+encodeURIComponent(activeProyectoId):'';
   const response=await request('/recibos-masivos/periodos'+projectQuery);
   if(backupModal.hidden||backupAction==='connect')return;
   const periods=(response.data?.periodos||[]).filter(validBackupPeriod).sort().reverse();
   backupAvailablePeriods=periods;
   backupPeriod.innerHTML=periods.map(p=>{
    const year=p.slice(0,4),month=Number(p.slice(5,7));
    return '<option value="'+p+'">'+backupMonths[month-1]+' '+year+'</option>';
   }).join('')||'<option value="">No hay mensualidades pagadas</option>';
   backupPeriod.value=periods.includes(initial)?initial:periods[0]||'';
   backupPeriodHint.textContent=periods.length
    ?'Hay '+periods.length+' meses con pagos registrados. Selecciona el mes del que necesitas los PDF.'
    :'Todavía no hay meses con pagos confirmados para descargar.';
   setBackupStatus(periods.length?'Selecciona el mes y pulsa continuar.':'No hay recibos disponibles.',periods.length?'info':'error');
  }catch(error){
   backupPeriod.innerHTML='<option value="">No se pudieron consultar meses</option>';
   backupPeriodHint.textContent='';
   setBackupStatus('No fue posible consultar los meses disponibles: '+error.message,'error');
  }finally{
   setBackupBusy(false);
  }
 }
 function openBackupModal(mode){
  backupAction=mode;
  backupModal.hidden=false;
  $('financeDriveFolderSection').hidden=mode!=='drive';
  if(mode==='drive')void refreshDriveFolder();
  backupAllMonths.checked=false;
  backupAllMonths.parentElement.hidden=mode!=='drive';
  backupPeriod.parentElement.hidden=mode==='connect';
  backupPeriodHint.hidden=mode==='connect';
  $('financeDriveConfig').hidden=mode!=='connect';
  $('financeBackupTitle').textContent=mode==='zip'?'Descargar todos los recibos':mode==='drive'?'Generar respaldo en Google Drive':'Conectar con Google Drive';
  $('financeBackupDescription').textContent=mode==='zip'
   ?'Elige el mes para descargar los PDF de '+(activeConcept==='EXTRAORDINARIO'?'aportaciones del proyecto':'mantenimiento')+'.'
   :mode==='drive'
    ?'Guarda PDF individuales en Drive, '+(activeConcept==='EXTRAORDINARIO'?'separados por proyecto y año.':'en la carpeta del año junto con el Excel del padrón.')
    :'Autoriza una cuenta Google. Las credenciales OAuth se configuran en Hostinger; no las escribas aquí.';
  backupConfirm.textContent=mode==='zip'?'Descargar ZIP':mode==='drive'?'Generar respaldo':'Autorizar con Google';
  backupPeriod.innerHTML='';
  backupPeriod.value='';
  backupPeriodHint.textContent='';
  setBackupStatus(mode==='connect'?'Se abrirá el consentimiento de Google.':'Cargando meses disponibles…');
  backupConfirm.disabled=mode!=='connect';
  if(mode!=='connect')void loadBackupPeriods();
  else backupConfirm.focus();
 }
 async function downloadZip(periodo){
  const extraQuery=activeConcept==='EXTRAORDINARIO'&&activeProyectoId?'&proyectoId='+encodeURIComponent(activeProyectoId):'';
  const response=await fetch(API+'/finanzas/recibos-masivos/zip?periodo='+encodeURIComponent(periodo)+extraQuery,{
   headers:{Authorization:'Bearer '+token,Accept:'application/zip'}
  });
  if(response.status===401){location.replace('login.html');throw Error('Sesión expirada');}
  if(!response.ok){
   const result=await response.json().catch(()=>({}));
   throw Error(result.message||'No se pudo generar el ZIP ('+response.status+').');
  }
  const blob=await response.blob();
  if(!blob.size)throw Error('El servidor devolvió un ZIP vacío');
  const total=Number(response.headers.get('X-Recibos-Count')||0);
  const link=document.createElement('a'),url=URL.createObjectURL(blob);
  link.href=url;
  link.download='MJ_'+(activeConcept==='EXTRAORDINARIO'?'Proyecto_':'Recibos_')+periodo+'.zip';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
  return total;
 }
 async function excelForDrive(periodo){
  if(!window.MJFinanceExport?.descargarReporte||!window.ExcelJS||!window.JSZip)
   throw Error('El módulo Excel aún no terminó de cargar. Recarga la página.');
  const [year,month]=periodo.split('-').map(Number);
  const periodoData=Number(data?.anio)===year&&Number(data?.mes)===month
   ?data:(await request('/analisis?anio='+year+'&mes='+month)).data;
  const array=await window.MJFinanceExport.descargarReporte(periodoData,'padron',window.ExcelJS,{returnBuffer:true});
  const bytes=new Uint8Array(array);
  let binary='';
  for(let offset=0;offset<bytes.length;offset+=8192)
   binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
  return btoa(binary);
 }

 function updateDriveFolderLink(url){
  const link=$('financeDriveFolderLink');
  if(typeof url==='string'&&/^https:\/\/drive\.google\.com\/drive\/folders\/[A-Za-z0-9_-]{12,150}$/.test(url)){
   link.href=url;link.hidden=false;
  }else{link.hidden=true;link.removeAttribute('href');}
 }
 async function refreshDriveFolder(){
  const el=$('financeDriveFolderStatus');
  el.textContent='Consultando cuenta y carpeta de Drive…';
  updateDriveFolderLink(null);
  try{
   const state=(await request('/drive/status')).data;
   if(backupAction!=='drive'||backupModal.hidden)return;
   el.textContent=!state.connected
    ?'Primero conecta tu cuenta Google con el botón Conectar con Google Drive.'
    :state.folderConfigured
     ?'Destino autorizado: Mision Jardines - Administración / 02_Recibos_PDF / 2026.'
     :'Cuenta conectada. Ahora selecciona la carpeta 02_Recibos_PDF de tu Drive para autorizarla.';
   updateDriveFolderLink(state.folderUrl);
  }catch(error){el.textContent='No se pudo consultar el destino: '+error.message;}
 }
 function ensureGooglePicker(){
  if(window.google?.picker?.PickerBuilder)return Promise.resolve();
  if(drivePickerLoading)return drivePickerLoading;
  drivePickerLoading=new Promise((resolve,reject)=>{
   const load=()=>{
    if(!window.gapi?.load){reject(Error('No se pudo cargar Google APIs'));return;}
    window.gapi.load('picker',{callback:resolve,onerror:()=>reject(Error('Google Picker no pudo iniciar'))});
   };
   if(window.gapi){load();return;}
   const script=document.createElement('script');
   script.src='https://apis.google.com/js/api.js';
   script.onload=load;
   script.onerror=()=>reject(Error('No se pudo descargar Google Picker'));
   document.head.appendChild(script);
  }).catch(e=>{drivePickerLoading=null;throw e;});
  return drivePickerLoading;
 }
 async function pickDriveFolder(){
  const button=$('financeDriveChooseFolder');
  if(backupBusy||button.disabled||drivePickerActive)return;
  button.disabled=true;
  $('financeDriveFolderStatus').textContent='Abriendo selector de carpetas de Google…';
  try{
   const {data:config}=await request('/drive/selector');
   if(!config?.accessToken||!config.apiKey||!config.appId)
    throw Error('Faltan los datos del selector Google Picker');
   await ensureGooglePicker();
   const pickerApi=window.google?.picker;
   if(!pickerApi?.PickerBuilder||!pickerApi?.DocsView)
    throw Error('No se cargó la biblioteca Google Picker');
   const folderView=new pickerApi.DocsView(pickerApi.ViewId.FOLDERS)
    .setIncludeFolders(true).setSelectFolderEnabled(true);
   const picker=new pickerApi.PickerBuilder()
    .addView(folderView)
    .setOAuthToken(config.accessToken)
    .setDeveloperKey(config.apiKey)
    .setAppId(config.appId)
    .setOrigin(window.location.origin)
    .setTitle('Elige Mision Jardines - Administración / 02_Recibos_PDF')
    .setCallback(async result=>{
     const action=result?.[pickerApi.Response.ACTION];
     // LOADED no debe restaurar el modal; esperar CANCEL o PICKED.
     if(action!==pickerApi.Action.CANCEL&&action!==pickerApi.Action.PICKED)return;
     if(!drivePickerActive)return;
     // Restaurar el formulario al cerrar el selector (también al cancelar).
     setDrivePickerActive(false);
     if(action===pickerApi.Action.CANCEL){
      $('financeDriveFolderStatus').textContent='Selección cancelada. Puedes volver a elegir la carpeta.';
      button.disabled=false;
      return;
     }
     const doc=result[pickerApi.Response.DOCUMENTS]?.[0];
     const folderId=doc?.[pickerApi.Document.ID]||doc?.id;
     if(!folderId){
      $('financeDriveFolderStatus').textContent='No se recibió una carpeta válida de Google.';
      button.disabled=false;
      return;
     }
     $('financeDriveFolderStatus').textContent='Verificando permisos para guardar recibos…';
     try{
      const response=await request('/drive/carpeta',{folderId});
      $('financeDriveFolderStatus').textContent='Carpeta seleccionada: 02_Recibos_PDF. Los recibos se subirán a la subcarpeta 2026.';
      updateDriveFolderLink(response.data?.url);
      setBackupStatus('Carpeta configurada correctamente. Selecciona un mes y pulsa Generar respaldo.','success');
     }catch(error){
      $('financeDriveFolderStatus').textContent='No se configuró la carpeta: '+error.message;
      setBackupStatus(error.message,'error');
     }finally{button.disabled=false;}
    }).build();
   // El overlay original tiene z-index 10090: tapaba Google Picker.
   setDrivePickerActive(true);
   picker.setVisible(true);
  }catch(error){
   setDrivePickerActive(false);
   $('financeDriveFolderStatus').textContent='No se pudo abrir el selector: '+error.message;
   setBackupStatus(error.message,'error');
  }finally{
   if(!drivePickerActive)button.disabled=false;
  }
 }
 $('financeDriveChooseFolder').addEventListener('click',()=>void pickDriveFolder());
 async function respaldarPdfDrive(periodo,allMonths){
  const months=allMonths?backupAvailablePeriods.slice().sort():[periodo];
  if(!months.length)throw Error('No hay meses con mantenimiento pagado');
  let pdfCount=0,created=0,updated=0,finalUrl=null;
  for(const month of months){
   let offset=0,rounds=0;
   do{
    if(rounds++>300)throw Error('Se detuvo el respaldo por demasiados lotes');
    setBackupStatus('Subiendo recibos de '+month+' (procesados '+offset+')…');
    const {data:page}=await request('/drive/recibos',{periodo:month,offset,...(activeConcept==='EXTRAORDINARIO'?{proyectoId:activeProyectoId}:{})});
    if(!Number.isSafeInteger(page?.nextOffset)||page.nextOffset<=offset)
     throw Error('La API no avanzó al siguiente lote de '+month);
    pdfCount+=Number(page.procesados||0);
    created+=Number(page.creados||0);
    updated+=Number(page.actualizados||0);
    finalUrl=page.folderUrl||finalUrl;
    offset=page.nextOffset;
    if(page.terminado)break;
   }while(true);
  }
  updateDriveFolderLink(finalUrl);
  return {pdfCount,created,updated,months:months.length};
 }

 $('financeDownloadAllReceipts').addEventListener('click',()=>openBackupModal('zip'));
 $('financeDriveConnect').addEventListener('click',()=>openBackupModal('connect'));
 $('financeDriveBackup').addEventListener('click',()=>openBackupModal('drive'));
 $('financeBackupClose').addEventListener('click',closeBackupModal);
 backupModal.addEventListener('click',event=>{if(event.target===backupModal)closeBackupModal();});
 backupPeriod.addEventListener('change',()=>{backupConfirm.disabled=backupBusy||!backupPeriod.value;});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!backupModal.hidden)closeBackupModal();});
 backupConfirm.addEventListener('click',async()=>{
  if(backupBusy||!backupAction)return;
  const action=backupAction,periodo=backupPeriod.value;
  if(action!=='connect'&&!validBackupPeriod(periodo)){
   setBackupStatus('Elige un mes válido antes de continuar.','error');return;
  }
  // Abrir la pestaña en el gesto original: evita el bloqueo del navegador
  // cuando la solicitud de autorización tarda en contestar.
  const googleTab=action==='connect'?window.open('about:blank','_blank'):null;
  setBackupBusy(true);
  setBackupStatus(action==='zip'?'Preparando PDFs y comprimiendo ZIP…'
   :action==='drive'?'Creando Excel y enviando respaldo a Drive…':'Preparando autorización de Google…');
  try{
   if(action==='connect'){
    const result=await request('/drive/conectar');
    if(!result.data?.url)throw Error('El servidor no proporcionó la URL de Google');
    if(googleTab&&!googleTab.closed){
     googleTab.opener=null;
     googleTab.location.replace(result.data.url);
     setBackupStatus('Autoriza en la nueva pestaña. Al terminar, vuelve aquí para generar el respaldo.','success');
    }else{
     setBackupStatus('Se abrirá Google para autorizar tu cuenta.','info');
     window.location.assign(result.data.url);
    }
   }else if(action==='zip'){
    const count=await downloadZip(periodo);
    setBackupStatus('Descarga iniciada: '+count+' PDF de '+periodo+'.','success');
   }else{
    const estado=(await request('/drive/status')).data;
    if(!estado?.connected)throw Error('Primero usa "Conectar con Google Drive" y autoriza tu cuenta.');
    if(!estado.folderConfigured)throw Error('Antes de respaldar pulsa "Elegir carpeta 02_Recibos_PDF".');
    const summary=await respaldarPdfDrive(periodo,backupAllMonths.checked);
    if(activeConcept==='EXTRAORDINARIO')setBackupStatus('Respaldo del proyecto terminado: '+summary.pdfCount+' PDF ('+summary.created+' nuevos, '+summary.updated+' actualizados).','success');
    else{
     setBackupStatus('PDF terminados: '+summary.pdfCount+' de '+summary.months+' mes(es). Guardando Excel…');
     const xlsx=await excelForDrive(periodo);
     await request('/drive/respaldo',{periodo,xlsx,soloExcel:true});
     setBackupStatus('Respaldo terminado: '+summary.pdfCount+' PDF ('+summary.created+' nuevos, '+summary.updated+' actualizados) en carpetas por año y Excel del padrón guardado.','success');
    }
   }
  }catch(error){
   if(googleTab&&!googleTab.closed)googleTab.close();
   setBackupStatus('No se completó la operación: '+error.message,'error');
  }finally{
   setBackupBusy(false);
  }
 });
 // Delegación: los movimientos del historial se renderizan después de cada carga.
 historyModal.addEventListener('click',async event=>{
  const button=event.target.closest('button[data-history-delete]');
  if(!button||historyModal.hidden||activeConcept!=='MANTENIMIENTO'||!historyModal.contains(button))return;
  event.preventDefault();
  const index=Number(button.dataset.historyDelete);
  const casaId=currentHistoryHouseId;
  const movimiento=historyMovements[index];
  const status=$('houseHistoryDeleteStatus');
  if(!Number.isSafeInteger(index)||!casaId||!movimiento)return;
  if(!movimiento.referencia){
   status.textContent='Este pago no tiene referencia identificable. No se borró ningún dato; necesita conciliación.';
   return;
  }
  if(button.disabled)return;
  button.disabled=true;
  status.textContent='Verificando el pago, los movimientos posteriores y la vigencia de los TAGs…';
  try{
   const path='/pagos-vivienda/'+Number(casaId)+'/anulacion';
   const preview=(await request(path+'?referencia='+encodeURIComponent(movimiento.referencia))).data;
   if(historyModal.hidden||currentHistoryHouseId!==casaId)return;
   if(!window.confirm('¿Anular '+fmt(preview.importe)+' de '+preview.periodos.join(', ')+'? '+
   'Se guardará una auditoría del movimiento y se actualizarán las cuotas. '+
   (preview.tags?'Los TAGs requerirán verificar la fecha '+displayDate(preview.fechaObjetivo)+'.':
    'Esta vivienda no tiene TAGs para actualizar.'))) {
    status.textContent='Operación cancelada; no se modificó ningún dato.';return;
   }
   if(window.prompt('Escribe ANULAR para confirmar que este pago es incorrecto:')!=='ANULAR'){
    status.textContent='Operación cancelada; no se modificó ningún dato.';return;
   }
   status.textContent='Anulando el pago y programando la corrección de ZKTeco…';
   const result=(await request(path,{referencia:movimiento.referencia,confirmacion:'ANULAR'})).data;
   const message='Pago anulado; '+result.periodosRestaurados+' período(s) restaurados. C3: '+result.restauracionC3.estado+'. Verifica el TAG físicamente.';
   await load();
   if(!historyModal.hidden&&currentHistoryHouseId===casaId){
    await openHouseHistory(casaId,null);
    status.textContent=message;
   }
   notice(message,'success');
  }catch(error){
   status.textContent='No se borró el pago: '+error.message;
  }finally{
   button.disabled=false;
  }
 });


 // La reversión de proyectos no modifica las cuotas de mantenimiento ni las vigencias C3.
 historyModal.addEventListener('click',async event=>{
  const button=event.target.closest('button[data-extra-history-delete]');
  if(!button||button.disabled||historyModal.hidden||activeConcept!=='EXTRAORDINARIO'||
     !historyModal.contains(button)||!activeProyectoId)return;
  event.preventDefault();
  const index=Number(button.dataset.extraHistoryDelete),casaId=Number(currentHistoryHouseId),
   projectId=Number(activeProyectoId),movimiento=historyMovements[index],
   status=$('houseHistoryDeleteStatus');
  if(!Number.isSafeInteger(index)||index<0||!Number.isSafeInteger(casaId)||casaId<1||
     !Number.isSafeInteger(projectId)||projectId<1||!movimiento)return;
  const source=String(movimiento.origenTipo||''),id=Number(movimiento.movimientoId);
  if(!['APORTACION','MANUAL'].includes(source)||!Number.isSafeInteger(id)||id<1){
   status.textContent='Este movimiento requiere conciliación antes de anular.';return;
  }
  button.disabled=true;
  status.textContent='Verificando la aportación y los saldos del proyecto…';
  const route='/proyectos-extraordinarios/'+projectId+'/viviendas/'+casaId+
   '/aportaciones/'+encodeURIComponent(source)+'/'+id+'/anulacion';
  try{
   const preview=(await request(route)).data;
   if(historyModal.hidden||currentHistoryHouseId!==casaId||
      Number(activeProyectoId)!==projectId||activeConcept!=='EXTRAORDINARIO')return;
   if(!window.confirm('¿Anular la aportación de '+fmt(preview.monto)+' del proyecto «'+preview.proyecto+'»?'+
      '\nReferencia: '+preview.referencia+'\n\n'+preview.advertencia+
      '\nEl adeudo se recalculará sin alterar mantenimiento ni TAGs.\n'+preview.avisoRecibos)){
    status.textContent='Cancelado; ningún abono fue modificado.';return;
   }
   if(window.prompt('Escribe ANULAR para confirmar que registraste este abono por error:')!=='ANULAR'){
    status.textContent='Cancelado; ningún abono fue modificado.';return;
   }
   status.textContent='Archivando el abono y actualizando el saldo…';
   const result=(await request(route,{confirmacion:'ANULAR',referencia:preview.referencia,monto:preview.monto})).data;
   if(!result?.anulado)throw Error('El servidor no confirmó la anulación; verifica antes de repetir.');
   const refreshed=await load();
   const msg=refreshed?'Aportación de '+fmt(preview.monto)+' anulada y archivada. Saldo actualizado.':
    'Anulación confirmada en el servidor. No se pudo recargar; verifica el historial antes de intentarlo otra vez.';
   if(!historyModal.hidden&&currentHistoryHouseId===casaId&&
      Number(activeProyectoId)===projectId&&activeConcept==='EXTRAORDINARIO'){
    await openHouseHistory(casaId,null);status.textContent=msg;
   }
   notice(msg,'success');
  }catch(error){status.textContent='No se anuló la aportación: '+error.message;}
  finally{button.disabled=false;}
 });

 function initializePaymentYears(){
  const now=mexicoYear(),yearSelect=$('housePaymentYear');
  yearSelect.innerHTML=Array.from({length:Math.max(0,2098-now+1)},(_,i)=>now+i).map(y=>'<option value="'+y+'">'+y+'</option>').join('');
  yearSelect.value=String(now);
 }
 initializePaymentYears();
 let otherConcepts={EXTRAORDINARIO:[],CASA_CLUB:[]};
 const isOther=()=>$('housePaymentType').value!=='MANTENIMIENTO';
 function renderOtherConcept(){
  const type=$('housePaymentType').value;
  const items=(otherConcepts[type]||[]).filter(c=>type!=='EXTRAORDINARIO'||!activeProyectoId||
    Number(c.cuotaExtraordinariaId)===Number(activeProyectoId));
  $('houseConceptSelect').innerHTML=items.length?items.map(c=>'<option value="'+Number(c.id)+'">'+esc(c.concepto)+' · '+esc(c.periodo)+' · '+esc(fmt(c.monto))+(c.estado==='EN_REVISION'?' · Comprobante en revisión':'')+'</option>').join(''):'<option value="">Sin cobros disponibles</option>';
  previewOtherConcept();
 }
 function previewOtherConcept({resetAmount=true}={}){
  const type=$('housePaymentType').value;
  const item=(otherConcepts[type]||[]).find(c=>String(c.id)===$('houseConceptSelect').value);
  if(resetAmount)$('housePaymentAmount').value=item?Number(type==='EXTRAORDINARIO'
    ?item.montoDisponible??item.monto:item.monto).toFixed(0):'';
  $('housePaymentAmount').readOnly=type!=='EXTRAORDINARIO';
  const amount=Number($('housePaymentAmount').value);
  const valid=Boolean(item)&&Number.isFinite(amount)&&amount>0&&
   Math.round(amount*100)<=Math.round(Number(type==='EXTRAORDINARIO'
      ?item.montoDisponible??item.monto:item.monto)*100);
  $('housePaymentSubmit').disabled=!valid||(type==='CASA_CLUB'&&item?.estado==='EN_REVISION');
  $('housePaymentPreview').textContent=item?(type==='CASA_CLUB'&&item.estado==='EN_REVISION'
   ?'Existe un comprobante de Casa Club en revisión.'
   :(type==='EXTRAORDINARIO'?
    'Meta de la vivienda: '+fmt(item.montoOriginal)+'. Ya aportado: '+fmt(item.montoPagado)+
    '. Falta para la meta: '+fmt(item.monto)+'. En revisión: '+fmt(item.pendienteValidacion||0)+
    '. Disponible para abonar ahora: '+fmt(item.montoDisponible??item.monto)+'. ':
    'Total por cubrir: '+fmt(item.monto)+'. ')+
    'Abono que registrarás: '+(Number.isFinite(amount)?fmt(amount):'inválido')+'.'+
    (!valid?' Ingresa cualquier importe positivo hasta el disponible.':'')+
    ' Sin fechas obligatorias, recargos ni cambios a TAGs.')
   :'No hay aportaciones disponibles de este proyecto.';
 }
 async function switchPaymentType(){
  const other=isOther();
  if(other)selectAnnualPayment(false);
  document.querySelectorAll('[data-maintenance-only]').forEach(el=>el.hidden=other);
  $('houseConceptWrap').hidden=!other;
  $('housePaymentTitle').textContent=other?'Registrar '+( $('housePaymentType').value==='CASA_CLUB'?'Casa club':'cuota extraordinaria'):'Registrar mensualidades pagadas';
  $('housePaymentYear').required=!other;
  if(!other){$('housePaymentAmount').readOnly=false;void quoteHousePayment();void checkAbonoAdeudo();return;}
  $('houseAbonoAdeudoOpen').hidden=true;
  $('housePaymentSubmit').disabled=true;
  $('housePaymentPreview').textContent='Consultando cargos de la vivienda…';
  try{otherConcepts=(await request('/pagos-concepto/'+Number(activePaymentHouse.casaId))).data;renderOtherConcept();}
  catch(e){$('housePaymentPreview').textContent=e.message;}
 }
 const monthsES=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
 function paymentPreview(){
   if(isOther()){previewOtherConcept({resetAmount:false});return;}
   const output=$('housePaymentPreview'),submit=$('housePaymentSubmit');
   submit.disabled=true;
   if(!currentPaymentQuote){output.textContent='Consultando el historial de cuotas…';return;}
   const q=currentPaymentQuote;
   const total=Number($('housePaymentAmount').value);
   const valid=Number.isFinite(total)&&Math.round(total*100)>=Math.round(q.montoMinimo*100) &&
     Math.round(total*100)<=Math.round(q.montoMaximo*100);
   const names=q.periodos.map(p=>p.mes+' '+p.anio);
   const errors=q.periodos.filter(p=>!p.registrable).map(p=>p.mes+' '+p.anio+': '+p.motivo);
   output.textContent=(annualPaymentSelected?'Pago anual '+$('housePaymentYear').value+'. Se registrarán solo los meses pendientes. ':'')+
     'Mensualidades: '+names.join(', ')+'. Total sugerido: '+fmt(q.montoSugerido)+
     '. Importe recibido: '+(Number.isFinite(total)?fmt(total):'inválido')+
     '. Fecha final solicitada para todos los TAGs: '+q.fechaFinObjetivo+'.'+
     (!valid?' El monto para '+q.meses+' meses debe estar entre '+fmt(q.montoMinimo)+' y '+fmt(q.montoMaximo)+'.':'')+
     (errors.length?' BLOQUEADO: '+errors.join(' | '):'');
   if(q.requiereConciliacionTarifa&&!$('housePaymentTariffReconcile').checked)
     output.textContent+=' Antes de confirmar, autoriza expresamente la conciliación de los abonos anteriores mostrados abajo.';
   submit.disabled=!valid||q.bloqueado||
     (q.requiereRevision&&!$('housePaymentReview').checked)||
     (q.requiereConciliacionTarifa&&!$('housePaymentTariffReconcile').checked);
 }
 async function quoteHousePayment({resetAmount=true}={}){
   if(!activePaymentHouse||isOther())return;
   const seq=++quoteSequence;
   currentPaymentQuote=null;
   $('housePaymentCount').value='0';
   $('houseLastPayment').textContent='Consultando el último mes pagado en MySQL…';
   $('housePaymentStatus').textContent='';
   $('housePaymentReviewWrap').hidden=true;
   $('housePaymentReview').checked=false;
   $('housePaymentTariffReconcileWrap').hidden=true;
   $('housePaymentTariffReconcile').checked=false;
   paymentPreview();
   const year=Number($('housePaymentYear').value),month=Number($('housePaymentMonth').value);
   if(!Number.isInteger(year)||String(year).length!==4||year<mexicoYear()||year>2098||month<1||month>12){
    $('houseLastPayment').textContent='El año debe tener cuatro dígitos y ser igual o mayor al actual.';
    $('housePaymentPreview').textContent='Selecciona un mes y un año válidos para calcular el pago.';
    return;
   }
   try{
     const response=await request('/pagos-vivienda/'+Number(activePaymentHouse.casaId)+
       '/cotizar?anio='+year+'&mes='+month);
     if(seq!==quoteSequence||!activePaymentHouse)return;
     const q=response.data;
     currentPaymentQuote=q;
     $('housePaymentNotice').textContent='Se calcula desde el último mes completamente pagado hasta el mes seleccionado. Tarifa de esta vivienda: '+fmt(q.tarifaMensual)+' por mes. Se puede agregar hasta '+fmt(50)+' de recargo por mes. Los pagos parciales, comprobantes y cobros previos requieren conciliación; los TAGs se verifican por separado y su fecha se ajustará al corte confirmado, incluso si la vigencia actual es posterior.';
     $('houseLastPayment').textContent='Último mes completamente pagado: '+
       (q.ultimoMesPagado?q.ultimoMesPagado.mes+' '+q.ultimoMesPagado.anio:
         'sin pago anterior confirmado en el historial')+
       '. Meses a cobrar: '+q.meses+' ('+q.desde.nombre+' '+q.desde.anio+' a '+
       q.hasta.nombre+' '+q.hasta.anio+').';
     $('housePaymentCount').value=String(q.meses);
     $('housePaymentTariffReconcileWrap').hidden=!q.requiereConciliacionTarifa;
     $('housePaymentTariffReconcileHint').textContent=(q.conciliacionesTarifa||[]).map(
       p=>p.mes+' '+p.anio+': abonados '+fmt(p.montoPagado)+' el '+displayDate(p.fechaPago)+
       '; tarifa especial '+fmt(q.tarifaMensual)+' · se reconocerá como pagado sin cobrar de nuevo.'
     ).join(' | ');
     if(resetAmount)$('housePaymentAmount').value=String(Number(q.montoSugerido));
     $('housePaymentReviewWrap').hidden=!q.requiereRevision;
     $('housePaymentReviewHint').textContent=q.periodos.filter(p=>p.requiereRevision).map(
       p=>p.mes+' '+p.anio+': '+p.advertencia).join(' | ');
     if(q.bloqueado)$('housePaymentStatus').textContent=
       'Hay un registro que requiere conciliación antes de confirmar: '+
       q.periodos.filter(p=>!p.registrable).map(p=>p.mes+' '+p.anio+': '+p.motivo).join(' | ');
     paymentPreview();
   }catch(error){
     if(seq!==quoteSequence)return;
     $('houseLastPayment').textContent=error.message.includes('ya está cubierto')?
       'La fecha seleccionada está completamente pagada. Elige un mes posterior.':
       'No fue posible cotizar esta fecha: '+error.message;
     $('housePaymentPreview').textContent=error.message;
     $('housePaymentSubmit').disabled=true;
   }
 }
 function openHousePayment(casaId){
   const house=data?.viviendas?.find(h=>Number(h.casaId)===Number(casaId));
   if(!house)return;
   activePaymentHouse=house;
   $('housePaymentHouse').textContent=house.calle+' '+house.numero+' · '+(house.nombre||'Sin residente registrado');
   const now=mexicoYear(),last=indiceUltimoMesPagado(house.ultimoMesPagado);
   const calendar=new Date();
   const currentMonth=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/Mexico_City',month:'numeric'}).format(calendar));
   const target=Math.max(now*12+currentMonth-1,last===null?0:last+1);
   const targetYear=Math.floor(target/12);
   $('housePaymentYear').value=String(Math.min(2098,targetYear));
   $('housePaymentMonth').value=String(target%12+1);
   $('housePaymentCount').value='0';
   $('housePaymentAmount').value='';
   $('housePaymentMethod').value='EFECTIVO';
   $('housePaymentType').value=activeConcept;
   backFromAbonoAdeudo();
   $('houseAbonoAdeudoOpen').hidden=true;
   selectAnnualPayment(false);
   $('housePaymentStatus').textContent='';
   paymentModal.hidden=false;
   switchPaymentType();
   $('housePaymentMonth').focus();
   if(activeConcept!=='MANTENIMIENTO')$('houseConceptSelect').focus();
 }
 function closeHousePayment(){
   ++quoteSequence;
   ++abonoSequence;
   currentAbonoAdeudo=null;
   backFromAbonoAdeudo();
   $('houseAbonoAdeudoOpen').hidden=true;
   confirmedPaymentTarget=null;
   paymentModal.hidden=true;
   activePaymentHouse=null;
   currentPaymentQuote=null;
   selectAnnualPayment(false);
 }
 async function refreshHousePaymentC3(){
   if(!activePaymentHouse)return;
   const el=$('housePaymentStatus'),btn=$('housePaymentRefreshC3');
   btn.disabled=true;el.textContent='Consultando la sincronización de los TAGs…';
   try{
     const result=await request('/pagos-vivienda/'+Number(activePaymentHouse.casaId)+'/estado-c3');
     const state=result.data;
     const distinct=[...new Set((state.fechasTags||[]).map(t=>t.fechaFinal||'Sin fecha'))];
     const target=confirmedPaymentTarget||currentPaymentQuote?.fechaFinObjetivo;
     const equal=Boolean(target)&&state.fechasTags?.length>0&&
       state.fechasTags.every(t=>String(t.fechaFinal)===target);
     el.textContent=state.tags?
       'ZKTeco: '+(state.sincronizacion||'Sin estado')+' · '+state.tags+' TAG(s) · '+
       (state.fechaFinal?'Fecha común: '+state.fechaFinal:'Fechas diferentes: '+distinct.join(', '))+
       (equal&&state.sincronizacion==='COMPLETADO'?' · Todas las fechas coinciden con el corte solicitado.':' · Aún no se confirma el corte solicitado en todos los TAGs.')+
       (state.errorSincronizacion?' · Error: '+state.errorSincronizacion:''):
       'Esta vivienda no tiene TAGs asociados.';
   }catch(error){el.textContent='No fue posible consultar el C3: '+error.message;}
   finally{btn.disabled=false;}
 }
 async function submitHousePayment(event){
   event.preventDefault();
   if($('housePaymentSubmit').disabled)return;
   if(isOther()){
    const type=$('housePaymentType').value;
    const item=(otherConcepts[type]||[]).find(c=>String(c.id)===$('houseConceptSelect').value);
    if(!activePaymentHouse||!item||(type==='CASA_CLUB'&&item.estado==='EN_REVISION'))return;
    const abono=Number($('housePaymentAmount').value);
    if(!Number.isFinite(abono)||abono<=0||Math.round(abono*100)>Math.round(Number(type==='EXTRAORDINARIO'
      ?item.montoDisponible??item.monto:item.monto)*100)){
     $('housePaymentStatus').textContent='El abono no puede superar '+fmt(item.monto)+'.';return;
    }
    if(!confirm('¿Confirmas que recibiste '+fmt(abono)+' de '+activePaymentHouse.calle+' '+activePaymentHouse.numero+' para '+item.concepto+'?'))return;
    $('housePaymentSubmit').disabled=true;
    try{
     const result=await request('/pagos-concepto',{casaId:Number(activePaymentHouse.casaId),tipoPago:type,conceptoId:Number(item.id),monto:abono,formaPago:$('housePaymentMethod').value});
     closeHousePayment();await load();notice(result.message+' Referencia: '+result.data.referencia,'success');
    }catch(e){$('housePaymentStatus').textContent=e.message;await switchPaymentType();}
    return;
   }
   if(!activePaymentHouse||!currentPaymentQuote||Number($('housePaymentYear').value)<mexicoYear())return;
   const payload={casaId:Number(activePaymentHouse.casaId),
     anio:Number($('housePaymentYear').value),mes:Number($('housePaymentMonth').value),
     mesesEsperados:currentPaymentQuote.meses,montoTotal:Number($('housePaymentAmount').value),
     formaPago:$('housePaymentMethod').value,pagoAnual:annualPaymentSelected,
     confirmarHistorico:$('housePaymentReview').checked,
     confirmarConciliacionTarifa:$('housePaymentTariffReconcile').checked};
   if(!confirm('¿Confirmas que recibiste '+fmt(payload.montoTotal)+' de '+
     activePaymentHouse.calle+' '+activePaymentHouse.numero+' para '+
     currentPaymentQuote.periodos.map(p=>p.mes+' '+p.anio).join(', ')+
     '?\n'+(payload.pagoAnual?'Se registrará el cierre anual '+payload.anio+'. ':'')+
     'Se guardarán '+currentPaymentQuote.meses+' cuotas y se solicitará fecha final '+
     currentPaymentQuote.fechaFinObjetivo+' en todos sus TAGs.'+
     ' Si algún TAG tiene vigencia posterior, esta se reemplazará por '+currentPaymentQuote.fechaFinObjetivo+'.'+
     (payload.confirmarConciliacionTarifa?' Se conciliará además el historial abonado anteriormente, sin duplicar ingresos.':'')))return;
   const btn=$('housePaymentSubmit');btn.disabled=true;
   $('housePaymentStatus').textContent='Registrando el movimiento en MySQL…';
   try{
     const result=await request('/pagos-vivienda',payload);
     // Cerramos SOLO después del éxito confirmado por el backend. A partir de
     // aquí ningún error al refrescar la tabla debe interpretarse como error
     // del pago ni provocar otro intento de registro.
     const message=result.message+' Referencia: '+result.data.referencia+
       '. Verifica por separado las vigencias físicas en ZKTeco.';
     closeHousePayment();
     const refreshed=await load();
     if(!refreshed){
       notice(message+' El pago fue confirmado, pero no se pudo refrescar la tabla. Consulta nuevamente el historial.','success');
       return;
     }
     const updated=data?.viviendasMantenimiento?.find(h=>Number(h.casaId)===payload.casaId);
     const ultimo=indiceUltimoMesPagado(updated?.ultimoMesPagado);
     const esperado=payload.anio*12+payload.mes-1;
     if(ultimo===null||ultimo<esperado){
       notice(message+' Atención: la nueva consulta aún no refleja los meses pagados. Revisa el historial y la respuesta del servidor antes de intentar otro cobro.','success');
       return;
     }
     let historialConfirmado=false;
     try{
       const historial=(await request('/pagos-vivienda/'+payload.casaId+'/historial?concepto=MANTENIMIENTO')).data;
       historialConfirmado=(historial.movimientos||[]).some(m=>m.referencia===result.data.referencia);
     }catch(_error){/* No revertir ni repetir un pago ya confirmado. */}
     notice(message+(historialConfirmado?' El movimiento también aparece en el historial.':
       ' No se pudo verificar todavía el movimiento en el historial; no repitas el cobro sin comprobarlo.'),'success');
   }catch(error){
     $('housePaymentStatus').textContent=error.message;
     await quoteHousePayment({resetAmount:false});
     // Preservar el error después de refrescar la cotización.
     $('housePaymentStatus').textContent=error.message;
   }finally{btn.disabled=true;}
 }
 $('financeHouseRows').addEventListener('click',async event=>{
  const registerButton=event.target.closest('[data-resident-register]');
  if(registerButton){openResidentRegistration(registerButton.dataset.residentRegister,registerButton);return;}
  const historyButton=event.target.closest('[data-paid-history]');
  if(historyButton){void openHouseHistory(historyButton.dataset.paidHistory,historyButton);return;}
  const tagButton=event.target.closest('[data-tags-house]');
  if(tagButton){openHouseTags(tagButton.dataset.tagsHouse);return;}
  const btn=event.target.closest('[data-pay-house]');
  if(btn){openHousePayment(btn.dataset.payHouse);return;}
  if(event.target.closest('input,button,a,select,label'))return;
  const row=event.target.closest('[data-receipt-row]');
  if(row&&(activeConcept==='MANTENIMIENTO'||(activeConcept==='EXTRAORDINARIO'&&activeProyectoId))){
   selectedReceiptHouseId=Number(row.dataset.receiptRow);renderHouses();
  }
 });
 $('financeHouseRows').addEventListener('keydown',event=>{
  if(!['MANTENIMIENTO','EXTRAORDINARIO'].includes(activeConcept)||!['Enter',' '].includes(event.key))return;
  const row=event.target.closest('[data-receipt-row]');
  if(!row||event.target!==row)return;
  event.preventDefault();
  selectedReceiptHouseId=Number(row.dataset.receiptRow);
  renderHouses();
  $('financeHouseRows').querySelector('[data-receipt-row="'+selectedReceiptHouseId+'"]').focus();
 });
 $('housePaymentClose').addEventListener('click',closeHousePayment);
 paymentModal.addEventListener('click',event=>{if(event.target===paymentModal)closeHousePayment();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!paymentModal.hidden)closeHousePayment();});
 $('housePaymentForm').addEventListener('submit',submitHousePayment);
 $('housePaymentRefreshC3').addEventListener('click',refreshHousePaymentC3);
 $('housePaymentAnnual').addEventListener('click',()=>{
  if(!activePaymentHouse||isOther())return;
  $('housePaymentYear').value=String(mexicoYear());
  $('housePaymentMonth').value='12';
  selectAnnualPayment(true);
  void quoteHousePayment();
 });
 for(const id of ['housePaymentMonth','housePaymentYear'])
  $(id).addEventListener('change',()=>{selectAnnualPayment(false);void quoteHousePayment();});
 $('housePaymentAmount').addEventListener('input',paymentPreview);
 $('housePaymentType').addEventListener('change',switchPaymentType);
 $('houseConceptSelect').addEventListener('change',previewOtherConcept);
 $('housePaymentReview').addEventListener('change',paymentPreview);
 $('housePaymentTariffReconcile').addEventListener('change',paymentPreview);
 async function load(){
  $('updateFinance').disabled=true;$('financeNotice').hidden=true;
  try{
   const year=Number($('financeYear').value),month=Number($('financeMonth').value);
   const response=await request('/analisis?anio='+year+'&mes='+month);
   data=response.data;
   data.viviendasMantenimiento=data.viviendas;
   if(activeConcept!=='MANTENIMIENTO'&&!Array.isArray(data.viviendasConceptos?.[activeConcept]))activeConcept='MANTENIMIENTO';
   render();
   elegirConcepto(activeConcept,{resetPage:false});
   lastSuccessfulFinanceLoad=Date.now();
   return true;
  }catch(e){notice(e.message);return false;}
  finally{$('updateFinance').disabled=false;}
 }
 $('updateFinance').addEventListener('click',load);
 document.querySelectorAll('[data-finance-concept]').forEach(tab=>{
  tab.addEventListener('click',()=>elegirConcepto(tab.dataset.financeConcept));
  tab.addEventListener('keydown',event=>{
   if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
   const tabs=[...document.querySelectorAll('[data-finance-concept]')];
   const index=tabs.indexOf(tab);
   const next=event.key==='Home'?0:event.key==='End'?tabs.length-1:
     (index+(event.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
   event.preventDefault();
   elegirConcepto(tabs[next].dataset.financeConcept);
   tabs.find(t=>t.getAttribute('aria-selected')==='true')?.focus();
  });
 });
 $('financeCashChart').addEventListener('click',event=>{
  const btn=event.target.closest('button[data-income-street]');
  if(!btn)return;
  const calle=btn.dataset.incomeStreet;
  if(!Array.isArray(data?.ingresosMantenimientoCalles?.calles?.find(c=>c.calle===calle)?.historialMensual)){
   notice('Actualiza el backend de Hostinger para consultar el historial de '+calle+'.');return;
  }
  historyPreviousFocus=btn;
  selectedIncomeStreet=calle;
  renderIncomeHistory();
 });
 $('financeExpenseChart').addEventListener('click',event=>{
  const btn=event.target.closest('button[data-expense-concept]');
  if(!btn)return;
  const categoria=btn.dataset.expenseConcept;
  if(!Array.isArray(data?.egresosPorConcepto?.historialMensual?.[categoria])){
   notice('Actualiza el backend de Hostinger para consultar el histórico de '+categoria+'.');return;
  }
  historyPreviousFocus=btn;
  selectedExpenseCategory=categoria;
  renderExpenseHistory();
 });
 $('financeIncomeHistoryClose').addEventListener('click',()=>closeFinanceHistory('income'));
 $('financeExpenseHistoryClose').addEventListener('click',()=>closeFinanceHistory('expense'));
 // Edición por mes con validación del total previo para evitar cambios perdidos.
 $('financeExpenseHistoryRows').addEventListener('click',event=>{
  if(expenseMonthlySaving)return;
  const edit=event.target.closest('[data-edit-expense-month]');
  const cancel=event.target.closest('[data-cancel-expense-month]');
  if(!edit&&!cancel)return;
  const row=event.target.closest('tr[data-expense-month]');
  if(!row)return;
  if(edit){
   $('financeExpenseHistoryRows').querySelectorAll('tr[data-expense-month]').forEach(other=>{
    const form=other.querySelector('form[data-save-expense-month]');
    const label=other.querySelector('.finance-expense-month-display');
    form.hidden=true;label.hidden=false;
   });
   const form=row.querySelector('form[data-save-expense-month]');
   row.querySelector('.finance-expense-month-display').hidden=true;
   form.hidden=false;
   row.querySelector('.finance-expense-month-feedback').textContent='';
   form.querySelector('input').focus();
   form.querySelector('input').select();
  }else{
   row.querySelector('form[data-save-expense-month]').hidden=true;
   row.querySelector('.finance-expense-month-display').hidden=false;
   row.querySelector('[data-edit-expense-month]')?.focus();
  }
 });
 $('financeExpenseHistoryRows').addEventListener('submit',async event=>{
  const form=event.target.closest('form[data-save-expense-month]');
  if(!form)return;
  event.preventDefault();
  if(expenseMonthlySaving||!selectedExpenseCategory)return;
  const periodo=form.dataset.saveExpenseMonth;
  const current=data?.egresosPorConcepto?.historialMensual?.[selectedExpenseCategory]
   ?.find(r=>r.periodo===periodo);
  if(!current)return;
  const input=form.querySelector('input');
  if(!input.reportValidity())return;
  const nuevo=Number(input.value),anterior=Number(current.totalPagado);
  const feedback=form.closest('td').querySelector('.finance-expense-month-feedback');
  if(!Number.isFinite(nuevo)||nuevo<0||nuevo>100000000||!Number.isInteger(nuevo)){
   feedback.textContent='Escribe un monto válido en pesos enteros, sin valores negativos.';
   return;
  }
  if(Math.round(nuevo*100)===Math.round(anterior*100)){
   form.hidden=true;
   form.closest('td').querySelector('.finance-expense-month-display').hidden=false;
   return;
  }
  if(!window.confirm('¿Actualizar '+expenseLabel(selectedExpenseCategory)+' de '+
   current.mes+' '+current.anio+' de '+fmt(anterior)+' a '+fmt(nuevo)+
   '? Se creará un ajuste contable auditable, conservando los gastos originales.'))return;
  expenseMonthlySaving=true;
  feedback.textContent='Guardando el ajuste en MySQL…';
  form.querySelectorAll('input,button').forEach(el=>el.disabled=true);
  const table=form.closest('.finance-historical-table');
  const scrollTop=table?.scrollTop||0;
  try{
   const result=await request('/egresos/resumen-mensual',{
    categoria:selectedExpenseCategory,periodo,
    totalAnterior:anterior.toFixed(2),totalPagado:nuevo.toFixed(2)
   },'PUT');
   // La escritura ya se confirmó, aun si falla la recarga posterior.
   feedback.textContent=result.message||'Ajuste registrado.';
   const refreshed=await load();
   if(refreshed){
    $('financeExpenseHistory').querySelector('.finance-historical-table').scrollTop=scrollTop;
    notice((result.message||'Total actualizado')+(result.data?.referencia
     ?' Referencia: '+result.data.referencia:'')+'.','success');
   }else{
    notice('El ajuste se guardó en MySQL, pero la consulta no se pudo actualizar. No lo registres otra vez; actualiza la página.','success');
   }
  }catch(error){
   feedback.textContent=error.message;
   if(/cambió desde que abriste/.test(error.message))
    notice('Los egresos cambiaron. Vuelve a consultar el análisis antes de editar de nuevo.','error');
  }finally{
   expenseMonthlySaving=false;
   if(form.isConnected)form.querySelectorAll('input,button').forEach(el=>el.disabled=false);
  }
 });

 for(const [id,kind] of [['financeIncomeHistoryModal','income'],['financeExpenseHistory','expense']]){
  $(id).addEventListener('click',event=>{
   if(event.target===$(id))closeFinanceHistory(kind);
  });
 }
 document.addEventListener('keydown',event=>{
  const kind=!$('financeIncomeHistoryModal').hidden?'income':
   !$('financeExpenseHistory').hidden?'expense':null;
  if(!kind)return;
  if(event.key==='Escape'){
   event.preventDefault();closeFinanceHistory(kind);
  }else if(event.key==='Tab'){
   // Mantener la navegación por teclado de Guardar/Cancelar/Editar,
   // y contener el foco dentro del diálogo cuando está abierto.
   const modal=$(kind==='income'?'financeIncomeHistoryModal':'financeExpenseHistory');
   const elements=[...modal.querySelectorAll('button:not([disabled]),input:not([disabled])')]
    .filter(el=>!el.closest('[hidden]')&&el.getClientRects().length>0);
   if(!elements.length)return;
   const first=elements[0],last=elements[elements.length-1];
   if(!modal.contains(document.activeElement)){
    event.preventDefault();first.focus();
   }else if(event.shiftKey&&document.activeElement===first){
    event.preventDefault();last.focus();
   }else if(!event.shiftKey&&document.activeElement===last){
    event.preventDefault();first.focus();
   }
  }
 });
 $('expenseFilterConcept').addEventListener('input',()=>{expensePage=1;renderExpenses();});
 for(const id of ['expenseFilterCategory','expenseFilterFrom','expenseFilterTo','expenseSort'])
  $(id).addEventListener('change',()=>{expensePage=1;renderExpenses();});
 // Algunos selectores nativos notifican primero input; reflejar el rango en
 // la tabla sin esperar a que el usuario cierre o pierda foco.
 for(const id of ['expenseFilterFrom','expenseFilterTo'])
  $(id).addEventListener('input',()=>{expensePage=1;renderExpenses();});
 $('expenseClearFilters').addEventListener('click',()=>{
  for(const id of ['expenseFilterConcept','expenseFilterCategory','expenseFilterFrom','expenseFilterTo'])$(id).value='';
  expenseDateInputs.forEach(syncExpenseDateDisplay);
  $('expenseSort').value='fecha_desc';expensePage=1;
  renderExpenses();
 });
 $('expensePrev').addEventListener('click',()=>{expensePage--;renderExpenses();});
$('expenseNext').addEventListener('click',()=>{expensePage++;renderExpenses();});
window.addEventListener('resize',()=>{if(data)renderExpenses();});
let historicalExtraId=null;
 $('financeExpenseRows').addEventListener('click',event=>{
  const proof=event.target.closest('[data-expense-proof]');if(proof){descargarComprobante(proof.dataset.expenseProof);return;}
  const b=event.target.closest('[data-extra-expense]');if(!b)return;
  const item=data?.egresos?.find(e=>Number(e.id)===Number(b.dataset.extraExpense));if(!item)return;
  historicalExtraId=item.id;
  $('historicalExtraName').textContent=item.concepto+' · '+fmt(item.monto);
  $('historicalExtraStart').value=$('expenseDate').value.slice(0,7);
  $('historicalExtraStatus').textContent='';$('historicalExtraModal').hidden=false;
 });
 $('historicalExtraClose').addEventListener('click',()=>$('historicalExtraModal').hidden=true);
 $('historicalExtraForm').addEventListener('submit',async event=>{
  event.preventDefault();if(!historicalExtraId)return;
  const meses=Number($('historicalExtraMonths').value),fechaInicio=$('historicalExtraStart').value+'-01';
  if(!confirm('¿Generar '+meses+' mensualidad(es) del proyecto entre 231 viviendas?'))return;
  const button=event.target.querySelector('[type=submit]');button.disabled=true;
  try{await request('/egresos/'+Number(historicalExtraId)+'/activar-cuota',{meses,fechaInicio});$('historicalExtraModal').hidden=true;await load();notice('Se generaron los cargos mensuales sin alterar los TAGs.','success');}
  catch(e){$('historicalExtraStatus').textContent=e.message;}
  finally{button.disabled=false;}
 });
 document.querySelectorAll('[data-house-sort]').forEach(button=>button.addEventListener('click',()=>orderHouses(button.dataset.houseSort)));
 $('financeColumnSort').addEventListener('change',()=>orderHouses($('financeColumnSort').value));
 $('financeColumnDirection').addEventListener('click',()=>orderHouses(houseSort.key));
 $('financeRegistrationOrder').addEventListener('change',event=>{
  const choice=event.target.value;
  if(choice==='registro_asc'||choice==='registro_desc')houseSort={key:'registro',direction:choice.slice(9)};
  else houseSort={key:'calle',direction:'asc'};
  housePage=1;renderHouses();
 });
 for(const id of ['financeSearch','financeStreet','financeStatus','financeLastPaidMonth','financeLastPaidYear'])
  $(id).addEventListener(id==='financeSearch'?'input':'change',()=>{housePage=1;renderHouses();});
 $('financePrev').addEventListener('click',()=>{housePage=Math.max(1,housePage-1);renderHouses();});
 $('financeNext').addEventListener('click',()=>{housePage++;renderHouses();});
 $('financeClear').addEventListener('click',()=>{
  ['financeSearch','financeStreet','financeStatus','financeLastPaidMonth'].forEach(id=>$(id).value='');
  $('financeLastPaidYear').value=String(moment.getFullYear());
  houseSort={key:'calle',direction:'asc'};
  $('financeRegistrationOrder').value='';
  housePage=1;renderHouses();
 });
 $('newExpense').addEventListener('submit',async e=>{
 e.preventDefault();
 const body={fecha:$('expenseDate').value,categoria:$('expenseCategory').value,
  ambito:$('expenseScope').value,monto:Number($('expenseAmount').value),concepto:$('expenseConcept').value.trim()};
 if(!Number.isInteger(body.monto)||body.monto<=0)return notice('Ingresa un monto sin decimales.');
 const project=body.categoria==='PROYECTO';
 if(!confirm('¿Confirmas '+(project?'crear el proyecto':'registrar este egreso')+
  ' por '+fmt(body.monto)+' de '+body.concepto+'?'))return;
 $('saveExpense').disabled=true;
 try{
  const saved=await request('/egresos',body);
  if(project&&saved.proyectoId){activeConcept='EXTRAORDINARIO';activeProyectoId=saved.proyectoId;}
  $('newExpense').reset();syncExtraExpense();
  $('expenseDate').value=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  expenseDateInputs.forEach(syncExpenseDateDisplay);expensePage=1;
  await load();
  notice(project?'Proyecto creado: disponible en el selector de cuotas extraordinarias.':
   'Egreso registrado. Referencia: '+(saved.referencia||'generada'),'success');
 }catch(error){notice(error.message);}
 finally{$('saveExpense').disabled=false;}
});
 

async function descargarComprobante(id){
 try{
  const num=Number(id);if(!Number.isSafeInteger(num)||num<1)throw Error('Comprobante inválido');
  const response=await fetch(API+'/finanzas/egresos/'+num+'/comprobante',{headers:{Authorization:'Bearer '+token}});
  if(!response.ok)throw Error('No se pudo descargar el comprobante.');
  const blob=await response.blob(),extension=blob.type==='application/pdf'?'pdf':blob.type==='image/png'?'png':'jpg';
  const url=URL.createObjectURL(blob),anchor=document.createElement('a');
  anchor.href=url;anchor.download='comprobante-egreso-'+num+'.'+extension;
  document.body.append(anchor);anchor.click();anchor.remove();
  setTimeout(()=>URL.revokeObjectURL(url),15000);
 }catch(error){notice(error.message);}
}
$('financeExpenseChart').addEventListener('click',e=>{
 const proof=e.target.closest('[data-expense-proof]');
 if(proof)descargarComprobante(proof.dataset.expenseProof);
});
$('financeProjectExpenseForm').addEventListener('submit',async e=>{
 e.preventDefault();
 if(activeConcept!=='EXTRAORDINARIO'||!activeProyectoId)return notice('Selecciona un proyecto.');
 const btn=$('financeProjectExpenseSave'),file=$('financeProjectExpenseProof').files?.[0];
 const body={fecha:$('financeProjectExpenseDate').value,categoria:'PROYECTO',proyectoId:activeProyectoId,
  concepto:$('financeProjectExpenseName').value.trim(),monto:Number($('financeProjectExpenseAmount').value)};
 if(!Number.isInteger(body.monto)||body.monto<=0)return notice('El costo debe expresarse en pesos enteros.');
 if(file){
  if(file.size>1024*1024)return notice('El comprobante no puede superar 1 MB.');
  if(!['image/jpeg','image/png','application/pdf'].includes(file.type))
   return notice('Adjunta una imagen JPG, PNG o un PDF.');
  const bytes=new Uint8Array(await file.arrayBuffer()),pieces=[];
  for(let i=0;i<bytes.length;i+=8192)pieces.push(String.fromCharCode(...bytes.subarray(i,i+8192)));
  body.comprobante={mime:file.type,base64:btoa(pieces.join(''))};
 }
 if(!confirm('¿Registrar '+body.concepto+' por '+fmt(body.monto)+' en este proyecto?'))return;
 btn.disabled=true;
 try{
  await request('/egresos',body);$('financeProjectExpenseForm').reset();
  $('financeProjectExpenseDate').value=$('expenseDate').value;expensePage=1;
  await load();
  $('financeProjectExpenseStatus').textContent='Concepto guardado en el proyecto.';
  notice('Gasto real registrado, sin afectar mantenimiento o Casa Club.','success');
 }catch(error){$('financeProjectExpenseStatus').textContent=error.message;notice(error.message);}
 finally{btn.disabled=false;}
});

// Proyecto extraordinario: el alta se configura en un único modal con 231 viviendas.
 $('financeProjectSelect').addEventListener('change',()=>{
  const id=Number($('financeProjectSelect').value);
  activeProyectoId=Number.isSafeInteger(id)&&id>0?id:null;expensePage=1;
  elegirConcepto('EXTRAORDINARIO');
 });

 const projectModal=$('financeProjectRulesModal');
 const projectMoney=new Intl.NumberFormat('es-MX',{style:'currency',currency:'MXN',minimumFractionDigits:0,maximumFractionDigits:0});
 const projectMoneyText=value=>projectMoney.format(Number(value||0));
 const projectHouses=()=>[...(data?.viviendasMantenimiento||[])].filter(h=>!h.esPrueba).sort((a,b)=>
  String(a.calle).localeCompare(String(b.calle),'es',{numeric:true})||
  String(a.numero).localeCompare(String(b.numero),'es',{numeric:true}));
 let projectExceptions=new Map(),projectPreview=null,projectSaving=false,projectPreviousFocus=null;
 const projectBudgetValid=value=>{
  const n=Number(value);
  return String(value??'').trim()!==''&&Number.isFinite(n)&&Number.isInteger(n)&&n>=3&&n<=10000000&&
   Math.abs(n*100-Math.round(n*100))<0.001;
 };
 function computeProjectPreview(){
  if(!projectBudgetValid($('financeRulesBudget').value))return null;
  if(!window.MJProjectBudget?.distribuir)throw Error('El cálculo de presupuesto no está disponible. Actualiza la página.');
  const exceptions=[...projectExceptions].map(([casaId,monto])=>({casaId,monto}));
  if(exceptions.some(({monto})=>!Number.isInteger(Number(monto))))
   throw Error('Las cuotas excepcionales deben expresarse en pesos enteros.');
  return window.MJProjectBudget.distribuir(
   projectHouses(),Number($('financeRulesBudget').value),exceptions
  );
 }
 function renderProjectModal(){
  const houses=projectHouses();
  const term=$('financeRulesSearch').value.trim().toLocaleLowerCase('es');
  let error='';
  try{projectPreview=computeProjectPreview();}catch(e){projectPreview=null;error=e.message;}
  const amounts=new Map((projectPreview?.rows||[]).map(r=>[r.casaId,r]));
  $('financeRulesBudgetDisplay').textContent=projectPreview
   ?projectMoneyText(projectPreview.totalCentavos/100)
   :projectBudgetValid($('financeRulesBudget').value)?'Revisar importe':'Pendiente';
  $('financeRulesHouses').textContent=String(houses.length);
  $('financeRulesSpecialCount').textContent=String(projectExceptions.size);
  $('financeRulesDiff').textContent=projectPreview?fmt(0):'Pendiente';
  $('financeRulesRows').innerHTML=houses.filter(h=>
   (h.calle+' '+h.numero+' '+(h.nombre||'')).toLocaleLowerCase('es').includes(term))
   .map(h=>{
    const id=Number(h.casaId),current=amounts.get(id),isException=projectExceptions.has(id);
    return '<tr data-project-house="'+id+'"><td>'+esc(h.calle+' '+h.numero)+
     (h.nombre?' <span class="finance-rules-resident">'+esc(h.nombre)+'</span>':'')+'</td>'+
     '<td>'+esc(current?projectMoneyText(current.montoCentavos/100):'—')+'</td>'+
     '<td>'+(isException?
       '<label class="finance-project-exception-label">Importe fijo <input type="number" min="0" max="10000000" step="1" inputmode="numeric" aria-label="Cuota excepcional de '+esc(h.calle+' '+h.numero)+'" data-exception-amount="'+id+'" value="'+esc(projectExceptions.get(id))+'"></label>'+
       ' <button type="button" class="soft" data-exception-remove="'+id+'">Quitar</button>':
       '<button type="button" class="soft" data-exception-add="'+id+'"'+(!projectPreview||projectExceptions.size>=230?' disabled':'')+'>Generar excepción</button>')+
     '</td></tr>';
   }).join('')||'<tr><td colspan="3">No hay viviendas con ese filtro.</td></tr>';
  $('financeRulesStatus').textContent=error;
  const name=$('financeNewProjectName').value.trim(),month=$('financeNewProjectMonth').value;
  $('financeRulesApply').disabled=projectSaving||!projectPreview||houses.length!==231||
   name.length<8||name.length>300||!/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(month);
 }
 function closeProjectModal(){
  if(projectSaving)return;
  projectModal.hidden=true;
  projectPreviousFocus?.focus();projectPreviousFocus=null;
 }
 function openProjectModal(){
  if(projectHouses().length!==231){notice('No es posible crear el proyecto: el padrón no tiene exactamente 231 viviendas.');return;}
  projectPreviousFocus=document.activeElement;
  projectExceptions=new Map();projectSaving=false;projectPreview=null;
  $('financeNewProjectName').value='';
  $('financeRulesBudget').value='';
  $('financeNewProjectMonth').value=$('expenseDate').value.slice(0,7);
  $('financeRulesSearch').value='';
  $('financeRulesStatus').textContent='';
  projectModal.hidden=false;
  renderProjectModal();
  $('financeNewProjectName').focus();
 }
 $('financeNewProjectToggle').addEventListener('click',openProjectModal);
 $('financeRulesClose').addEventListener('click',closeProjectModal);
 $('financeRulesCancel').addEventListener('click',closeProjectModal);
 projectModal.addEventListener('click',e=>{if(e.target===projectModal)closeProjectModal();});
 document.addEventListener('keydown',e=>{
  if(projectModal.hidden||projectSaving)return;
  if(e.key==='Escape'){e.preventDefault();closeProjectModal();return;}
  if(e.key!=='Tab')return;
  const list=[...projectModal.querySelectorAll('button:not([disabled]),input:not([disabled])')]
   .filter(el=>el.getClientRects().length);
  if(!list.length)return;
  const first=list[0],last=list[list.length-1];
  if(!projectModal.contains(document.activeElement)||(e.shiftKey&&document.activeElement===first)){
   e.preventDefault();(e.shiftKey?last:first).focus();
  }else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
 });
 for(const field of ['financeNewProjectName','financeRulesBudget','financeNewProjectMonth','financeRulesSearch'])
  $(field).addEventListener('input',renderProjectModal);
 $('financeNewProjectMonth').addEventListener('change',renderProjectModal);
 $('financeRulesRows').addEventListener('click',e=>{
  if(projectSaving)return;
  const add=e.target.closest('[data-exception-add]');
  const remove=e.target.closest('[data-exception-remove]');
  if(add&&projectPreview){
   const casaId=Number(add.dataset.exceptionAdd);
   if(projectExceptions.size>=230)return;
   const amount=projectPreview.rows.find(row=>row.casaId===casaId)?.montoCentavos;
   if(!amount)return;
   projectExceptions.set(casaId,(amount/100).toFixed(0));
   renderProjectModal();
   $('financeRulesRows').querySelector('[data-exception-amount="'+casaId+'"]')?.focus();
  }else if(remove){
   const casaId=Number(remove.dataset.exceptionRemove);
   projectExceptions.delete(casaId);
   renderProjectModal();
  }
 });
 $('financeRulesRows').addEventListener('input',e=>{
  const input=e.target.closest('[data-exception-amount]');
  if(!input||projectSaving)return;
  projectExceptions.set(Number(input.dataset.exceptionAmount),input.value);
  // Actualiza el resumen al escribir sin reconstruir el input ni perder el foco.
  let preview=null;
  try{preview=computeProjectPreview();$('financeRulesStatus').textContent='';}
  catch(err){$('financeRulesStatus').textContent=err.message;}
  projectPreview=preview;
  $('financeRulesSpecialCount').textContent=String(projectExceptions.size);
  $('financeRulesDiff').textContent=preview?fmt(0):'Pendiente';
  $('financeRulesBudgetDisplay').textContent=preview
   ?projectMoneyText(preview.totalCentavos/100):'Revisar importe';
  // Mostrar en vivo el nuevo reparto de las demás viviendas sin reemplazar
  // el input que se está editando (mantiene el foco y el valor 0).
  const amounts=new Map((preview?.rows||[]).map(h=>[h.casaId,h.montoCentavos]));
  $('financeRulesRows').querySelectorAll('tr[data-project-house]').forEach(row=>{
   const id=Number(row.dataset.projectHouse);
   const value=amounts.get(id);
   const cell=row.querySelector('td:nth-child(2)');
   if(cell)cell.textContent=value===undefined?'—':projectMoneyText(value/100);
  });
  const name=$('financeNewProjectName').value.trim(),month=$('financeNewProjectMonth').value;
  $('financeRulesApply').disabled=projectSaving||!preview||
   name.length<8||name.length>300||!/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(month);
 });
 $('financeRulesRows').addEventListener('change',e=>{
  if(e.target.closest('[data-exception-amount]'))renderProjectModal();
 });
 $('financeRulesApply').addEventListener('click',async()=>{
  if(projectSaving)return;
  renderProjectModal();
  const name=$('financeNewProjectName').value.trim(),month=$('financeNewProjectMonth').value;
  if(!projectPreview||projectHouses().length!==231||name.length<8||
     !/^20\d{2}-(?:0[1-9]|1[0-2])$/.test(month)){
   $('financeRulesStatus').textContent='Completa el nombre (mínimo 8 caracteres), el costo total, el mes y las excepciones válidas.';
   return;
  }
  const budget=projectPreview.totalCentavos/100,exceptions=[...projectExceptions].map(([casaId,monto])=>({casaId,monto:Number(monto)}));
  if(!confirm('¿Crear «'+name+'» por '+projectMoneyText(budget)+' para 231 viviendas con '+exceptions.length+
   ' excepciones? El saldo se reparte entre las demás casas. Esta acción generará los 231 cargos.'))return;
  projectSaving=true;renderProjectModal();
  $('financeRulesStatus').textContent='Guardando proyecto y cuotas de las 231 viviendas…';
  try{
   const result=await request('/proyectos-extraordinarios',{
    nombre:name,fechaInicio:month+'-01',montoTotal:budget,excepciones
   });
   activeProyectoId=result.data?.proyectos?.[0]?.id||null;
   projectSaving=false;closeProjectModal();
   const refreshed=await load();
   notice(refreshed?'Proyecto creado. Se guardaron 231 cuotas y las excepciones configuradas.':
    'El proyecto se guardó, pero la tabla no se pudo actualizar. Vuelve a consultar antes de intentar crearlo otra vez.','success');
  }catch(err){$('financeRulesStatus').textContent=err.message;notice(err.message);}
  finally{projectSaving=false;renderProjectModal();}
 });


 // Editor masivo original de cuotas por vivienda. Independiente del modal de presupuesto
 // para nuevos proyectos y del editor individual en el Historial de pagos.
 const bulkModal=$('financeProjectBulkModal');
 let bulkProjectId=null,bulkProjectName='',bulkExceptions=new Map(),bulkPaid=new Map(),
  bulkSaving=false,bulkPreviousFocus=null,bulkOpening=false,bulkOriginalSnapshot=null;
 const bulkHouses=()=>[...(data?.viviendasMantenimiento||[])].filter(h=>!h.esPrueba).sort((a,b)=>
  String(a.calle).localeCompare(String(b.calle),'es',{numeric:true})||
  String(a.numero).localeCompare(String(b.numero),'es',{numeric:true}));
 const bulkCents=value=>{
  const raw=String(value??'').trim(),number=Number(raw),centavos=Math.round(number*100);
  return raw!==''&&Number.isFinite(number)&&Number.isSafeInteger(centavos)&&
   number>=0&&number<=10000000&&Math.abs(number*100-centavos)<0.001
   ?centavos:null;
 };
 const bulkBase=()=>bulkCents($('financeBulkBase').value);
 const bulkAmount=id=>bulkExceptions.has(Number(id))
  ?bulkCents(bulkExceptions.get(Number(id))):bulkBase();
 function bulkCompute(){
  const houses=bulkHouses(),base=bulkBase();
  if(houses.length!==231||base===null||bulkExceptions.size>231)return null;
  const allowed=new Set(houses.map(h=>Number(h.casaId)));
  let sum=0;
  for(const [id,raw] of bulkExceptions){
   if(!allowed.has(id)||bulkCents(raw)===null)return null;
  }
  for(const house of houses){
   const amount=bulkAmount(house.casaId);
   if(amount===null)return null;
   sum+=amount;
  }
  return {total:sum,base};
 }
 function bulkSummary(){
  const computed=bulkCompute(),houses=bulkHouses();
  $('financeBulkTotal').textContent=computed
   ?houses.length+' viviendas · '+bulkExceptions.size+' excepciones · Meta: '+fmt(computed.total/100)
   :houses.length+' viviendas · Revisa la cuota general y las excepciones antes de guardar.';
  $('financeBulkApply').disabled=bulkSaving||!computed;
  return computed;
 }
 function bulkRender(){
  const term=$('financeBulkSearch').value.trim().toLocaleLowerCase('es');
  const houses=bulkHouses();
  $('financeBulkRows').innerHTML=houses.filter(h=>
   (h.calle+' '+h.numero+' '+(h.nombre||'')).toLocaleLowerCase('es').includes(term))
   .map(h=>{
    const id=Number(h.casaId),special=bulkExceptions.has(id),amount=bulkAmount(id),
     paid=bulkPaid.get(id)||0;
    return '<tr'+(special?' class="has-exception"':'')+'><td>'+esc(h.calle+' '+h.numero)+'</td>'+
     '<td>'+(amount===null?'—':esc(fmt(amount/100)))+' <small>Abonado '+esc(fmt(paid/100))+'</small></td>'+
     '<td>'+(special
      ?'<input type="number" min="0" step="1" max="10000000" inputmode="numeric" data-bulk-amount="'+id+'" aria-label="Cuota excepcional de '+esc(h.calle+' '+h.numero)+'" value="'+esc(bulkExceptions.get(id))+'"> <button type="button" class="soft" data-bulk-remove="'+id+'">Quitar</button>'
      :'<button type="button" class="soft" data-bulk-add="'+id+'"'+(bulkBase()===null?' disabled':'')+'>Generar excepción</button>')+
     '</td></tr>';
   }).join('')||'<tr><td colspan="3">No hay viviendas que coincidan con la búsqueda.</td></tr>';
  bulkSummary();
 }
 function closeBulk(){
  if(bulkSaving||bulkOpening)return;
  bulkModal.hidden=true;
  bulkProjectId=null;bulkOriginalSnapshot=null;bulkPreviousFocus?.focus();bulkPreviousFocus=null;
 }
 async function openBulk(){
  if(bulkOpening||bulkSaving)return;
  if(activeConcept!=='EXTRAORDINARIO'||!activeProyectoId){notice('Selecciona un proyecto extraordinario.');return;}
  bulkOpening=true;
  const originalId=Number(activeProyectoId),button=$('financeProjectRulesEdit');
  bulkPreviousFocus=button;
  button.disabled=true;
  try{
   // La vista del historial individual y este editor parten de la MISMA lectura fresca.
   const updated=await load();
   if(!updated)throw Error('No se pudo consultar el estado actual de cuotas. Actualiza e inténtalo de nuevo.');
   if(Number(activeProyectoId)!==originalId||activeConcept!=='EXTRAORDINARIO')
    throw Error('El proyecto seleccionado cambió. Vuelve a abrir sus importes.');
   const project=(data?.proyectosExtraordinarios||[]).find(p=>Number(p.id)===originalId);
   const houses=bulkHouses(),cargos=project?.viviendasDetalle||[];
   if(!project||houses.length!==231||cargos.length!==231||
      new Set(cargos.map(c=>Number(c.casaId))).size!==231)
    throw Error('El proyecto y el padrón deben contener los mismos 231 cargos. No se cambiarán importes.');
   const amount=bulkCents(project.cuotaBase);
   if(amount===null)throw Error('La cuota general del proyecto no es válida. Revisa su configuración.');
   bulkExceptions=new Map();bulkPaid=new Map();
   for(const row of cargos){
    const id=Number(row.casaId),value=bulkCents(row.montoCuota),paid=Math.round(Number(row.montoPagado||0)*100);
    if(value===null||!Number.isSafeInteger(paid)||paid<0)
     throw Error('Los datos de cuota o aportaciones contienen un importe inválido.');
    bulkPaid.set(id,paid);
    if(value!==amount)bulkExceptions.set(id,(value/100).toFixed(0));
   }
   bulkProjectId=originalId;bulkProjectName=project.nombre;
   bulkOriginalSnapshot={cuotaBase:amount/100,
    cargos:cargos.map(c=>({casaId:Number(c.casaId),monto:Number(c.montoCuota)}))};
   $('financeBulkBase').value=(amount/100).toFixed(0);
   $('financeBulkSearch').value='';
   $('financeBulkTitle').textContent='Modificar metas de '+project.nombre;
   $('financeBulkStatus').textContent='';
   bulkModal.hidden=false;bulkRender();$('financeBulkClose').focus();
  }catch(e){notice(e.message);}
  finally{
   bulkOpening=false;
   button.disabled=!(data?.proyectosExtraordinarios||[]).some(p=>Number(p.id)===Number(activeProyectoId));
  }
 }
 $('financeProjectRulesEdit').addEventListener('click',()=>void openBulk());
 $('financeBulkClose').addEventListener('click',closeBulk);
 $('financeBulkCancel').addEventListener('click',closeBulk);
 bulkModal.addEventListener('click',e=>{if(e.target===bulkModal)closeBulk();});
 document.addEventListener('keydown',e=>{
  if(bulkModal.hidden||bulkSaving||bulkOpening)return;
  if(e.key==='Escape'){e.preventDefault();closeBulk();return;}
  if(e.key!=='Tab')return;
  const focusable=[...bulkModal.querySelectorAll('button:not([disabled]),input:not([disabled])')]
   .filter(el=>el.getClientRects().length&&el.offsetParent!==null);
  const first=focusable[0],last=focusable[focusable.length-1];
  if(!first)return;
  if(!bulkModal.contains(document.activeElement)||(e.shiftKey&&document.activeElement===first)){
   e.preventDefault();(e.shiftKey?last:first).focus();
  }else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
 });
 $('financeBulkSearch').addEventListener('input',bulkRender);
 $('financeBulkBase').addEventListener('input',bulkRender);
 $('financeBulkRows').addEventListener('click',e=>{
  if(bulkSaving)return;
  const add=e.target.closest('[data-bulk-add]'),remove=e.target.closest('[data-bulk-remove]');
  if(add){
   const id=Number(add.dataset.bulkAdd),base=bulkBase();
   if(base===null)return;
   bulkExceptions.set(id,(base/100).toFixed(0));
   bulkRender();
   $('financeBulkRows').querySelector('[data-bulk-amount="'+id+'"]')?.focus();
  }else if(remove){
   bulkExceptions.delete(Number(remove.dataset.bulkRemove));bulkRender();
  }
 });
 $('financeBulkRows').addEventListener('input',e=>{
  const input=e.target.closest('[data-bulk-amount]');
  if(!input||bulkSaving)return;
  bulkExceptions.set(Number(input.dataset.bulkAmount),input.value);
  const summary=bulkSummary(),id=Number(input.dataset.bulkAmount);
  const row=input.closest('tr');
  const amount=bulkAmount(id);
  const quota=row?.querySelector('td:nth-child(2)');
  if(quota)quota.innerHTML=(amount===null?'—':esc(fmt(amount/100)))+
   ' <small>Abonado '+esc(fmt((bulkPaid.get(id)||0)/100))+'</small>';
  if(summary)$('financeBulkStatus').textContent='';
 });
 $('financeBulkRows').addEventListener('change',e=>{
  const input=e.target.closest('[data-bulk-amount]');
  if(!input||bulkSaving)return;
  const amount=bulkCents(input.value);
  if(amount===null||!Number.isInteger(Number(input.value))){
   input.setCustomValidity('Ingresa un importe entre $0 y $10,000,000 en pesos enteros.');
   input.reportValidity();
   return;
  }
  input.setCustomValidity('');
  const id=Number(input.dataset.bulkAmount),base=bulkBase();
  if(amount===base)bulkExceptions.delete(id);
  else bulkExceptions.set(id,(amount/100).toFixed(0));
  bulkRender();
 });
 $('financeBulkApply').addEventListener('click',async()=>{
  if(bulkSaving||!bulkProjectId)return;
  const computed=bulkCompute();
  if(!computed){
   $('financeBulkStatus').textContent='Revisa la cuota general y los importes especiales.';
   return;
  }
  const houses=bulkHouses();
  for(const h of houses){
   const amount=bulkAmount(h.casaId),paid=bulkPaid.get(Number(h.casaId))||0;
   if(amount===null||amount<paid){
    $('financeBulkStatus').textContent='La cuota de '+h.calle+' '+h.numero+
     ' no puede ser menor a '+fmt(paid/100)+' ya aportados.';
    return;
   }
  }
  const projectId=bulkProjectId;
  if(!confirm('¿Guardar las cuotas de las 231 viviendas de «'+bulkProjectName+'»? La nueva meta será '+
   fmt(computed.total/100)+'. Los abonos anteriores y las modificaciones individuales se conservan con auditoría.'))return;
  bulkSaving=true;bulkSummary();$('financeBulkStatus').textContent='Guardando cuotas y actualizando la meta del proyecto…';
  try{
   const result=await request('/proyectos-extraordinarios/'+projectId+'/cuotas',{
    cuotaBase:computed.base/100,
    excepciones:[...bulkExceptions].map(([casaId,value])=>({casaId,monto:bulkCents(value)/100})),
    snapshot:bulkOriginalSnapshot
   },'PATCH');
   bulkSaving=false;closeBulk();
   const refreshed=await load();
   notice(refreshed?(result.message||'Cuotas del proyecto actualizadas')+' Meta: '+fmt(computed.total/100)+'.':
    'Se guardaron las cuotas pero no se pudo actualizar la pantalla. Recarga antes de intentar guardar de nuevo.','success');
  }catch(err){
   $('financeBulkStatus').textContent=err.message;
   notice(err.message);
  }finally{bulkSaving=false;bulkSummary();}
 });
 let returnState=null;
 try{
  if(new URLSearchParams(location.search).get('from')==='zkteco'){
   const value=JSON.parse(sessionStorage.getItem('mj_analisis_return_v1')||'null');
   if(value&&Date.now()-Number(value.at)<30*60*1000)returnState=value;
   sessionStorage.removeItem('mj_analisis_return_v1');
  }
 }catch(_){}
 if(returnState){
  $('financeYear').value=String(returnState.year||$('financeYear').value);
  $('financeMonth').value=String(returnState.month||$('financeMonth').value);
  if(['MANTENIMIENTO','EXTRAORDINARIO','CASA_CLUB'].includes(returnState.concept))
   activeConcept=returnState.concept;
  const pid=Number(returnState.projectId);
  activeProyectoId=Number.isSafeInteger(pid)&&pid>0?pid:null;
 }
 await load();
 if(returnState&&data){
  $('financeSearch').value=String(returnState.search||'').slice(0,160);
  $('financeStreet').value=String(returnState.street||'');
  $('financeStatus').value=String(returnState.status||'');
  $('financeRegistrationOrder').value=String(returnState.registration||'');
  $('financeLastPaidMonth').value=String(returnState.paidMonth||'');
  $('financeLastPaidYear').value=String(returnState.paidYear||$('financeLastPaidYear').value);
  if(returnState.sort&&['calle','numero','nombre','estatus','montoPagado','saldoPendiente','tags'].includes(returnState.sort.key))
   houseSort={key:returnState.sort.key,direction:returnState.sort.direction==='desc'?'desc':'asc'};
  selectedReceiptHouseId=Number(returnState.selectedHouse)||null;
  housePage=Math.max(1,Number(returnState.page)||1);
  renderHouses();
  notice('Se restauraron los filtros de Análisis de cuotas.','success');
 }
 // El contador consultado cada 20 s es memoria Node, NO una query SQL.
 // Respaldo cada 10 min si hay varias instancias en Hostinger.
 setInterval(()=>{void refreshWhenChanged();},20000);
 document.addEventListener('visibilitychange',()=>{
  if(document.visibilityState==='visible')void refreshWhenChanged();
 });
})();

