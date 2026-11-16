(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const dialog=$('fplanDialog'),open=$('financePlanOpen');
 if(!dialog||!open)return;
 const base=(window.MJ_API_URL||'https://api-misionjardines.listoenlinea.host/api')+'/finanzas';
 const esc=x=>String(x??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const money=x=>Number(x||0).toLocaleString('es-MX',{style:'currency',currency:'MXN',maximumFractionDigits:0,minimumFractionDigits:0});
 const months=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
 const labelMonth=p=>months[Number(p.slice(5))-1]+' '+p.slice(0,4);
 const validMonth=p=>/^20\d\d-(0[1-9]|1[0-2])$/.test(p);
 let period='',sourceMonth='',target=null,origin=null,version=0,assignments=[],allPlans=[],notes='',selectedSource=null,editorExpense=null,loading=false,planReady=false,requestIndex=0,projectFilterId='';
 const panel=$('fplanSources'),expenses=$('fplanExpenses'),notice=$('fplanStatus');
 function msg(text,error=false){notice.textContent=text;notice.dataset.error=error?'true':'false';}
 async function api(path,options={}){
  const token=localStorage.getItem('misionJardinesToken')||sessionStorage.getItem('misionJardinesToken');
  if(!token)throw Error('Inicia sesión como administrador para consultar el plan.');
  const res=await fetch(base+path,{...options,headers:{Authorization:'Bearer '+token,
   ...(options.body?{'Content-Type':'application/json'}:{})}});
  const payload=await res.json().catch(()=>({}));
  if(!res.ok||payload.ok===false)throw Error(payload.message||'Error del servidor ('+res.status+')');
  return payload;
 }
 async function getAnalysis(p){
  const [y,m]=p.split('-');const r=await api('/analisis?anio='+y+'&mes='+Number(m));
  return r.data;
 }
 function monthStep(p,delta){
  const [year,month]=String(p||'').split('-').map(Number);
  if(!Number.isInteger(year)||!Number.isInteger(month)||month<1||month>12)return '2026-11';
  const d=new Date(Date.UTC(year,month-1+delta,1));
  return d.toISOString().slice(0,7);
 }
 function sourceMonthOptions(preferred){
  const sel=$('fplanSourceMonth'),values=[];
  for(let p=period,count=0;validMonth(p)&&p>='2026-01'&&count<60;count++,p=monthStep(p,-1))values.push(p);
  sel.replaceChildren(...values.map(p=>{
   const o=document.createElement('option');o.value=p;o.textContent=labelMonth(p);return o;
  }));
  sourceMonth=values.includes(preferred)?preferred:period;
  sel.value=sourceMonth;
 }
 function loadAlert(title,message){
  $('fplanLoadTitle').textContent=title;
  $('fplanLoadMessage').textContent=message;
  $('fplanLoadNotice').hidden=false;
 }
 function clearAlert(){$('fplanLoadNotice').hidden=true;}
 function actionState(){
  $('fplanSave').disabled=!planReady||loading;
  $('fplanRecommend').disabled=!planReady||loading||!target;
 }
 function currentUsed(source){
  const all=allPlans.filter(x=>x.periodo!==period).flatMap(x=>x.asignaciones||[]).concat(assignments);
  return all.filter(x=>x.origen===source.origen&&
   (source.origen==='CASA_CLUB'&&source.origenPeriodo==='ACUMULADO'||x.origenPeriodo===source.origenPeriodo))
   .reduce((s,x)=>s+Number(x.monto||0),0);
 }
 function pools(){
  if(!origin||!target)return [];
  const historical=origin.casaClubGoogle2026;
  const annualClub=Number(origin.anio)===2026&&historical?.disponible===true;
  const items=[
   {origen:'MANTENIMIENTO',origenPeriodo:sourceMonth,tipo:'Mantenimiento',
    name:'Cuotas cubiertas del mes · '+labelMonth(sourceMonth),
    total:Number(origin.ingresosMantenimientoCalles?.mes||0)},
   {origen:'CASA_CLUB',origenPeriodo:annualClub?'ACUMULADO':sourceMonth,tipo:'Casa Club',
    name:annualClub?'Recuperación histórica 2026 · Google (sin conciliar)':'Recuperación registrada · '+labelMonth(sourceMonth),
    total:annualClub?Number(historical.total||0):Number(origin.finanzasAmbitos?.CASA_CLUB?.ingresos||0),
    sinConciliar:annualClub}
  ];
  const selected=(target.proyectosExtraordinarios||[]).find(p=>String(p.id)===String(projectFilterId));
  if(selected)items.push({
   origen:'PROYECTO:'+Number(selected.id),origenPeriodo:'ACUMULADO',tipo:'Cuotas extraordinarias',
   name:selected.nombre,total:Number(selected.recaudado||0)});
  return items.map(p=>({...p,used:currentUsed(p),free:Math.max(0,p.total-currentUsed(p)),
   id:p.origen+'|'+p.origenPeriodo}));
 }
 function expenseRows(){
  return (target?.egresos||[]).filter(e=>String(e.fecha||'').slice(0,7)===period&&
   Number(e.monto)>0&&!e.esAjusteMensual&&
   !(e.categoria==='CUOTA_EXTRAORDINARIA'||e.categoria==='PROYECTOS'))
   .map(e=>({id:Number(e.id),monto:Number(e.monto),fecha:e.fecha,
    nombre:String(e.concepto||e.categoria||'Egreso'),categoria:e.categoria,
    grupo:e.ambito==='EXTRAORDINARIO'?'Cuotas extraordinarias':
     e.ambito==='CASA_CLUB'?'Casa Club':'Mantenimiento',
    pagado:e.pagado!==false,proyectoId:e.proyectoId})); 
 }
 function labelSource(a){
  if(a.origen==='MANTENIMIENTO')return 'Mantenimiento · '+labelMonth(a.origenPeriodo);
  if(a.origen==='CASA_CLUB')return a.origenPeriodo==='ACUMULADO'?'Casa Club · recuperación histórica 2026':'Casa Club · '+labelMonth(a.origenPeriodo);
  if(a.origen.startsWith('PROYECTO:')){
   const project=(target?.proyectosExtraordinarios||[]).find(p=>String(p.id)===a.origen.slice(9));
   return 'Proyecto · '+(project?.nombre||'#'+a.origen.slice(9));
  }
  return a.origen+' · '+a.origenPeriodo;
 }
 function spend(id){return assignments.filter(x=>x.egresoId===id).reduce((s,x)=>s+Number(x.monto||0),0);}
 function render(){
  if(!target){
   panel.innerHTML='<p class="fplan-empty">No hay ingresos disponibles para mostrar.</p>';
   expenses.innerHTML='<p class="fplan-empty">No se pudieron cargar los egresos.</p>';
   $('fplanOverview').replaceChildren();
   return;
  }
  const sources=pools(),rows=expenseRows();
  const selectedProject=(target.proyectosExtraordinarios||[]).find(p=>String(p.id)===String(projectFilterId));
  $('fplanProjectFilter').title=selectedProject?'Proyecto seleccionado: '+selectedProject.nombre:'Selecciona un proyecto';
  const order=$('fplanIncomeSort').value;
  sources.sort((a,b)=>order==='asc'?a.total-b.total:order==='name'?a.name.localeCompare(b.name,'es'):b.total-a.total);
  const grouped=['Mantenimiento','Cuotas extraordinarias','Casa Club'];
  panel.innerHTML=grouped.map(group=>{
   const groupRows=sources.filter(x=>x.tipo===group);
   return '<h4 class="fplan-source-label">'+esc(group)+'</h4>'+
    (groupRows.length?groupRows.map(x=>
     '<article class="fplan-bucket" draggable="true" tabindex="0" data-source="'+esc(x.id)+'" aria-label="Arrastra este dinero a un egreso">'+
     '<span class="fplan-number">'+money(x.free)+'</span><strong>'+esc(x.name)+'</strong>'+
     '<span>Fuente '+money(x.total)+' · '+(planReady?'Asignado '+money(x.used):'Asignaciones por verificar')+'</span>'+
     '<div><button type="button" data-pick="'+esc(x.id)+'"'+(planReady?'':' disabled')+'>Asignar fondos</button></div></article>').join(''):
    '<p class="fplan-empty">Sin fondos registrados en este origen.</p>');
  }).join('');
  const query=$('fplanSearch').value.trim().toLocaleLowerCase('es');
  let visible=rows.filter(x=>(x.nombre+' '+x.categoria+' '+x.grupo).toLocaleLowerCase('es').includes(query));
  const sort=$('fplanExpenseSort').value;
  visible.sort((a,b)=>sort==='asc'?a.monto-b.monto:sort==='name'?a.nombre.localeCompare(b.nombre,'es'):b.monto-a.monto);
  expenses.innerHTML=grouped.map(group=>{
   const subset=visible.filter(x=>x.grupo===group);
   if(!subset.length)return '';
   return '<h4 class="fplan-source-label">'+esc(group)+'</h4>'+
    subset.map(x=>{
     const attached=assignments.map((a,i)=>({...a,index:i})).filter(a=>a.egresoId===x.id);
     const remaining=Math.max(0,x.monto-spend(x.id));
     return '<article class="fplan-expense" data-expense="'+x.id+'" tabindex="0">'+
      '<span class="fplan-number">'+money(x.monto)+'</span>'+
      '<strong>'+esc(x.nombre)+'</strong>'+
      '<div class="fplan-expense-meta">'+esc(x.fecha)+' · '+esc(x.categoria)+' · '+
      (x.pagado?'Registrado como pagado':'Pendiente de pagar')+
      ' · Sin fuente asignada: <b>'+money(remaining)+'</b></div>'+
      attached.map(a=>'<span class="fplan-allocation"><b>Desde: </b>'+esc(labelSource(a))+
       ' · '+money(a.monto)+
       '<button type="button" data-remove="'+a.index+'" title="Quitar asignación" aria-label="Quitar asignación">×</button></span>').join('')+
      '<div><button type="button" data-choose="'+x.id+'"'+(planReady?'':' disabled')+'>Asignar fondos</button></div></article>';
    }).join('');
  }).join('')||'<p class="fplan-empty">No hay egresos registrados para este mes o filtro.</p>';
  const totalByGroup=grouped.map(group=>sources.filter(s=>s.tipo===group).reduce((t,s)=>t+s.free,0));
  const total=totalByGroup.reduce((s,n)=>s+n,0);
  const totalUnassigned=rows.reduce((n,e)=>n+Math.max(0,e.monto-spend(e.id)),0);
  const labels=['Mantenimiento','Cuotas extraordinarias','Casa Club'];
  $('fplanOverview').innerHTML=totalByGroup.map((n,i)=>'<div class="fplan-kpi"><small>'+(planReady?'Sin asignar':'Ingresos reportados')+' · '+labels[i]+'</small><strong>'+money(n)+'</strong></div>').join('')+
   '<div class="fplan-kpi" data-tone="total"><small>'+(planReady?'Total aún sin asignar':'Ingresos reportados (no conciliados)')+'</small><strong>'+money(total)+'</strong></div>';
  const pendientes=rows.filter(x=>!x.pagado).reduce((t,x)=>t+x.monto,0);
  $('fplanExpenseTotal').textContent='Egresos registrados '+money(rows.reduce((t,x)=>t+x.monto,0))+
   ' · Pendientes de pago '+money(pendientes)+(planReady?' · Sin financiación asignada '+money(totalUnassigned):' · Asignaciones por verificar');
  const historical=target.casaClubGoogle2026;
  $('fplanHistoric').textContent=historical?.disponible&&target.anio===2026
   ?'Casa Club histórico 2026 (Google): '+money(historical.total)+' · '+historical.registros+
    ' cobros registrados. Se consulta por separado: no se suma a los fondos disponibles hasta conciliarlo con MySQL y el banco.'
   :'Casa Club Google: histórico no disponible para conciliación. Solo se distribuyen importes presentes en MySQL.';
 }
 // El recomendador solo propone en memoria; cada decisión es trazable y editable.
 let recommendation=null;
 const recommendationPanel=$('fplanRecommendation');
 function hideRecommendation(){
  recommendation=null;recommendationPanel.hidden=true;
  $('fplanRecommendationApply').disabled=true;
 }
 function showRecommendation(){
  const engine=window.MJFinanceRecommendation;
  if(!engine?.recommend||!target||loading||!planReady){
   msg('Primero carga la información financiera del mes.',true);return;
  }
  recommendation=engine.recommend({
   sources:pools().filter(x=>!x.sinConciliar),expenses:expenseRows(),assignments,period,reservePercent:20
  });
  const {details,uncovered,summary}=recommendation;
  const kpi=(label,value,warn=false)=>'<div class="fplan-recommend-metric"'+(warn?' data-warn="true"':'')+
   '><span>'+esc(label)+'</span><strong>'+money(value)+'</strong></div>';
  $('fplanRecommendationSummary').innerHTML=
   '<div class="fplan-recommend-metrics">'+
    kpi('Se propone asignar',summary.totalProposed)+
    kpi('Apoyo temporal entre ámbitos',summary.crossArea,summary.crossArea>0)+
    kpi('Gastos todavía sin cobertura',summary.uncoveredExpenses,summary.uncoveredExpenses>0)+
   '</div>'+
   '<p class="fplan-help"><b>Regla de priorización:</b> '+esc(summary.priority)+'</p>'+
   '<p class="fplan-recommend-caution"><b>Limitaciones:</b> '+esc(summary.disclaimer)+
   ' No usa los $25,550 históricos de Google sin conciliación; tampoco considera depósitos de garantía reembolsables. '+
   'Los gastos no tienen fechas exactas de vencimiento en este plan, así que no se inventa esa prioridad.</p>';
  const reasons='<h4 class="fplan-recommend-section-title">Justificación de cada asignación ('+details.length+')</h4>'+
   (details.length?details.map((a,i)=>
    '<article class="fplan-reason"'+(a.temporary?' data-temporary="true"':'')+'>'+
    '<strong>'+(i+1)+'. '+esc(a.expense)+'</strong> · <span class="fplan-reason-amount">'+money(a.amount)+'</span>'+
    '<p><b>Dinero de:</b> '+esc(a.source)+'</p><p><b>¿Por qué?</b> '+esc(a.reason)+'</p>'+
    '<p>Queda en esa fuente: <b>'+money(a.sourceRemaining)+'</b> · Sin cubrir del gasto: <b>'+money(a.expenseRemaining)+'</b></p>'+
    (a.temporary?'<p><b>Advertencia:</b> préstamo interno propuesto; requiere que el administrador revise la reposición y la liquidez real.</p>':'')+
    '</article>').join(''):
    '<p class="fplan-empty">No se encontró una asignación adicional segura con los fondos de este mes de origen.</p>');
  const missing=uncovered.length?'<h4 class="fplan-recommend-section-title">¿Qué queda sin cubrir?</h4>'+
   uncovered.map(a=>'<article class="fplan-reason" data-uncovered="true"><strong>'+esc(a.expense)+
    '</strong> · '+money(a.amount)+'<p>'+esc(a.reason)+'</p></article>').join(''):'';
  $('fplanRecommendationReasons').innerHTML=reasons+missing;
  $('fplanRecommendationApply').disabled=!recommendation.proposed.length;
  recommendationPanel.hidden=false;
  recommendationPanel.scrollIntoView({behavior:'smooth',block:'nearest'});
  msg('Recomendación calculada. Revisa cada motivo antes de aplicarla al borrador.');
 }
 function chooseSource(id){
  if(!planReady){msg('El plan está en modo consulta. Reintenta la carga para asignar dinero.',true);return;}
  selectedSource=pools().find(x=>x.id===id);
  msg(selectedSource?'Fuente seleccionada: '+selectedSource.name+'. Selecciona el egreso que deseas cubrir.':'Fuente no disponible',!selectedSource);
 }
 function chooseExpense(id){
  if(!planReady){msg('El plan está en modo consulta. Reintenta la carga para asignar dinero.',true);return;}
  const row=expenseRows().find(x=>x.id===id);
  if(!row)return;
  const source=selectedSource;
  if(!source){msg('Elige primero una fuente concreta en «Origen del dinero». Nunca seleccionaremos una fuente automáticamente.',true);panel.querySelector('[data-source]')?.focus();return;}
  if(source.free<=0){msg('Esta fuente ya está totalmente asignada.',true);return;}
  const available=Math.min(source.free,Math.max(0,row.monto-spend(id)));
  if(available<=0){msg('Este gasto ya tiene asignada la totalidad de su importe.',true);return;}
  selectedSource=source;editorExpense=row;
  $('fplanAllocatorTitle').textContent='Asignar fondos a '+row.nombre;
  $('fplanSourceDetail').innerHTML='<p><b>Origen exacto:</b> '+esc(source.name)+'</p>'+
   '<p><b>Ámbito:</b> '+esc(source.tipo)+' · <b>Periodo de origen:</b> '+
   esc(source.origenPeriodo==='ACUMULADO'?'Acumulado del proyecto o 2026 de Casa Club':labelMonth(source.origenPeriodo))+'</p>'+
   '<p><b>Registrado:</b> '+money(source.total)+' · <b>Ya asignado:</b> '+money(source.used)+
   ' · <b>Disponible para planificar:</b> '+money(source.free)+'</p>'+
   '<p class="fplan-unverified-note">Esta es una asignación presupuestaria interna. No confirma saldo de banco ni ejecuta una transferencia.</p>';
  $('fplanAmount').max=String(Math.floor(available));$('fplanAmount').value=String(Math.floor(available));
  $('fplanAllocator').hidden=false;$('fplanAmount').focus();
 }
 async function loadSource(){
  const requested=$('fplanSourceMonth').value;
  if(!validMonth(requested)||requested>period){msg('Selecciona un mes de origen válido, igual o anterior al plan.',true);return;}
  const previous=sourceMonth;
  hideRecommendation();selectedSource=null;
  try{
   const nextOrigin=requested===period?target:await getAnalysis(requested);
   sourceMonth=requested;origin=nextOrigin;render();
   msg('Origen actualizado: '+labelMonth(sourceMonth)+'. Puedes combinarlo con los gastos del plan '+labelMonth(period)+'.');
  }catch(e){
   $('fplanSourceMonth').value=previous;
   msg('No fue posible leer los fondos de '+labelMonth(requested)+': '+e.message,true);
  }
 }
 async function load(){
  const myRequest=++requestIndex;
  loading=true;planReady=false;hideRecommendation();actionState();clearAlert();
  selectedSource=null;editorExpense=null;$('fplanAllocator').hidden=true;
  const chosen=$('fplanTargetMonth').value;
  if(!validMonth(chosen)){msg('Selecciona un periodo válido.',true);loading=false;actionState();return;}
  period=chosen;
  $('fplanPeriodText').textContent=labelMonth(period);
  const lastSource=sourceMonth||period;
  sourceMonthOptions(lastSource>period?period:lastSource);
  target=null;origin=null;assignments=[];allPlans=[];notes='';version=0;
  panel.innerHTML='<p class="fplan-empty">Consultando fuentes de ingresos…</p>';
  expenses.innerHTML='<p class="fplan-empty">Consultando egresos por concepto…</p>';
  $('fplanOverview').replaceChildren();
  msg('Cargando información del plan y movimientos…');
  try{
   // La consulta contable no depende de que la tabla de planes esté creada.
   const result=await Promise.allSettled([
    getAnalysis(period),api('/plan-mensual?periodo='+encodeURIComponent(period))
   ]);
   if(myRequest!==requestIndex)return;
   if(result[0].status!=='fulfilled'){
    loadAlert('No se pudo consultar el análisis de cuotas',String(result[0].reason?.message||'Error del servidor'));
    msg('No hay movimientos disponibles para el mes solicitado.',true);
    render();return;
   }
   target=result[0].value;
   const options=(target.proyectosExtraordinarios||[]);
   if(!options.some(x=>String(x.id)===String(projectFilterId))){
    const preferred=window.MJFinanceSelectedProject?.();
    projectFilterId=String(options.find(x=>Number(x.id)===Number(preferred))?.id||options[0]?.id||'');
   }
   $('fplanProjectFilter').replaceChildren(...options.map(p=>{
    const option=document.createElement('option');option.value=String(p.id);
    option.textContent=p.nombre+' · '+money(p.recaudado);return option;
   }));
   $('fplanProjectFilter').value=projectFilterId;
   if(result[1].status==='fulfilled'){
    const plan=result[1].value;
    planReady=true;version=Number(plan.version||0);
    assignments=(plan.asignaciones||[]).map(x=>({...x}));
    allPlans=plan.planes||[];notes=plan.observaciones||'';
    $('fplanNotes').value=notes;
   }else{
    planReady=false;
    $('fplanNotes').value='';
    loadAlert('Los movimientos están disponibles, pero no el plan guardado',
     'No se pudieron consultar las asignaciones existentes. '+String(result[1].reason?.message||'')+
     ' Reinicia el backend actualizado para crear las tablas automáticamente; si faltan permisos de MySQL, ejecuta la migración SQL incluida en el repositorio.');
   }
   try{origin=sourceMonth===period?target:await getAnalysis(sourceMonth);}
   catch(e){
    if(myRequest!==requestIndex)return;
    origin=target;sourceMonthOptions(period);
    msg('No se encontró el mes de origen solicitado; se muestran los datos del mes del plan.',true);
   }
   if(myRequest!==requestIndex)return;
   render();
   if(planReady)msg('Plan de '+labelMonth(period)+' cargado. Selecciona una fuente y después el egreso.');
   else msg('Vista de consulta: los movimientos se muestran, pero asignar y guardar requiere conexión con el plan.',true);
  }catch(e){
   if(myRequest===requestIndex){loadAlert('Error al cargar el plan',e.message);msg('Revisa la conexión con el servidor.',true);}
  }finally{
   if(myRequest===requestIndex){loading=false;actionState();}
  }
 }
 $('fplanRecommend').addEventListener('click',showRecommendation);
 $('fplanRecommendationClose').addEventListener('click',hideRecommendation);
 $('fplanRecommendationDiscard').addEventListener('click',()=>{hideRecommendation();msg('Propuesta descartada. Tu borrador no cambió.');});
 $('fplanRecommendationApply').addEventListener('click',()=>{
  if(!recommendation?.proposed.length)return;
  // La aplicación NO guarda: el servidor revisará el borrador cuando se pulse Guardar.
  assignments.push(...recommendation.proposed.map(item=>({...item})));
  const total=recommendation.summary.totalProposed;
  hideRecommendation();render();
  msg('Se agregaron '+money(total)+' al borrador. Revisa la tabla y pulsa Guardar plan del mes si estás de acuerdo.');
 });
 open.addEventListener('click',()=>{
  const year=Number($('financeYear')?.value),month=Number($('financeMonth')?.value);
  const current=year>=2020&&month>=1&&month<=12?year+'-'+String(month).padStart(2,'0'):
   new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit'}).format(new Date());
  projectFilterId=String(window.MJFinanceSelectedProject?.()||'');
  sourceMonth=current;$('fplanTargetMonth').value=current;
  dialog.showModal();$('fplanContent').scrollTop=0;void load();
 });
 $('fplanPrevMonth').addEventListener('click',()=>{
  const next=monthStep($('fplanTargetMonth').value,-1);
  if(next<'2026-01')return;
  $('fplanTargetMonth').value=next;sourceMonth=next;void load();
 });
 $('fplanNextMonth').addEventListener('click',()=>{
  const next=monthStep($('fplanTargetMonth').value,1);
  if(next>'2100-12')return;
  $('fplanTargetMonth').value=next;sourceMonth=next;void load();
 });
 $('fplanReload').addEventListener('click',()=>void load());
 $('fplanClose').addEventListener('click',()=>dialog.close());
 $('fplanTargetMonth').addEventListener('change',()=>void load());
 $('fplanSourceMonth').addEventListener('change',()=>void loadSource().catch(e=>msg(e.message,true)));
 $('fplanSearch').addEventListener('input',render);
 $('fplanIncomeSort').addEventListener('change',render);
 $('fplanProjectFilter').addEventListener('change',()=>{projectFilterId=$('fplanProjectFilter').value;selectedSource=null;render();msg('Proyecto seleccionado como origen: '+$('fplanProjectFilter').selectedOptions[0]?.textContent);});
 $('fplanExpenseSort').addEventListener('change',render);
 panel.addEventListener('click',e=>{const x=e.target.closest('[data-pick]');
  if(x)chooseSource(x.dataset.pick);
 });
 panel.addEventListener('dragstart',e=>{const x=e.target.closest('[data-source]');
  if(x)e.dataTransfer.setData('text/plain',x.dataset.source);
 });
 expenses.addEventListener('dragover',e=>{if(e.target.closest('[data-expense]'))e.preventDefault();});
 expenses.addEventListener('drop',e=>{
  const x=e.target.closest('[data-expense]');if(!x)return;
  e.preventDefault();chooseSource(e.dataTransfer.getData('text/plain'));
  chooseExpense(Number(x.dataset.expense));
 });
 expenses.addEventListener('click',e=>{
  const remove=e.target.closest('[data-remove]');
  if(remove){hideRecommendation();assignments.splice(Number(remove.dataset.remove),1);render();msg('Asignación retirada del borrador. Guarda para conservar el cambio.');return;}
  const row=e.target.closest('[data-choose]');if(row)chooseExpense(Number(row.dataset.choose));
 });
 $('fplanApply').addEventListener('click',()=>{
  if(!selectedSource||!editorExpense)return;
  const amount=Number($('fplanAmount').value);
  const available=Math.min(pools().find(x=>x.id===selectedSource.id)?.free||0,
   Math.max(0,editorExpense.monto-spend(editorExpense.id)));
  if(!Number.isSafeInteger(amount)||amount<=0||amount>available){msg('Indica un importe entero mayor a cero, sin exceder el dinero disponible.',true);return;}
  hideRecommendation();
  assignments.push({egresoId:editorExpense.id,origen:selectedSource.origen,
   origenPeriodo:selectedSource.origenPeriodo,monto:amount});
  $('fplanAllocator').hidden=true;editorExpense=null;
  const from=selectedSource.name;render();msg('Asignación de '+money(amount)+' desde «'+from+'» añadida al borrador. Revisa y guarda el plan.');
 });
 $('fplanCancelAllocation').addEventListener('click',()=>{$('fplanAllocator').hidden=true;editorExpense=null;});
 $('fplanSave').addEventListener('click',async()=>{
  if(!planReady){msg('Primero debes cargar el plan y sus asignaciones actuales.',true);return;}
  const btn=$('fplanSave');btn.disabled=true;msg('Guardando y validando fondos en el servidor...');
  try{
   const result=await api('/plan-mensual',{method:'PUT',body:JSON.stringify({
    periodo:period,version,asignaciones,observaciones:$('fplanNotes').value})});
   version=result.version;
   const fresh=await api('/plan-mensual?periodo='+encodeURIComponent(period));
   allPlans=fresh.planes||[];assignments=fresh.asignaciones||[];
   render();msg(result.message||'Plan guardado correctamente.');
  }catch(e){msg(e.message,true);}
  finally{btn.disabled=false;}
 });
})();
