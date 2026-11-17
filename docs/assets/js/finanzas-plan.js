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
 let period='',sourceMonth='',target=null,origin=null,version=0,assignments=[],allPlans=[],notes='',selectedSource=null,editorExpense=null,loading=false,planReady=false,requestIndex=0,selectedExpenseId=null,excluded=[],agrupaciones=[],incomePage=1,expensePage=1;
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
  const source=selectedSource&&pools().find(x=>x.id===selectedSource.id);
  const expense=expenseRows().find(x=>x.id===selectedExpenseId);
  $('fplanAssignFooter').disabled=!planReady||loading||!source||source.free<=0||
   !expense||expense.monto<=spend(expense.id);
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
  for(const project of target.proyectosExtraordinarios||[]){
   if(!Number.isSafeInteger(Number(project.id))||Number(project.id)<1)continue;
   items.push({origen:'PROYECTO:'+Number(project.id),origenPeriodo:'ACUMULADO',
    tipo:'Cuotas extraordinarias',name:project.nombre,total:Number(project.recaudado||0)});
  }
  return items.map(p=>({...p,used:currentUsed(p),free:Math.max(0,p.total-currentUsed(p)),
   id:p.origen+'|'+p.origenPeriodo}));
 }
 const parentOf=id=>agrupaciones.find(g=>Number(g.hijoId)===Number(id))?.padreId||null;
 function expenseRows(includeExcluded=false){
  return (target?.egresos||[]).filter(e=>String(e.fecha||'').slice(0,7)===period&&
   Number(e.monto)>0&&!e.esAjusteMensual&&
   !['CUOTA_EXTRAORDINARIA','PROYECTOS'].includes(String(e.categoria))&&
   !(e.categoria==='PROYECTO'&&!Number(e.proyectoId))&&
   (includeExcluded||(!excluded.includes(Number(e.id))&&!parentOf(Number(e.id)))))
   .map(e=>({id:Number(e.id),monto:Number(e.monto),fecha:e.fecha,
    nombre:String(e.concepto||e.categoria||'Egreso'),categoria:e.categoria,
    grupo:e.ambito==='EXTRAORDINARIO'?'Cuotas extraordinarias':
     e.ambito==='CASA_CLUB'?'Casa Club':'Mantenimiento',
    pagado:e.pagado!==false,proyectoId:e.proyectoId,
    proyectoNombre:(target?.proyectosExtraordinarios||[]).find(p=>Number(p.id)===Number(e.proyectoId))?.nombre||
      (e.ambito==='EXTRAORDINARIO'?'Sin proyecto asociado':'')})); 
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
   panel.innerHTML='<p class="fplan-empty">No hay ingresos disponibles.</p>';
   expenses.innerHTML='<p class="fplan-empty">No hay egresos disponibles.</p>';
   $('fplanOverview').replaceChildren();return;
  }
  const grouped=['Mantenimiento','Cuotas extraordinarias','Casa Club'];
  const sources=pools(),rows=expenseRows(),allRows=expenseRows(true);
  const sort=$('fplanIncomeSort').value,searchIn=$('fplanIncomeSearch').value.trim().toLocaleLowerCase('es');
  sources.sort((a,b)=>sort==='asc'?a.total-b.total:sort==='name'?a.name.localeCompare(b.name,'es'):b.total-a.total);
  const visibleSources=grouped.flatMap(group=>sources.filter(x=>x.tipo===group))
   .filter(x=>(x.name+' '+x.tipo).toLocaleLowerCase('es').includes(searchIn));
  // Cada página tiene 10 espacios visuales en ambas tablas; los vacíos no son registros.
  const pageLimit=10;
  const emptyPageRows=(missing,message='',columns=3)=>Array.from({length:Math.max(0,missing)},(_,i)=>
   '<tr class="fplan-empty-row" aria-hidden="true"><td colspan="'+columns+'">'+
    (i===0&&message?esc(message):'&nbsp;')+'</td></tr>').join('');
  const inPages=Math.max(1,Math.ceil(visibleSources.length/pageLimit));
  incomePage=Math.max(1,Math.min(incomePage,inPages));
  const incomeRows=visibleSources.slice((incomePage-1)*pageLimit,incomePage*pageLimit);
  panel.innerHTML='<table class="fplan-data-table"><thead><tr><th>Ingreso / proyecto</th><th>Disponible</th><th>Asignado</th></tr></thead><tbody>'+
   (incomeRows.map(x=>'<tr data-source="'+esc(x.id)+'" tabindex="0" role="button" aria-selected="'+(selectedSource?.id===x.id)+'"'+
     (selectedSource?.id===x.id?' class="is-selected"':'')+'><td><strong>'+esc(x.name)+
     '</strong><small>'+esc(x.tipo)+(x.sinConciliar?' · histórico sin conciliación':'')+'</small></td>'+
     '<td class="fplan-number-cell">'+money(x.free)+'</td><td>'+money(x.used)+
     '<small>Recibido: '+money(x.total)+'</small></td></tr>').join('')+
    emptyPageRows(pageLimit-incomeRows.length,incomeRows.length?'':'No hay ingresos con ese filtro.'))+'</tbody></table>';
  $('fplanIncomePagination').textContent='Página '+incomePage+' de '+inPages+' · '+visibleSources.length+' fuentes';
  $('fplanIncomePrev').disabled=incomePage===1;$('fplanIncomeNext').disabled=incomePage===inPages;
  const searchOut=$('fplanSearch').value.trim().toLocaleLowerCase('es'),outSort=$('fplanExpenseSort').value;
  const scope=$('fplanExpenseScope').value||'TODOS';
  let visibleExpenses=allRows.filter(x=>scope==='TODOS'||
    (scope==='MANTENIMIENTO'&&x.grupo==='Mantenimiento')||
    (scope==='PROYECTOS'&&x.grupo==='Cuotas extraordinarias')||
    (scope==='CASA_CLUB'&&x.grupo==='Casa Club'))
   .filter(x=>(x.nombre+' '+x.categoria+' '+x.grupo+' '+x.proyectoNombre).toLocaleLowerCase('es').includes(searchOut))
   .filter(x=>!$('fplanOnlyUnassigned').checked||
      (!excluded.includes(x.id)&&!parentOf(x.id)&&x.monto>spend(x.id)));
  visibleExpenses.sort((a,b)=>outSort==='asc'?a.monto-b.monto:outSort==='name'?a.nombre.localeCompare(b.nombre,'es'):b.monto-a.monto);
  visibleExpenses=grouped.flatMap(group=>visibleExpenses.filter(x=>x.grupo===group));
  // Todos: igualar el NÚMERO REAL de filas de la página de ingresos (máx. 10).
  // Ámbito seleccionado: mostrar todos sus movimientos en una sola hoja.
  const expenseLimit=scope==='TODOS'?Math.max(1,incomeRows.length):Math.max(1,visibleExpenses.length);
  const outPages=scope==='TODOS'?Math.max(1,Math.ceil(visibleExpenses.length/expenseLimit)):1;
  expensePage=Math.max(1,Math.min(expensePage,outPages));
  const expenseRowsPage=visibleExpenses.slice((expensePage-1)*expenseLimit,expensePage*expenseLimit);
  $('fplanExpensePrev').parentElement.hidden=scope!=='TODOS';
  expenses.innerHTML='<table class="fplan-data-table"><thead><tr><th>Egreso / proyecto</th><th>Importe</th><th>Sin asignar</th><th>Acciones</th></tr></thead><tbody>'+
   (expenseRowsPage.map(x=>{
    const includedIn=parentOf(x.id);
    const parent=allRows.find(e=>e.id===includedIn);
    const removed=excluded.includes(x.id),remaining=includedIn?0:Math.max(0,x.monto-spend(x.id));
    const attached=assignments.map((a,i)=>({...a,index:i})).filter(a=>a.egresoId===x.id);
    return '<tr data-expense="'+x.id+'" draggable="'+(!removed&&!includedIn)+'" tabindex="0" role="button" aria-selected="'+(selectedExpenseId===x.id&&!removed&&!includedIn)+'"'+
     (removed||includedIn?' class="is-excluded"':selectedExpenseId===x.id?' class="is-selected"':'')+'><td><strong>'+esc(x.nombre)+
     '</strong><small>'+esc(x.proyectoNombre||x.grupo)+' · '+esc(x.fecha)+' · '+(x.pagado?'Pagado':'Pendiente')+
     (includedIn?' · Incluido en: '+esc(parent?.nombre||'#'+includedIn)+' · No suma por separado':' · Arrastra sobre otro egreso para agrupar')+
     '</small></td><td class="fplan-number-cell">'+money(x.monto)+'</td>'+
     '<td class="fplan-remaining-cell"><span class="fplan-remaining-amount">'+
     (removed?'Excluido del plan':includedIn?'Incluido':money(remaining))+'</span>'+
     (removed?'':attached.map(a=>'<span class="fplan-allocation"><b>Desde: </b>'+esc(labelSource(a))+
       ' · '+money(a.monto)+'<button type="button" data-remove="'+a.index+'" title="Quitar asignación" aria-label="Quitar asignación">×</button></span>').join(''))+
     '</td><td class="fplan-actions-cell">'+
     (includedIn
       ?'<button type="button" class="fplan-ungroup-button" data-ungroup="'+x.id+'" aria-label="Separar egreso del gasto principal">Separar</button>'
       :'<button type="button" class="fplan-exclude-button" data-exclude="'+x.id+'" aria-label="'+
        (removed?'Restaurar egreso en el plan':'Borrar egreso del plan')+'">'+
        (removed?'Restaurar':'Borrar')+'</button>')+'</td></tr>';
   }).join('')+
   emptyPageRows((scope==='TODOS'?incomeRows.length:0)-expenseRowsPage.length,expenseRowsPage.length?'':'No hay egresos con ese filtro.',4))+'</tbody></table>';
  $('fplanExpensePagination').textContent=scope==='TODOS'
   ?'Página '+expensePage+' de '+outPages+' · '+visibleExpenses.length+' egresos · '+expenseLimit+' por página'
   :visibleExpenses.length+' egresos de '+$('fplanExpenseScope').selectedOptions[0].text+' · sin paginación';
  $('fplanExpensePrev').disabled=expensePage===1;$('fplanExpenseNext').disabled=expensePage===outPages;
  const groupsTotal=grouped.map(group=>sources.filter(x=>x.tipo===group).reduce((sum,x)=>sum+x.free,0));
  const total=groupsTotal.reduce((sum,x)=>sum+x,0);
  $('fplanOverview').innerHTML=groupsTotal.map((n,i)=>'<div class="fplan-kpi"><small>'+
   (planReady?'Sin asignar':'Ingresos reportados')+' · '+esc(grouped[i])+
   '</small><strong>'+money(n)+'</strong></div>').join('')+
   '<div class="fplan-kpi" data-tone="total"><small>Total aún sin asignar</small><strong>'+money(total)+'</strong></div>';
  const remaining=rows.reduce((sum,x)=>sum+Math.max(0,x.monto-spend(x.id)),0);
  const pending=rows.filter(x=>!x.pagado).reduce((sum,x)=>sum+x.monto,0);
  $('fplanExpenseTotal').textContent='Egresos considerados '+money(rows.reduce((sum,x)=>sum+x.monto,0))+
   ' · Pendientes de pago '+money(pending)+' · Sin financiación '+money(remaining)+
   (excluded.length?' · Excluidos del plan: '+excluded.length:'')+
   (agrupaciones.length?' · Incluidos en otros gastos: '+agrupaciones.length:'');
  const historical=target.casaClubGoogle2026;
  $('fplanHistoric').textContent=historical?.disponible&&target.anio===2026
   ?'Casa Club Google 2026: '+money(historical.total)+' · '+historical.registros+
    ' cobros históricos. No equivalen a un saldo bancario conciliado.'
   :'Histórico de Casa Club pendiente de conciliación.';
  actionState();
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
  render();msg(selectedSource?'Origen elegido: '+selectedSource.name+'. Selecciona un egreso y pulsa Asignar.':'Fuente no disponible',!selectedSource);
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
  selectedSource=null;selectedExpenseId=null;editorExpense=null;excluded=[];agrupaciones=[];incomePage=1;expensePage=1;$('fplanAllocator').hidden=true;
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
   // Se incluyen todos los proyectos extraordinarios por separado.
   if(result[1].status==='fulfilled'){
    const plan=result[1].value;
    planReady=true;version=Number(plan.version||0);
    assignments=(plan.asignaciones||[]).map(x=>({...x}));
    excluded=(plan.excluidos||[]).map(Number);
    agrupaciones=(plan.agrupaciones||[]).map(x=>({hijoId:Number(x.hijoId),padreId:Number(x.padreId)}));
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
  sourceMonth=current;$('fplanTargetMonth').value=current;
  $('fplanExpenseScope').value='TODOS';
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
 $('fplanSearch').addEventListener('input',()=>{expensePage=1;render();});
 $('fplanIncomeSort').addEventListener('change',render);
 $('fplanIncomeSearch').addEventListener('input',()=>{incomePage=1;render();});
 $('fplanOnlyUnassigned').addEventListener('change',()=>{expensePage=1;render();});
 $('fplanExpenseScope').addEventListener('change',()=>{expensePage=1;render();});
 $('fplanIncomePrev').addEventListener('click',()=>{incomePage--;render();});
 $('fplanIncomeNext').addEventListener('click',()=>{incomePage++;render();});
 $('fplanExpensePrev').addEventListener('click',()=>{expensePage--;render();});
 $('fplanExpenseNext').addEventListener('click',()=>{expensePage++;render();});
 $('fplanAssignFooter').addEventListener('click',()=>{if(selectedExpenseId)chooseExpense(selectedExpenseId);});
 $('fplanExpenseSort').addEventListener('change',render);
 panel.addEventListener('click',e=>{const x=e.target.closest('[data-source]');if(x)chooseSource(x.dataset.source);});
 panel.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)&&e.target.matches('[data-source]')){e.preventDefault();chooseSource(e.target.dataset.source);}});
 panel.addEventListener('dragstart',e=>{const x=e.target.closest('[data-source]');
  if(x)e.dataTransfer.setData('text/plain',x.dataset.source);
 });
 expenses.addEventListener('dragstart',e=>{
  const row=e.target.closest('[data-expense]');
  if(!row||row.getAttribute('draggable')!=='true'){e.preventDefault();return;}
  // MIME específico: nunca confundir un gasto arrastrado con un ingreso.
  e.dataTransfer.setData('application/x-mj-egreso',row.dataset.expense);
  e.dataTransfer.effectAllowed='move';
 });
 expenses.addEventListener('dragover',e=>{
  const targetRow=e.target.closest('[data-expense]');if(!targetRow)return;
  e.preventDefault();
  e.dataTransfer.dropEffect='move';
 });
 expenses.addEventListener('drop',e=>{
  const row=e.target.closest('[data-expense]');if(!row)return;
  e.preventDefault();
  const expenseId=Number(row.dataset.expense);
  if(Array.from(e.dataTransfer.types||[]).includes('application/x-mj-egreso')){
   const childId=Number(e.dataTransfer.getData('application/x-mj-egreso'));
   const all=expenseRows(true);
   const child=all.find(x=>x.id===childId),parent=all.find(x=>x.id===expenseId);
   if(!child||!parent||childId===expenseId){msg('Arrastra un egreso distinto encima de su gasto principal.',true);return;}
   if(excluded.includes(childId)||excluded.includes(expenseId)||parentOf(childId)||parentOf(expenseId)||
     child.grupo!==parent.grupo||Number(child.proyectoId||0)!==Number(parent.proyectoId||0)){
    msg('Solo puedes agrupar egresos activos del mismo ámbito y proyecto, sin relaciones previas.',true);return;
   }
   const childrenTotal=agrupaciones.filter(x=>x.padreId===expenseId)
    .reduce((sum,g)=>sum+Number(all.find(x=>x.id===g.hijoId)?.monto||0),0);
   if(childrenTotal+child.monto>parent.monto){
    msg('Los gastos incluidos no pueden superar el importe del gasto principal.',true);return;
   }
   if(assignments.some(x=>x.egresoId===childId)){
    msg('Quita antes las asignaciones del gasto que deseas incluir en otro.',true);return;
   }
   if(!window.confirm('¿Confirmas que «'+child.nombre+'» YA ESTÁ incluido en el importe de «'+parent.nombre+
    '»? Se guardará la relación y no se sumará dos veces en este plan. El egreso original no se elimina.'))return;
   agrupaciones.push({hijoId:childId,padreId:expenseId});
   if(selectedExpenseId===childId)selectedExpenseId=null;
   hideRecommendation();render();msg('Relación agregada. Pulsa Guardar plan para conservarla.');
   return;
  }
  chooseSource(e.dataTransfer.getData('text/plain'));
  chooseExpense(expenseId);
 });
 expenses.addEventListener('click',e=>{
  const ungroup=e.target.closest('[data-ungroup]');
  if(ungroup){
   const childId=Number(ungroup.dataset.ungroup);
   agrupaciones=agrupaciones.filter(g=>g.hijoId!==childId);
   hideRecommendation();render();
   msg('Gasto separado. Volverá a sumarse por separado cuando guardes el plan.');
   return;
  }
  const remove=e.target.closest('[data-remove]');
  if(remove){hideRecommendation();assignments.splice(Number(remove.dataset.remove),1);render();msg('Asignación retirada del borrador. Guarda para conservar el cambio.');return;}
  const toggle=e.target.closest('[data-exclude]');
  if(toggle){
   const id=Number(toggle.dataset.exclude);
   if(agrupaciones.some(g=>g.padreId===id)){
    msg('Primero separa los conceptos incluidos en este gasto antes de excluirlo del plan.',true);return;
   }
   if(excluded.includes(id)){excluded=excluded.filter(x=>x!==id);msg('Gasto restaurado; pulsa Guardar plan.');}
   else{
    const row=expenseRows(true).find(x=>x.id===id);
    if(!row||!window.confirm('¿Borrar «'+row.nombre+'» del plan? Se excluirá del cálculo, pero el movimiento original y su comprobante se conservarán.'))return;
    assignments=assignments.filter(a=>a.egresoId!==id);excluded.push(id);
    if(selectedExpenseId===id)selectedExpenseId=null;
    msg('Egreso excluido del plan; pulsa Guardar plan.');
   }
   hideRecommendation();render();return;
  }
  const row=e.target.closest('[data-expense]');
  if(row&&!excluded.includes(Number(row.dataset.expense))&&!parentOf(Number(row.dataset.expense))){
   selectedExpenseId=Number(row.dataset.expense);render();
   msg('Egreso seleccionado. Elige un ingreso y pulsa Asignar en el footer.');
  }
 });
 expenses.addEventListener('keydown',e=>{
  if(['Enter',' '].includes(e.key)&&e.target.matches('[data-expense]')&&!excluded.includes(Number(e.target.dataset.expense))&&!parentOf(Number(e.target.dataset.expense))){
   e.preventDefault();selectedExpenseId=Number(e.target.dataset.expense);render();
  }
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
    periodo:period,version,asignaciones,excluidos,agrupaciones,
    observaciones:$('fplanNotes').value})});
   version=result.version;
   const fresh=await api('/plan-mensual?periodo='+encodeURIComponent(period));
   allPlans=fresh.planes||[];assignments=fresh.asignaciones||[];excluded=(fresh.excluidos||[]).map(Number);
   agrupaciones=(fresh.agrupaciones||[]).map(x=>({hijoId:Number(x.hijoId),padreId:Number(x.padreId)}));
   render();msg(result.message||'Plan guardado correctamente.');
  }catch(e){msg(e.message,true);}
  finally{btn.disabled=false;}
 });
})();
