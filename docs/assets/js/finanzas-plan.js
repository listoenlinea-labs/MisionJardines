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
 let period='',sourceMonth='',target=null,origin=null,version=0,assignments=[],allPlans=[],notes='',selectedSource=null,editorExpense=null,loading=false;
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
 function currentUsed(source){
  const all=allPlans.filter(x=>x.periodo!==period).flatMap(x=>x.asignaciones||[]).concat(assignments);
  return all.filter(x=>x.origen===source.origen&&x.origenPeriodo===source.origenPeriodo)
   .reduce((s,x)=>s+Number(x.monto||0),0);
 }
 function pools(){
  if(!origin||!target)return [];
  const items=[
   {origen:'MANTENIMIENTO',origenPeriodo:sourceMonth,tipo:'Mantenimiento',
    name:'Cuotas recibidas · '+labelMonth(sourceMonth),
    total:Number(origin.ingresosMantenimientoCalles?.recibidoMes||0)},
   {origen:'CASA_CLUB',origenPeriodo:sourceMonth,tipo:'Casa Club',
    name:'Cobros registrados · '+labelMonth(sourceMonth),
    total:Number(origin.finanzasAmbitos?.CASA_CLUB?.ingresos||0)}
  ];
  (target.proyectosExtraordinarios||[]).forEach(p=>items.push({
   origen:'PROYECTO:'+Number(p.id),origenPeriodo:'ACUMULADO',tipo:'Cuotas extraordinarias',
   name:p.nombre,total:Number(p.recaudado||0)}));
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
 function spend(id){return assignments.filter(x=>x.egresoId===id).reduce((s,x)=>s+Number(x.monto||0),0);}
 function render(){
  if(!target)return;
  const sources=pools(),rows=expenseRows();
  const order=$('fplanIncomeSort').value;
  sources.sort((a,b)=>order==='asc'?a.total-b.total:order==='name'?a.name.localeCompare(b.name,'es'):b.total-a.total);
  const grouped=['Mantenimiento','Cuotas extraordinarias','Casa Club'];
  panel.innerHTML=grouped.map(group=>{
   const groupRows=sources.filter(x=>x.tipo===group);
   return '<h4 class="fplan-source-label">'+esc(group)+'</h4>'+
    (groupRows.length?groupRows.map(x=>
     '<article class="fplan-bucket" draggable="true" tabindex="0" data-source="'+esc(x.id)+'" aria-label="Arrastra este dinero a un egreso">'+
     '<span class="fplan-number">'+money(x.free)+'</span><strong>'+esc(x.name)+'</strong>'+
     '<span>Fuente '+money(x.total)+' · Asignado '+money(x.used)+'</span>'+
     '<div><button type="button" data-pick="'+esc(x.id)+'">Usar esta fuente</button></div></article>').join(''):
    '<p class="fplan-empty">Sin fondos registrados</p>');
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
      attached.map(a=>'<span class="fplan-allocation">'+esc(a.origen.replace('PROYECTO:','Proyecto #'))+
       ' ('+esc(a.origenPeriodo)+') '+money(a.monto)+
       '<button type="button" data-remove="'+a.index+'" title="Quitar asignación" aria-label="Quitar asignación">×</button></span>').join('')+
      '<div><button type="button" data-choose="'+x.id+'">Asignar fondos</button></div></article>';
    }).join('');
  }).join('')||'<p class="fplan-empty">Sin egresos que coincidan con los filtros.</p>';
  const totalByGroup=grouped.map(group=>sources.filter(s=>s.tipo===group).reduce((t,s)=>t+s.free,0));
  const total=totalByGroup.reduce((s,n)=>s+n,0);
  const totalUnassigned=rows.reduce((n,e)=>n+Math.max(0,e.monto-spend(e.id)),0);
  const labels=['Mantenimiento','Cuotas extraordinarias','Casa Club'];
  $('fplanOverview').innerHTML=totalByGroup.map((n,i)=>'<div class="fplan-kpi"><small>Sin asignar · '+labels[i]+'</small><strong>'+money(n)+'</strong></div>').join('')+
   '<div class="fplan-kpi" data-tone="total"><small>Fondos no asignados en el plan (no bancario)</small><strong>'+money(total)+'</strong></div>';
  const pendientes=rows.filter(x=>!x.pagado).reduce((t,x)=>t+x.monto,0);
  $('fplanExpenseTotal').textContent='Egresos registrados '+money(rows.reduce((t,x)=>t+x.monto,0))+
   ' · Pendientes de pago '+money(pendientes)+' · Sin financiación asignada '+money(totalUnassigned);
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
  if(!engine?.recommend||!target||loading){
   msg('Primero carga la información financiera del mes.',true);return;
  }
  recommendation=engine.recommend({
   sources:pools(),expenses:expenseRows(),assignments,period,reservePercent:20
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
  selectedSource=pools().find(x=>x.id===id);
  msg(selectedSource?'Fuente seleccionada: '+selectedSource.name+'. Selecciona el egreso que deseas cubrir.':'Fuente no disponible',!selectedSource);
 }
 function chooseExpense(id){
  const row=expenseRows().find(x=>x.id===id);
  if(!row)return;
  const source=selectedSource||pools().find(x=>x.free>0);
  if(!source){msg('No hay dinero disponible en las fuentes visibles. Cambia el mes de origen.',true);return;}
  if(source.free<=0){msg('Esta fuente ya está totalmente asignada.',true);return;}
  const available=Math.min(source.free,Math.max(0,row.monto-spend(id)));
  if(available<=0){msg('Este gasto ya tiene asignada la totalidad de su importe.',true);return;}
  selectedSource=source;editorExpense=row;
  $('fplanAllocatorTitle').textContent='Asignar '+source.name+' a '+row.nombre;
  $('fplanAmount').max=String(Math.floor(available));$('fplanAmount').value=String(Math.floor(available));
  $('fplanAllocator').hidden=false;$('fplanAmount').focus();
 }
 async function loadSource(){
  hideRecommendation();
  const p=$('fplanSourceMonth').value;
  if(!validMonth(p)||p>period){msg('El origen debe ser el mes actual del plan o uno anterior.',true);return;}
  sourceMonth=p;origin=p===period?target:await getAnalysis(p);selectedSource=null;render();
 }
 async function load(){
  hideRecommendation();
  if(loading)return;loading=true;
  msg('Consultando ingresos, egresos y planes guardados...');
  try{
   const selected=$('fplanTargetMonth').value;
   if(!validMonth(selected))throw Error('Selecciona un mes válido');
   period=selected;$('fplanSourceMonth').max=period;
   if(!$('fplanSourceMonth').value||$('fplanSourceMonth').value>period)
    $('fplanSourceMonth').value=period;
   sourceMonth=$('fplanSourceMonth').value;
   const results=await Promise.all([getAnalysis(period),
    api('/plan-mensual?periodo='+encodeURIComponent(period))]);
   target=results[0];version=Number(results[1].version||0);
   assignments=(results[1].asignaciones||[]).map(x=>({...x}));
   allPlans=results[1].planes||[];notes=results[1].observaciones||'';
   $('fplanNotes').value=notes;
   origin=sourceMonth===period?target:await getAnalysis(sourceMonth);
   selectedSource=null;editorExpense=null;$('fplanAllocator').hidden=true;
   render();msg('Plan '+labelMonth(period)+' listo. Las asignaciones no realizan transferencias bancarias.');
  }catch(e){msg(e.message,true);}
  finally{loading=false;}
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
  $('fplanTargetMonth').value=current;$('fplanSourceMonth').value=current;dialog.showModal();
  void load();
 });
 $('fplanClose').addEventListener('click',()=>dialog.close());
 $('fplanTargetMonth').addEventListener('change',()=>void load());
 $('fplanSourceMonth').addEventListener('change',()=>void loadSource().catch(e=>msg(e.message,true)));
 $('fplanSearch').addEventListener('input',render);
 $('fplanIncomeSort').addEventListener('change',render);
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
  render();msg('Asignación añadida al borrador. Recuerda guardar el plan.');
 });
 $('fplanCancelAllocation').addEventListener('click',()=>{$('fplanAllocator').hidden=true;editorExpense=null;});
 $('fplanSave').addEventListener('click',async()=>{
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
