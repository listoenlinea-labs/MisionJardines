(function(root){
 'use strict';
 function render({data,scope,projectId,$,fmt,esc,bar}){
  const project=scope==='EXTRAORDINARIO'?
   (data.proyectosExtraordinarios||[]).find(p=>Number(p.id)===Number(projectId)):null;
  const club=scope==='CASA_CLUB',scopeName=project?'PROYECTO':club?'CASA CLUB':'MANTENIMIENTO';
  for(const id of ['financeIncomeCard','financeBalanceCard','financeExpenseCard'])
   $(id).querySelector('.eyebrow').textContent=scopeName;
  $('financeIncomeSubtitle').textContent=project?project.nombre:club?'Casa Club · Ingresos del período':'Mantenimiento · Ingresos por calle';
  $('financeExpenseSubtitle').textContent=project?project.nombre:club?'Casa Club · Gastos por concepto':'Mantenimiento · Gastos por concepto';
  $('financeIncomeSubtitle').title=$('financeExpenseSubtitle').title=project?project.nombre:scopeName;
  $('financeProjectExpenseEntry').hidden=!project;
  $('financeIncomeCard').querySelector('.finance-graph-help').hidden=!!project||club;
  $('financeExpenseCard').querySelector('.finance-graph-help').hidden=!!project||club;
  $('financeIncomeCard').querySelector('.finance-chart-description').textContent=project?
   'Aportaciones acumuladas de este proyecto distribuidas por calle.':club?
   'Cuotas de recuperación y limpieza; las garantías no son ingresos.':
   'Los pagos anticipados se distribuyen por mensualidad cubierta, con recargo real.';
  $('financeExpenseCard').querySelector('.finance-chart-description').textContent=project?
   'El costo total es presupuesto; los conceptos son egresos reales y no se suman dos veces.':
   'Solo gastos de '+(club?'Casa Club.':'mantenimiento.');
  $('financeWarning').textContent='';
  if(project){
   const houses=new Map((data.viviendasMantenimiento||[]).filter(h=>!h.esPrueba)
    .map(h=>[Number(h.casaId),String(h.calle||'Sin calle')]));
   const streets=new Map();
   for(const h of project.viviendasDetalle||[]){
    const street=houses.get(Number(h.casaId));
    if(!street)continue;
    streets.set(street,(streets.get(street)||0)+Number(h.montoPagado||0));
   }
   const ordered=[...streets].sort(([a],[b])=>a.localeCompare(b,'es-MX',{numeric:true}));
   const max=Math.max(1,...ordered.map(x=>x[1]));
   $('financeIncomeTotals').innerHTML='<span>Recaudado del proyecto: <b>'+esc(fmt(project.recaudado))+'</b></span>';
   $('financeCashChart').innerHTML=ordered.map(([name,value])=>bar(name,value,max,false,fmt(value))).join('');
   $('financeWarning').textContent='Solo aportaciones del proyecto seleccionado, sin cuotas de mantenimiento ni Casa Club.';
   const concepts=project.gastosConceptos||[],spent=Number(project.egresosReales||0);
   const maxExpense=Math.max(1,Number(project.totalEsperado||0),...concepts.map(x=>Number(x.monto||0)));
   $('financeExpenseTotals').innerHTML='<span>Presupuesto: <b>'+esc(fmt(project.totalEsperado))+
    '</b></span><span>Gastos reales: <b>'+esc(fmt(spent))+'</b></span>';
   $('financeExpenseChart').innerHTML='<div class="project-budget-bar">'+
    bar('Costo total presupuestado',Number(project.totalEsperado||0),maxExpense,true,fmt(project.totalEsperado))+'</div>'+
    concepts.map(e=>'<div class="project-expense-line">'+
     bar(e.concepto,Number(e.monto||0),maxExpense,true,fmt(e.monto))+
     (e.comprobanteDisponible?'<button type="button" class="soft" data-expense-proof="'+Number(e.id)+'">Ver comprobante</button>':'')+
     '</div>').join('');
  }else if(club){
   const info=data.finanzasAmbitos?.CASA_CLUB||{},expenses=(data.egresos||[]).filter(e=>e.ambito==='CASA_CLUB');
   const categories=new Map();
   for(const e of expenses)categories.set(String(e.categoria||'OTROS'),(categories.get(String(e.categoria||'OTROS'))||0)+Number(e.monto||0));
   const max=Math.max(1,...categories.values());
   $('financeIncomeTotals').innerHTML='<span>Ingresos Casa Club: <b>'+esc(fmt(info.ingresos))+'</b></span>';
   $('financeCashChart').innerHTML=bar('Recuperación y limpieza',Number(info.ingresos||0),Math.max(1,Number(info.ingresos||0)),false,fmt(info.ingresos));
   $('financeExpenseTotals').innerHTML='<span>Egresos Casa Club: <b>'+esc(fmt(info.egresos))+'</b></span>';
   $('financeExpenseChart').innerHTML=[...categories].map(([name,value])=>bar(name,value,max,true,fmt(value))).join('')||'<p class="hint">Sin gastos en Casa Club durante el período.</p>';
  }else{
   const income=data.ingresosMantenimientoCalles;
   if(income?.calles){
    const max=Math.max(1,...income.calles.map(c=>Number(c.mes||0)));
    $('financeIncomeTotals').innerHTML='<span>Cuotas pagadas de '+esc(data.periodo)+': <b>'+esc(fmt(income.mes))+'</b></span>';
    $('financeCashChart').innerHTML=income.calles.map(c=>
     '<button type="button" class="finance-income-select" data-income-street="'+esc(c.calle)+
     '" aria-controls="financeIncomeHistoryModal" aria-expanded="false" title="Ver historial de mantenimiento de '+esc(c.calle)+'">'+
     bar(c.calle,Number(c.mes||0),max,false,fmt(c.mes))+'</button>').join('');
    $('financeWarning').textContent=income.sinPeriodo?
     income.sinPeriodo+' movimiento(s) sin mensualidad asignada ('+fmt(income.montoSinPeriodo)+') requieren conciliación.':
     'Cada cuota se contabiliza en el mes cubierto, con recargos reales.';
   }else{
    $('financeIncomeTotals').textContent='Actualiza también la API para consultar ingresos.';
    $('financeCashChart').textContent='';
   }
   const out=data.egresosPorConcepto;
   if(out?.conceptos){
    const items=out.conceptos.filter(c=>!['PROYECTO','CUOTA_EXTRAORDINARIA'].includes(c.categoria));
    const max=Math.max(1,...items.map(c=>Number(c.mes||0)));
    $('financeExpenseTotals').innerHTML='<span>Egresos de mantenimiento de '+esc(data.periodo)+': <b>'+esc(fmt(out.mes))+'</b></span>';
    $('financeExpenseChart').innerHTML=items.map(c=>
     '<button type="button" class="finance-expense-select" data-expense-concept="'+esc(c.categoria)+
     '" aria-controls="financeExpenseHistory" aria-expanded="false" title="Ver historial de '+esc(c.concepto)+'">'+
     bar(c.concepto,Number(c.mes||0),max,true,fmt(c.mes))+'</button>').join('');
   }else{$('financeExpenseTotals').textContent='Actualiza también la API para consultar egresos.';$('financeExpenseChart').textContent='';}
  }
  const balance=project?root.MJFinanceBalance?.proyecto(project):
   club?root.MJFinanceBalance?.casaClub(data.finanzasAmbitos?.CASA_CLUB):
   scope==='MANTENIMIENTO'?root.MJFinanceBalance?.mensual(data):null;
  $('financeBalanceSubtitle').textContent=project?'Proyecto · Aportaciones menos gastos reales':
   club?'Casa Club · Ingresos menos egresos':'Mantenimiento · Ingresos menos egresos';
  $('financeBalanceExpenseLabel').textContent='Egresos';
  $('financeBalanceDescription').textContent=project?
   'Los egresos son únicamente conceptos registrados, no el presupuesto.':
   club?'Sin garantías ni pagos de otros ámbitos.':'Del mes seleccionado, sin gastos de proyectos ni Casa Club.';
  const card=$('financeBalanceCard');
  if(!balance){
   card.dataset.balanceState='';$('financeBalanceTotals').textContent='Sin datos suficientes.';
   $('financeBalanceIncome').textContent='—';$('financeBalanceExpense').textContent='—';
   $('financeBalanceDifference').textContent='—';$('financeBalanceStatus').textContent='Sin información';
   $('financeBalanceIncomeBar').style.width='0%';$('financeBalanceExpenseBar').style.width='0%';
   $('financeBalanceWarning').textContent='Actualiza el análisis para consultar los datos.';
   return;
  }
  const abs=Math.abs(balance.diferencia),label=balance.estado==='SALDO_A_FAVOR'?'Saldo a favor':
   balance.estado==='SALDO_EN_CONTRA'?'Saldo en contra':'En equilibrio';
  card.dataset.balanceState=balance.estado;
  $('financeBalanceTotals').textContent=project?'Proyecto: '+project.nombre:scopeName+' · '+data.periodo;
  $('financeBalanceIncome').textContent=fmt(balance.ingresos);
  $('financeBalanceExpense').textContent=fmt(balance.egresos);
  $('financeBalanceDifference').textContent=fmt(abs);
  $('financeBalanceStatus').textContent=label;
  const max=Math.max(1,balance.ingresos,balance.egresos);
  $('financeBalanceIncomeBar').style.width=Math.max(0,100*balance.ingresos/max)+'%';
  $('financeBalanceExpenseBar').style.width=Math.max(0,100*balance.egresos/max)+'%';
  $('financeBalanceWarning').textContent=balance.criterio;
  $('financeBalanceVisual').setAttribute('aria-label','Ingresos '+fmt(balance.ingresos)+
   ', egresos '+fmt(balance.egresos)+', '+label+' '+fmt(abs));
 }
 root.MJFinanceAmbitosUI={render};
})(typeof window==='undefined'?globalThis:window);
