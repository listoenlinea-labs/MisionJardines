(function(root){
 'use strict';
 // Separar los gastos informativos de limpieza de los egresos que reducen el balance.
 // Un gasto de limpieza registrado reemplaza parte de la provisión, sin duplicarla.
 function resumenEgresosCasaClub(rows,limpiezaPrevista){
  const actual=(Array.isArray(rows)?rows:[]).filter(e=>Number(e.monto)>0);
  const esLimpieza=e=>/LIMPIEZA|ASEO/.test(
   (String(e.concepto||'')+' '+String(e.categoria||''))
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase());
  const suma=items=>items.reduce((total,e)=>total+Number(e.monto||0),0);
  const registrado=suma(actual),limpiezaRegistrada=suma(actual.filter(esLimpieza));
  const otros=suma(actual.filter(e=>!esLimpieza(e)));
  const limpiezaPendiente=Math.max(0,Number(limpiezaPrevista||0)-limpiezaRegistrada);
  return {actual,registrado,limpiezaRegistrada,limpiezaPendiente,
   otros,total:registrado+limpiezaPendiente};
 }
 function render({data,scope,projectId,$,fmt,esc,bar}){
  const project=scope==='EXTRAORDINARIO'?
   (data.proyectosExtraordinarios||[]).find(p=>Number(p.id)===Number(projectId)):null;
  const club=scope==='CASA_CLUB',scopeName=scope==='EXTRAORDINARIO'?'PROYECTO':club?'CASA CLUB':'MANTENIMIENTO';
  // Los totales inferiores usan el mismo origen contable que las barras.
  let incomeFooter=null,expenseFooter=null;
  for(const id of ['financeIncomeCard','financeBalanceCard','financeExpenseCard'])
   $(id).querySelector('.eyebrow').textContent=scopeName;
  $('financeIncomeSubtitle').textContent=project?project.nombre:
   scope==='EXTRAORDINARIO'?'Selecciona un proyecto':club?'Casa Club · Recuperación histórica por calle (2026)':'Mantenimiento · Ingresos por calle';
  $('financeExpenseSubtitle').textContent=project?project.nombre:
   scope==='EXTRAORDINARIO'?'Selecciona un proyecto':club?'Casa Club · gastos registrados':'Mantenimiento · Gastos por concepto';
  $('financeIncomeSubtitle').title=$('financeExpenseSubtitle').title=project?project.nombre:scopeName;
  $('financeProjectExpenseEntry').hidden=!project;
  $('financeClubExpenseEntry').hidden=!club;
  $('financeIncomeCard').querySelector('.finance-graph-help').hidden=!!project||club;
  $('financeExpenseCard').querySelector('.finance-graph-help').hidden=!!project||club;
  $('financeIncomeCard').querySelector('.finance-chart-description').textContent=project?
   'Aportaciones acumuladas de este proyecto distribuidas por calle.':club?
   'Sólo la recuperación es ingreso; limpieza es costo y garantía es reembolsable.':
   'Los pagos anticipados se distribuyen por mensualidad cubierta, con recargo real.';
  $('financeExpenseCard').querySelector('.finance-chart-description').textContent=project?
   'La meta estimada es una referencia, no un egreso. Se muestran los conceptos realmente registrados.':
   'Solo gastos de '+(club?'Casa Club. La limpieza se muestra únicamente como referencia, sin sumarse al total de egresos ni descontarse de la diferencia central.':'mantenimiento.');
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
   $('financeCashChart').innerHTML=ordered.map(([name,value])=>bar(name,value,max,false,fmt(value))).join('');
   $('financeWarning').textContent='Solo aportaciones del proyecto seleccionado, sin cuotas de mantenimiento ni Casa Club.';
   incomeFooter=Number(project.recaudado||0);
   const concepts=project.gastosConceptos||[];
   const costos=root.MJCostosProyecto?.resumen(project);
   const spent=Number(costos?.gastosReales??project.egresosReales??0);
   expenseFooter=spent;
   const maxExpense=Math.max(1,Number(costos?.presupuesto??project.totalEsperado??0),...concepts.map(x=>Number(x.monto||0)));
   $('financeExpenseChart').innerHTML='<div class="project-budget-bar">'+
    '<button type="button" class="finance-budget-edit finance-project-breakdown-trigger" data-project-budget="'+Number(project.id)+'" aria-haspopup="dialog" aria-controls="financeProjectBreakdownModal" title="Ver desglose y editar importes">'+
    bar('Meta estimada',Number(costos?.presupuesto??project.totalEsperado??0),maxExpense,true,fmt(costos?.presupuesto??project.totalEsperado))+'</button>'+'</div>'+
    concepts.map(e=>'<div class="project-expense-line finance-project-expense-visual" data-project-expense-detail="'+Number(e.id)+'"'+
     ' tabindex="0" role="button" aria-haspopup="dialog" aria-controls="financeProjectProofModal"'+
     ' aria-label="Ver detalle y comprobante de '+esc(e.concepto)+'" title="Ver detalle y comprobante del concepto">'+
     '<div class="finance-project-concept-edit">'+
     bar(e.concepto+(e.pagado===false?' · Pendiente':' · Pagado'),Number(e.monto||0),maxExpense,true,fmt(e.monto))+'</div>'+
     '<span class="finance-project-proof-indicator" aria-hidden="true">'+(e.comprobanteDisponible?'Ver recibo':'Sin recibo')+'</span>'+
     '</div>').join('');
  }else if(scope==='EXTRAORDINARIO'){
   $('financeCashChart').textContent='Selecciona un proyecto para consultar sus aportaciones.';
   $('financeExpenseChart').textContent='Selecciona un proyecto para consultar sus gastos.';
  }else if(club){
   const info=data.finanzasAmbitos?.CASA_CLUB||{};
   const historical=data.casaClubGoogle2026||{};
   const historicalReady=Number(data.anio)===2026&&historical.disponible===true;
   const calles=historicalReady?(historical.porCalle||[]):[];
   const maxIncome=Math.max(1,...calles.map(x=>Number(x.monto||0)));
   $('financeCashChart').innerHTML=calles.length?
    calles.map(c=>bar(c.calle,Number(c.monto||0),maxIncome,false,fmt(c.monto))).join(''):
    '<p class="hint">No hay cobros históricos de Google Sheets para graficar.</p>';
   incomeFooter=historicalReady?Number(historical.total||0):null;
   $('financeWarning').textContent=historicalReady?
    'Recuperación anual 2026 por calle (columna F de Google Sheets). Se respetan montos históricos de $250, $700 y $1,000. No incluye depósitos de garantía ni limpieza; no se suma a MySQL.':
    'No se pudo consultar el histórico de Google Sheets; no se inventarán importes.';
   if(historicalReady){
    const expense=resumenEgresosCasaClub(data.egresosCasaClubAnuales,historical.limpiezaPrevista);
    const {actual,limpiezaPendiente}=expense;
    // La limpieza se grafica como información, pero no forma parte del total contable.
    expenseFooter=expense.otros;
    const highest=Math.max(1,limpiezaPendiente,...actual.map(e=>Number(e.monto||0)));
    $('financeExpenseChart').innerHTML=actual.map(e=>
     '<button type="button" class="finance-club-expense-row" data-club-expense-detail="'+Number(e.id)+'" aria-label="Ver detalle de '+esc(e.concepto)+'">'+
     bar(String(e.concepto||'Gasto'),Number(e.monto||0),highest,true,fmt(e.monto))+
     '<small>'+(Number(e.pagado)?'Pagado':'Pendiente')+(e.comprobanteDisponible?' · Con comprobante':' · Sin comprobante')+'</small></button>'
    ).join('')+
     (limpiezaPendiente>0?bar('Limpieza prevista sin registrar · informativa',limpiezaPendiente,highest,true,fmt(limpiezaPendiente)):'');
    if(!actual.length&&!limpiezaPendiente)$('financeExpenseChart').textContent='Sin gastos de Casa Club registrados.';
    window.MJClubAnnualExpense=expense;
   }else{
    expenseFooter=null;window.MJClubAnnualExpense=null;
    $('financeExpenseChart').textContent='No hay histórico conectado para estimar la limpieza anual.';
   }
  }else{
   const income=data.ingresosMantenimientoCalles;
   if(income?.calles){
    incomeFooter=Number(income.mes||0);
    const max=Math.max(1,...income.calles.map(c=>Number(c.mes||0)));
    $('financeCashChart').innerHTML=income.calles.map(c=>
     '<button type="button" class="finance-income-select" data-income-street="'+esc(c.calle)+
     '" aria-controls="financeIncomeHistoryModal" aria-expanded="false" title="Ver historial de mantenimiento de '+esc(c.calle)+'">'+
     bar(c.calle,Number(c.mes||0),max,false,fmt(c.mes))+'</button>').join('');
    $('financeWarning').textContent=income.sinPeriodo?
     income.sinPeriodo+' movimiento(s) sin mensualidad asignada ('+fmt(income.montoSinPeriodo)+') requieren conciliación.':
     'Cada cuota se contabiliza en el mes cubierto, con recargos reales.';
   }else{
    $('financeCashChart').textContent='No hay datos de ingresos disponibles para este período.';
   }
   const out=data.egresosPorConcepto;
   if(out?.conceptos){
    expenseFooter=Number(out.mes||0);
    const items=out.conceptos.filter(c=>!['PROYECTO','CUOTA_EXTRAORDINARIA'].includes(c.categoria));
    const max=Math.max(1,...items.map(c=>Number(c.mes||0)));
    $('financeExpenseChart').innerHTML=items.map(c=>
     '<button type="button" class="finance-expense-select" data-expense-concept="'+esc(c.categoria)+
     '" aria-controls="financeExpenseHistory" aria-expanded="false" title="Ver historial de '+esc(c.concepto)+'">'+
     bar(c.concepto,Number(c.mes||0),max,true,fmt(c.mes))+'</button>').join('');
   }else{$('financeExpenseChart').textContent='No hay datos de egresos disponibles para este período.';}
  }
  $('financeIncomeFooterTotal').textContent=incomeFooter===null?'—':fmt(incomeFooter);
  const incomeFooterLabel=$('financeIncomeFooter').querySelector('span');
  if(incomeFooterLabel)incomeFooterLabel.textContent=club?'Total recuperación histórica 2026':'Total de ingresos';
  $('financeExpenseFooterTotal').textContent=expenseFooter===null?'—':fmt(expenseFooter);
  $('financeExpenseFooter').querySelector('span').textContent=project?'Total de egresos reales':club?'Total de egresos sin limpieza':'Total de egresos';
  const summaryTrigger=$('financeExpenseFooter');
  summaryTrigger.tabIndex=project?0:-1;
  if(project){
   summaryTrigger.setAttribute('role','button');
   summaryTrigger.setAttribute('aria-haspopup','dialog');
   summaryTrigger.setAttribute('aria-controls','financeProjectBreakdownModal');
   summaryTrigger.title='Ver desglose del costo total y editar conceptos';
  }else{
   summaryTrigger.removeAttribute('role');
   summaryTrigger.removeAttribute('aria-haspopup');
   summaryTrigger.removeAttribute('aria-controls');
   summaryTrigger.removeAttribute('title');
  }
  const balanceExpense=$('financeBalanceExpense');
  balanceExpense.tabIndex=project?0:-1;
  if(project){
   balanceExpense.setAttribute('role','button');
   balanceExpense.setAttribute('aria-haspopup','dialog');
   balanceExpense.setAttribute('aria-controls','financeProjectBreakdownModal');
   balanceExpense.title='Ver desglose de egresos reales y pagos';
  }else{
   balanceExpense.removeAttribute('role');
   balanceExpense.removeAttribute('aria-haspopup');
   balanceExpense.removeAttribute('aria-controls');
   balanceExpense.removeAttribute('title');
  }

  $('financeProjectExpenseSummary').hidden=!project;
  if(project){
   const totals=root.MJCostosProyecto?.resumen(project);
   $('financeProjectExpenseSummary').textContent='Meta estimada: '+fmt(totals?.presupuesto??project.presupuestoBase)+
    ' · Egresos reales: '+fmt(totals?.gastosReales??project.egresosReales??0)+
    ' · Pagado: '+fmt(totals?.pagados??project.gastosPagados??0)+
    ' · Por pagar (conceptos): '+fmt(totals?.pendientes??project.gastosPendientes??0)+
    ' · Resta para meta: '+fmt(Math.max(0,Number(totals?.presupuesto??project.presupuestoBase??0)-Number(totals?.gastosReales??project.egresosReales??0)));
  }
  const clubHist=data.casaClubGoogle2026||{};
  const clubAnnual=club&&Number(data.anio)===2026&&clubHist.disponible===true;
  const balance=project?root.MJFinanceBalance?.proyecto(project):
   club?root.MJFinanceBalance?.casaClub(clubAnnual?
    {ingresos:clubHist.total,egresos:window.MJClubAnnualExpense?.otros??0,
     criterioHistorico:'Recuperación histórica de 2026 menos conceptos de egreso distintos de limpieza, pagados o pendientes. La limpieza registrada o prevista se muestra exclusivamente en Egresos y no se descuenta aquí; no equivale a saldo bancario.'}:null):
   scope==='MANTENIMIENTO'?root.MJFinanceBalance?.mensual(data):null;
  $('financeBalanceSubtitle').textContent=project?'Proyecto · Ingresos menos egresos reales':
   club?'Casa Club · Histórico 2026: recuperación menos otros gastos':'Mantenimiento · Ingresos menos egresos';
  $('financeBalanceExpenseLabel').textContent=club?'Egresos sin limpieza':'Egresos';
  $('financeBalanceDescription').textContent=project?
   'Los egresos son la suma de conceptos reales, estén pagados o pendientes. La meta estimada nunca se resta como gasto.':
   club?'Histórico anual 2026: únicamente conceptos de gasto ajenos a limpieza reducen esta diferencia. La limpieza prevista y registrada se presenta en la tarjeta de Egresos, sin afectar este saldo. No equivale a caja bancaria.':'Del mes seleccionado, sin gastos de proyectos ni Casa Club.';
  $('financeBalanceIncome').parentElement?.querySelector('span')?.replaceChildren(
   document.createTextNode('Ingresos'));
  const card=$('financeBalanceCard');
  if(!balance){
   $('financeBalanceIncome').textContent='—';$('financeBalanceExpense').textContent='—';
   $('financeBalanceDifference').textContent='—';$('financeBalanceStatus').textContent='Sin información';
   $('financeBalanceIncomeBar').style.width='0%';$('financeBalanceExpenseBar').style.width='0%';
   $('financeBalanceWarning').textContent='Actualiza el análisis para consultar los datos.';
   return;
  }
  const abs=Math.abs(balance.diferencia),label=balance.estado==='SALDO_A_FAVOR'?'Saldo a favor':
   balance.estado==='SALDO_EN_CONTRA'?'Saldo en contra':'En equilibrio';
  card.dataset.balanceState=balance.estado;
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
 const api={render,resumenEgresosCasaClub};
 if(typeof module==='object'&&module.exports)module.exports=api;
 else root.MJFinanceAmbitosUI=api;
})(typeof window==='undefined'?globalThis:window);
