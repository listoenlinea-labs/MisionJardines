(async()=>{
 if(!await window.MJAccessReady)return;
 const $=id=>document.getElementById(id);
 const API=window.MJ_API_URL||'https://api-misionjardines.listoenlinea.host/api';
 const token=localStorage.getItem('misionJardinesToken')||sessionStorage.getItem('misionJardinesToken');
 const fmt=n=>Number(n||0).toLocaleString('es-MX',{style:'currency',currency:'MXN'});
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
 function syncExtraExpense(){
  const extra=$('expenseCategory').value==='CUOTA_EXTRAORDINARIA';
  document.querySelectorAll('.extra-expense-option').forEach(e=>e.hidden=!extra);
  $('expenseMonths').required=extra;$('expenseStart').required=extra;
 }
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
 const expenseDateInputs=['expenseDate','expenseFilterFrom','expenseFilterTo'].map($);
 expenseDateInputs.forEach(input=>{
  input.addEventListener('input',()=>syncExpenseDateDisplay(input));
  input.addEventListener('change',()=>syncExpenseDateDisplay(input));
  syncExpenseDateDisplay(input);
 });
 let data=null;
 let housePage=1;
 let activeConcept='MANTENIMIENTO';
 const HOUSE_PAGE_SIZE=12;
 const notice=(msg,kind='error')=>{const el=$('financeNotice');el.textContent=msg;el.hidden=false;el.dataset.kind=kind;};
 async function request(path,body){
  const response=await fetch(API+'/finanzas'+path,{method:body?'POST':'GET',
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
 function financialCard(label,value){return '<div class="metric"><small>'+esc(label)+'</small><strong>'+esc(value)+'</strong></div>';}
 function render(){
  if(!data)return;
  const houses=data.casas||0;
  const financialCards=[
   ['Casas en padrón',houses],['Con pago registrado',data.pagadas+' · '+data.porcentaje+'%'],
   ['Sin pago completo',data.pendientes+' · '+(houses>0?Math.round(Number(data.pendientes||0)*100/houses):0)+'%'],[data.esCargaHistorica?'Cuotas históricas registradas':'Ingresos bancarios validados',fmt(data.ingresosParaBalance)],
   ['Mantenimiento bancario validado',fmt(data.ingresosReportados.mantenimiento)],
   ['Extraordinarios validados',fmt(data.ingresosReportados.extraordinarios)],
   ['Ingreso sin recibo y otros',fmt(data.ingresosAdicionales)],['Saldo administración anterior',fmt(data.saldoInicial)],
   ['Egresos registrados',fmt(data.totalEgresos)],['Saldo disponible',fmt(data.balanceReportado)],
   ['Casa Club · recuperación',fmt(data.casaClub?.recuperacion)],
   ['Casa Club · limpieza',fmt(data.casaClub?.limpieza)],
   ['Garantías recibidas',fmt(data.casaClub?.garantiasRecibidas)],
   ['Garantías devueltas',fmt(data.casaClub?.garantiasDevueltas)]
  ];
  $('financialSummary').innerHTML=financialCards.slice(0,4).map(([n,v])=>financialCard(n,v)).join('');
  $('financialSecondary').innerHTML=financialCards.slice(4).map(([n,v])=>financialCard(n,v)).join('');
  $('financeDonut').style.setProperty('--percent',data.porcentaje+'%');
  $('financeDonutText').innerHTML=esc(data.porcentaje)+'%<small>Casas pagadas</small>';
  $('financeLegend').innerHTML='<div>Pagadas <b>'+data.pagadas+'</b></div><div>Pendientes <b>'+data.pendientes+'</b></div><div>Total <b>'+houses+'</b></div>';
  $('financeStreetChart').innerHTML=data.calles.length?data.calles.map(c=>bar(c.calle,c.porcentaje,100,false,c.pagadas+'/'+c.total)).join(''):'Sin datos';
  const padronNote=$('financePadronNote');
  if(padronNote){padronNote.textContent=data.avisoPadron||'';padronNote.hidden=!data.avisoPadron;}
  const cash=data.esCargaHistorica ? [['Mantenimiento histórico',data.ingresosHistoricos],['Ingresos adicionales',data.ingresosAdicionales],['Saldo inicial',data.saldoInicial],['Egresos',data.totalEgresos]] : [['Mantenimiento validado',data.ingresosReportados.mantenimiento],['Extraordinarios validados',data.ingresosReportados.extraordinarios],['Ingresos adicionales',data.ingresosAdicionales],['Saldo inicial',data.saldoInicial],['Egresos',data.totalEgresos]];
  // Solo cobros recibidos (bancarios validados + manuales), no reservas aprobadas sin pagar.
  cash.splice(cash.length-1,0,['Casa club cobrado',Number(data.ingresosReportados.casaClub||0)+Number(data.manualesCasaClub||0)]);
  const max=Math.max(1,...cash.map(x=>x[1]));
  $('financeCashChart').innerHTML=cash.map(([n,v],i)=>'<div class="money-row"><strong>'+esc(n)+'</strong><div class="track"><div class="fill '+(n==='Egresos'?'cost':'')+'" style="width:'+(v/max*100).toFixed(2)+'%"></div></div><strong>'+esc(fmt(v))+'</strong></div>').join('')+
    '<div class="hint">Abonos anotados en tabla de cuotas (sin duplicar en ingresos): <b>'+fmt(data.cobrosCuotasRegistrados)+'</b></div>';
  $('financeWarning').textContent=data.avisoConciliacion;
  const cat=Object.entries(data.egresosCategorias);
  const maxCategory=Math.max(1,...cat.map(([,v])=>v));
  $('financeExpenseChart').innerHTML=cat.map(([n,v])=>bar(n,v,maxCategory,true,fmt(v))).join('');
  renderExpenses();
  const select=$('financeStreet'),selected=select.value;
  select.innerHTML='<option value="">Todas las calles</option>'+[...data.calles].sort((a,b)=>a.calle.localeCompare(b.calle,'es-MX',{numeric:true,sensitivity:'base'})).map(c=>'<option value="'+esc(c.calle)+'">'+esc(c.calle)+'</option>').join('');
  select.value=data.calles.some(x=>x.calle===selected)?selected:'';
  actualizarAniosUltimoPago();
  renderHouses();
 }
 function renderExpenses(){
  if(!data)return;
  // Los egresos y totales provienen del mes/año seleccionado. Filtros de
  // consulta: no alteran ni los datos guardados ni los indicadores contables.
  const egresos=Array.isArray(data.egresos)?data.egresos:[];
  const normalize=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const concept=normalize($('expenseFilterConcept').value.trim());
  const category=$('expenseFilterCategory').value;
  const from=$('expenseFilterFrom').value,to=$('expenseFilterTo').value;
  const order=$('expenseSort').value;
  const result=egresos.filter(e=>(!concept||normalize(e.concepto).includes(concept))
    &&(!category||e.categoria===category)
    &&(!from||String(e.fecha)>=from)
    &&(!to||String(e.fecha)<=to));
  result.sort((a,b)=>{
    let cmp=0;
    if(order==='monto_asc')cmp=Number(a.monto)-Number(b.monto);
    else if(order==='monto_desc')cmp=Number(b.monto)-Number(a.monto);
    else if(order==='categoria_asc')cmp=String(a.categoria).localeCompare(String(b.categoria),'es-MX');
    else if(order==='categoria_desc')cmp=String(b.categoria).localeCompare(String(a.categoria),'es-MX');
    else if(order==='fecha_asc')cmp=String(a.fecha).localeCompare(String(b.fecha));
    else cmp=String(b.fecha).localeCompare(String(a.fecha));
    return cmp||String(b.fecha).localeCompare(String(a.fecha))||Number(b.id)-Number(a.id);
  });
  $('expenseResultCount').textContent='Mostrando '+result.length+' de '+egresos.length+' egresos del período seleccionado';
  const expenseCell=(label,value)=>'<td data-label="'+label+'"><span class="expense-field-value">'+value+'</span></td>';
  $('financeExpenseRows').innerHTML=result.length?result.map(e=>'<tr>'+
    expenseCell('Fecha',esc(e.fecha))+expenseCell('Categoría',esc(e.categoria==='CUOTA_EXTRAORDINARIA'||e.categoria==='PROYECTOS'?'CUOTA EXTRAORDINARIA':e.categoria))+
    expenseCell('Concepto',esc(e.concepto))+expenseCell('Referencia',esc(e.referencia||'—'))+
    expenseCell('Monto',esc(fmt(e.monto)))+expenseCell('Cobro',e.categoria==='CUOTA_EXTRAORDINARIA'||e.categoria==='PROYECTOS'?(e.tieneCuota?'<span class="status-paid">Programado</span>':'<button type="button" class="soft" data-extra-expense="'+Number(e.id)+'">Configurar cobro</button>'):'—')+'</tr>').join(''):
    '<tr><td colspan="6">'+(egresos.length?'No hay egresos que coincidan con los filtros.':'No hay egresos registrados para este mes.')+'</td></tr>';
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
 function houseMatchesStatus(h,status){
   if(!status)return true;
   if(status==='ADVERTENCIAS')return Boolean(tagMismatch(h,tagsView(h)));
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
     const diferente=Boolean(fisica&&guardada&&fisica!==guardada);
     const vigencias='<div class="tags-dates"><strong'+(fisica?'':' class="tags-date-unverified"')+'>'+
       (fisica?'C3: '+esc(displayDate(fisica)):'C3: sin fecha física confirmada')+'</strong>'+
       '<small>MySQL: '+esc(displayDate(guardada))+'</small>'+
       (diferente?'<span class="tags-date-mismatch" role="note">Fechas distintas. Verifica la sincronización en ZKTeco; no se cambió ninguna vigencia.</span>':'')+'</div>';
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
     if(!response.ok||!json.ok)throw Error(json.message||'No fue posible verificar el C3');
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
   const params=new URLSearchParams({casaId:String(h.casaId),calle:h.calle,numero:String(h.numero)});
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
function elegirConcepto(concepto){
  if(!data)return;
  const registros=data.viviendasConceptos?.[concepto];
  if(concepto!=='MANTENIMIENTO'&&!Array.isArray(registros)){
    notice('El servidor todavía no ofrece el análisis de '+(concepto==='CASA_CLUB'?'Casa club':'Cuotas extraordinarias')+'. Despliega también el backend para consultar saldos reales.');
    return;
  }
  const financial=new Map((registros||[]).map(h=>[String(h.casaId),h]));
  if(concepto!=='MANTENIMIENTO'&&data.viviendasMantenimiento.some(h=>!financial.has(String(h.casaId)))){
    notice('Faltan movimientos por vivienda en la respuesta del servidor. No se mostrarán importes incompletos.');
    return;
  }
  activeConcept=concepto;
  data.viviendas=data.viviendasMantenimiento.map(h=>concepto==='MANTENIMIENTO'?h:{...h,...financial.get(String(h.casaId))});
  document.querySelectorAll('[data-finance-concept]').forEach(tab=>{
    const selected=tab.dataset.financeConcept===concepto;
    tab.classList.toggle('active',selected);
    tab.setAttribute('aria-selected',String(selected));
    tab.tabIndex=selected?0:-1;
    if(selected)$('financeHousePanel').setAttribute('aria-labelledby',tab.id);
  });
  const warning=$('financeStatus').querySelector('option[value="ADVERTENCIAS"]');
  if(warning)warning.disabled=concepto!=='MANTENIMIENTO';
  if(concepto!=='MANTENIMIENTO'&&$('financeStatus').value==='ADVERTENCIAS')$('financeStatus').value='';
  $('financeConceptHint').textContent={
    MANTENIMIENTO:'Mantenimiento: pagos mensuales, recargos y saldos acumulados hasta el período seleccionado.',
    EXTRAORDINARIO:'Cuotas extraordinarias: solo proyectos con mensualidades configuradas. Los egresos sin repartir todavía no generan deuda.',
    CASA_CLUB:'Casa club: solo reservas aprobadas. El saldo vence en la fecha límite de pago, no en la fecha del evento.'
  }[concepto];
  housePage=1;
  actualizarAniosUltimoPago();
  renderHouses();
}
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
  }).sort((a,b)=>String(a?.calleCorrecta||a?.calle||'').localeCompare(String(b?.calleCorrecta||b?.calle||''),'es-MX',{numeric:true,sensitivity:'base'})||String(a?.numero||'').localeCompare(String(b?.numero||''),'es-MX',{numeric:true}));
  $('financeHouseCount').textContent=filtered.length+' de '+data.viviendas.length+' casas';
  const totalPages=Math.max(1,Math.ceil(filtered.length/HOUSE_PAGE_SIZE));
  housePage=Math.min(Math.max(housePage,1),totalPages);
  const visible=filtered.slice((housePage-1)*HOUSE_PAGE_SIZE,housePage*HOUSE_PAGE_SIZE);
  const houseCell=(label,value)=>'<td data-label="'+label+'"><span class="house-field-value">'+value+'</span></td>';
  $('financeHouseRows').innerHTML=visible.length?visible.map(h=>'<tr>'+
    houseCell('Calle',esc(h.calle))+houseCell('Casa',esc(h.numero))+
    houseCell('Residente',esc(h.nombre))+
    houseCell('Estado','<span class="'+(h.estatus==='SIN CARGOS'?'status-neutral':String(h.estatus||'').toUpperCase()==='PAGADO'?'status-paid':'status-pending')+'">'+esc(h.estatus)+'</span>')+
    houseCell('Pagado','<button type="button" class="house-paid-history" data-paid-history="'+Number(h.casaId)+'" aria-label="Ver historial de pagos de '+esc(h.calle+' '+h.numero)+'"><strong>'+esc(fmt(h.ultimoPago?.monto||0))+'</strong><span>Ver historial</span></button>')+
    houseCell('Último mes pagado',esc(h.ultimoMesPagado?h.ultimoMesPagado.mes+' '+h.ultimoMesPagado.anio:'Sin pago'))+
    houseCell('Saldo pendiente','<span class="house-amount">'+esc(fmt(h.saldoPendiente))+'</span>')+
    houseCell('TAGs',renderHouseTagCell(h))+
    houseCell('Pago',renderHousePayCell(h))+'</tr>').join(''):'<tr><td colspan="9">No hay viviendas que coincidan con estos filtros.</td></tr>';
  $('financePageInfo').textContent=filtered.length ? 'Página '+housePage+' de '+totalPages+' · '+filtered.length+' viviendas' : 'Sin resultados';
  $('financePrev').disabled=housePage===1;
  $('financeNext').disabled=housePage>=totalPages;
 }
 let activePaymentHouse=null;
 let currentPaymentQuote=null;
 let confirmedPaymentTarget=null;
 let quoteSequence=0;
 const paymentModal=$('housePaymentModal');
 const historyModal=$('houseHistoryModal');
 let historySequence=0;
 let historyReturnFocus=null;
 function conceptTitle(type){return {MANTENIMIENTO:'Mantenimiento',EXTRAORDINARIO:'Cuotas extraordinarias',CASA_CLUB:'Casa club'}[type]||type;}
 function debtPeriod(value){
  const match=/^(\d{4})-(\d{2})/.exec(String(value||''));
  return match&&Number(match[2])>=1&&Number(match[2])<=12?
   monthsES[Number(match[2])-1]+' '+match[1]:(value||'Sin período');
 }
 function closeHouseHistory(){
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
  historyModal.hidden=false;
  $('houseHistoryTitle').textContent='Historial de '+conceptTitle(activeConcept).toLowerCase();
  $('houseHistoryAddress').textContent=house.calle+' '+house.numero+' · '+(house.nombre||'Sin residente');
  $('houseHistorySummary').textContent='Consultando pagos y saldos confirmados…';
  $('houseHistoryTimeline').innerHTML='';
  $('houseHistoryDebts').innerHTML='';
  $('houseHistoryClose').focus();
  try{
   const {data:detail}=await request('/pagos-vivienda/'+Number(casaId)+'/historial?concepto='+activeConcept);
   if(seq!==historySequence||historyModal.hidden)return;
   const movements=detail.movimientos||[],debts=detail.deudas||[];
   const total=movements.reduce((n,p)=>n+Number(p.monto||0),0);
   $('houseHistorySummary').innerHTML='<div class="history-stat"><small>Último pago registrado</small><strong>'+esc(fmt(movements[0]?.monto||0))+'</strong></div>'+
    '<div class="history-stat"><small>Total en movimientos</small><strong>'+esc(fmt(total))+'</strong></div>'+
    '<div class="history-stat debt"><small>Saldo pendiente actual</small><strong>'+esc(fmt(detail.saldoPendiente))+'</strong></div>';
   $('houseHistoryTimeline').innerHTML=movements.length?movements.map((p,index)=>{
    const months=(p.periodos||[]).map(x=>x.mes+' '+x.anio);
    return '<article class="history-event"><div class="history-dot" aria-hidden="true"></div><div class="history-event-card">'+
      '<div class="history-event-top"><strong>'+esc(fmt(p.monto))+'</strong><time>'+esc(displayDate(p.fecha))+'</time></div>'+
      '<p class="history-concept">'+esc(conceptTitle(activeConcept))+(p.meses?' · '+p.meses+' '+(p.meses===1?'mes cubierto':'meses cubiertos'):'')+'</p>'+
      (months.length?'<div class="history-months">'+months.map(name=>'<span>'+esc(name)+'</span>').join('')+'</div>':'')+
      (Number(p.recargo)>0?'<p class="history-penalty">Incluye '+esc(fmt(p.recargo))+' de recargo por pago tardío.</p>':'')+
      '<small>'+esc(p.formaPago||'Pago registrado')+(p.referencia?' · Ref. '+esc(p.referencia):'')+'</small></div></article>';
   }).join(''):'<div class="history-empty">Esta vivienda todavía no tiene pagos confirmados de este concepto.</div>';
   $('houseHistoryDebts').innerHTML='<h3>Deudas pendientes ('+debts.length+')</h3>'+
    (debts.length?'<div class="history-debt-list">'+debts.map(d=>'<div class="history-debt"><div><strong>'+esc(d.concepto||conceptTitle(activeConcept))+'</strong><small>'+esc(debtPeriod(d.periodo))+(d.estado==='EN_REVISION'?' · Comprobante en revisión':'')+'</small></div><div><b>'+esc(fmt(d.monto))+'</b>'+
      (Number(d.recargo)>0?'<small>Incluye '+esc(fmt(d.recargo))+' de recargo por atraso</small>':'')+'</div></div>').join('')+'</div>':'<p class="history-paid-up">Sin deudas pendientes actualmente.</p>');
  }catch(error){
   if(seq===historySequence)$('houseHistorySummary').textContent='No fue posible consultar el historial: '+error.message;
  }
 }
 $('houseHistoryClose').addEventListener('click',closeHouseHistory);
 historyModal.addEventListener('click',e=>{if(e.target===historyModal)closeHouseHistory();});
 document.addEventListener('keydown',e=>{if(e.key==='Escape'&&!historyModal.hidden)closeHouseHistory();});
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
  const items=otherConcepts[type]||[];
  $('houseConceptSelect').innerHTML=items.length?items.map(c=>'<option value="'+Number(c.id)+'">'+esc(c.concepto)+' · '+esc(c.periodo)+' · '+esc(fmt(c.monto))+(c.estado==='EN_REVISION'?' · Comprobante en revisión':'')+'</option>').join(''):'<option value="">Sin cobros disponibles</option>';
  previewOtherConcept();
 }
 function previewOtherConcept(){
  const type=$('housePaymentType').value;
  const item=(otherConcepts[type]||[]).find(c=>String(c.id)===$('houseConceptSelect').value);
  $('housePaymentAmount').value=item?Number(item.monto).toFixed(2):'';
  $('housePaymentAmount').readOnly=true;
  $('housePaymentSubmit').disabled=!item||item.estado==='EN_REVISION';
  $('housePaymentPreview').textContent=item?(item.estado==='EN_REVISION'?'Ya existe un comprobante en revisión. Espera la respuesta de Administración.':'Se registrará '+fmt(item.monto)+' de '+item.concepto+' ('+item.periodo+'). Este concepto NO modifica los TAGs.'):'No hay conceptos pendientes en esta categoría.';
 }
 async function switchPaymentType(){
  const other=isOther();
  document.querySelectorAll('[data-maintenance-only]').forEach(el=>el.hidden=other);
  $('houseConceptWrap').hidden=!other;
  $('housePaymentTitle').textContent=other?'Registrar '+( $('housePaymentType').value==='CASA_CLUB'?'Casa club':'cuota extraordinaria'):'Registrar mensualidades pagadas';
  $('housePaymentYear').required=!other;
  if(!other){$('housePaymentAmount').readOnly=false;void quoteHousePayment();return;}
  $('housePaymentSubmit').disabled=true;
  $('housePaymentPreview').textContent='Consultando cargos de la vivienda…';
  try{otherConcepts=(await request('/pagos-concepto/'+Number(activePaymentHouse.casaId))).data;renderOtherConcept();}
  catch(e){$('housePaymentPreview').textContent=e.message;}
 }
 const monthsES=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
 function paymentPreview(){
   if(isOther()){previewOtherConcept();return;}
   const output=$('housePaymentPreview'),submit=$('housePaymentSubmit');
   submit.disabled=true;
   if(!currentPaymentQuote){output.textContent='Consultando el historial de cuotas…';return;}
   const q=currentPaymentQuote;
   const total=Number($('housePaymentAmount').value);
   const valid=Number.isFinite(total)&&Math.round(total*100)>=q.meses*30000 &&
     Math.round(total*100)<=q.meses*35000;
   const names=q.periodos.map(p=>p.mes+' '+p.anio);
   const errors=q.periodos.filter(p=>!p.registrable).map(p=>p.mes+' '+p.anio+': '+p.motivo);
   output.textContent='Mensualidades: '+names.join(', ')+'. Total sugerido: '+fmt(q.montoSugerido)+
     '. Importe recibido: '+(Number.isFinite(total)?fmt(total):'inválido')+
     '. Fecha final solicitada para todos los TAGs: '+q.fechaFinObjetivo+'.'+
     (!valid?' El monto para '+q.meses+' meses debe estar entre '+fmt(q.meses*300)+' y '+fmt(q.meses*350)+'.':'')+
     (errors.length?' BLOQUEADO: '+errors.join(' | '):'');
   submit.disabled=!valid||q.bloqueado||(q.requiereRevision&&!$('housePaymentReview').checked);
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
     $('houseLastPayment').textContent='Último mes completamente pagado: '+
       (q.ultimoMesPagado?q.ultimoMesPagado.mes+' '+q.ultimoMesPagado.anio:
         'sin pago anterior confirmado en el historial')+
       '. Meses a cobrar: '+q.meses+' ('+q.desde.nombre+' '+q.desde.anio+' a '+
       q.hasta.nombre+' '+q.hasta.anio+').';
     $('housePaymentCount').value=String(q.meses);
     if(resetAmount)$('housePaymentAmount').value=Number(q.montoSugerido).toFixed(2);
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
   $('housePaymentStatus').textContent='';
   paymentModal.hidden=false;
   switchPaymentType();
   $('housePaymentMonth').focus();
   if(activeConcept!=='MANTENIMIENTO')$('houseConceptSelect').focus();
 }
 function closeHousePayment(){
   ++quoteSequence;
   confirmedPaymentTarget=null;
   paymentModal.hidden=true;
   activePaymentHouse=null;
   currentPaymentQuote=null;
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
    if(!activePaymentHouse||!item||item.estado==='EN_REVISION')return;
    if(!confirm('¿Confirmas que recibiste '+fmt(item.monto)+' de '+activePaymentHouse.calle+' '+activePaymentHouse.numero+' para '+item.concepto+'?'))return;
    $('housePaymentSubmit').disabled=true;
    try{
     const result=await request('/pagos-concepto',{casaId:Number(activePaymentHouse.casaId),tipoPago:type,conceptoId:Number(item.id),monto:Number(item.monto),formaPago:$('housePaymentMethod').value});
     closeHousePayment();notice(result.message+' Referencia: '+result.data.referencia,'success');await load();
    }catch(e){$('housePaymentStatus').textContent=e.message;await switchPaymentType();}
    return;
   }
   if(!activePaymentHouse||!currentPaymentQuote||Number($('housePaymentYear').value)<mexicoYear())return;
   const payload={casaId:Number(activePaymentHouse.casaId),
     anio:Number($('housePaymentYear').value),mes:Number($('housePaymentMonth').value),
     mesesEsperados:currentPaymentQuote.meses,montoTotal:Number($('housePaymentAmount').value),
     formaPago:$('housePaymentMethod').value,confirmarHistorico:$('housePaymentReview').checked};
   if(!confirm('¿Confirmas que recibiste '+fmt(payload.montoTotal)+' de '+
     activePaymentHouse.calle+' '+activePaymentHouse.numero+' para '+
     currentPaymentQuote.periodos.map(p=>p.mes+' '+p.anio).join(', ')+
     '?\nSe guardarán '+currentPaymentQuote.meses+' cuotas y se solicitará fecha final '+
     currentPaymentQuote.fechaFinObjetivo+' en todos sus TAGs.'))return;
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
     notice(message,'success');
     try{
       await load();
     }catch(refreshError){
       notice(message+' El pago sí quedó registrado, pero no fue posible actualizar la tabla: '+
         refreshError.message+'. Actualiza la página para consultar los datos nuevos.','success');
     }
   }catch(error){
     $('housePaymentStatus').textContent=error.message;
     await quoteHousePayment({resetAmount:false});
     // Preservar el error después de refrescar la cotización.
     $('housePaymentStatus').textContent=error.message;
   }finally{btn.disabled=true;}
 }
 $('financeHouseRows').addEventListener('click',event=>{
  const historyButton=event.target.closest('[data-paid-history]');
  if(historyButton){void openHouseHistory(historyButton.dataset.paidHistory,historyButton);return;}
  const tagButton=event.target.closest('[data-tags-house]');
  if(tagButton){openHouseTags(tagButton.dataset.tagsHouse);return;}
  const btn=event.target.closest('[data-pay-house]');
  if(btn)openHousePayment(btn.dataset.payHouse);
 });
 $('housePaymentClose').addEventListener('click',closeHousePayment);
 paymentModal.addEventListener('click',event=>{if(event.target===paymentModal)closeHousePayment();});
 document.addEventListener('keydown',event=>{if(event.key==='Escape'&&!paymentModal.hidden)closeHousePayment();});
 $('housePaymentForm').addEventListener('submit',submitHousePayment);
 $('housePaymentRefreshC3').addEventListener('click',refreshHousePaymentC3);
 for(const id of ['housePaymentMonth','housePaymentYear'])
  $(id).addEventListener('change',()=>quoteHousePayment());
 $('housePaymentAmount').addEventListener('input',paymentPreview);
 $('housePaymentType').addEventListener('change',switchPaymentType);
 $('houseConceptSelect').addEventListener('change',previewOtherConcept);
 $('housePaymentReview').addEventListener('change',paymentPreview);
 async function load(){
  $('updateFinance').disabled=true;$('financeNotice').hidden=true;
  try{
   const year=Number($('financeYear').value),month=Number($('financeMonth').value);
   const response=await request('/analisis?anio='+year+'&mes='+month);
   data=response.data;
   data.viviendasMantenimiento=data.viviendas;
   if(activeConcept!=='MANTENIMIENTO'&&!Array.isArray(data.viviendasConceptos?.[activeConcept]))activeConcept='MANTENIMIENTO';
   render();
   elegirConcepto(activeConcept);
  }catch(e){notice(e.message);}
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
 $('expenseFilterConcept').addEventListener('input',renderExpenses);
 for(const id of ['expenseFilterCategory','expenseFilterFrom','expenseFilterTo','expenseSort'])
  $(id).addEventListener('change',renderExpenses);
 $('expenseClearFilters').addEventListener('click',()=>{
  for(const id of ['expenseFilterConcept','expenseFilterCategory','expenseFilterFrom','expenseFilterTo'])$(id).value='';
  expenseDateInputs.forEach(syncExpenseDateDisplay);
  $('expenseSort').value='fecha_desc';
  renderExpenses();
 });
 let historicalExtraId=null;
 $('financeExpenseRows').addEventListener('click',event=>{
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
 for(const id of ['financeSearch','financeStreet','financeStatus','financeLastPaidMonth','financeLastPaidYear'])
  $(id).addEventListener(id==='financeSearch'?'input':'change',()=>{housePage=1;renderHouses();});
 $('financePrev').addEventListener('click',()=>{housePage=Math.max(1,housePage-1);renderHouses();});
 $('financeNext').addEventListener('click',()=>{housePage++;renderHouses();});
 $('financeClear').addEventListener('click',()=>{
  ['financeSearch','financeStreet','financeStatus','financeLastPaidMonth'].forEach(id=>$(id).value='');
  $('financeLastPaidYear').value=String(moment.getFullYear());
  housePage=1;renderHouses();
 });
 $('newExpense').addEventListener('submit',async e=>{
  e.preventDefault();
  const body={fecha:$('expenseDate').value,categoria:$('expenseCategory').value,
   monto:Number($('expenseAmount').value),concepto:$('expenseConcept').value.trim()};
  if(body.categoria==='CUOTA_EXTRAORDINARIA'){
   body.meses=Number($('expenseMonths').value);body.fechaInicio=$('expenseStart').value+'-01';
   if(!Number.isInteger(body.meses)||body.meses<1||body.meses>36||!/^20\d{2}-(0[1-9]|1[0-2])-01$/.test(body.fechaInicio))return notice('Selecciona de 1 a 36 meses y el primer mes de cobro.');
  }
  if(!confirm('¿Confirmas este egreso de '+fmt(body.monto)+' por '+body.concepto+'?'))return;
  $('saveExpense').disabled=true;
  try{
   const saved=await request('/egresos',body);
   $('newExpense').reset();
   syncExtraExpense();
   $('expenseDate').value=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
   expenseDateInputs.forEach(syncExpenseDateDisplay);
   await load();
   notice('Egreso registrado correctamente. Referencia: '+(saved.referencia||'generada'));
  }
  catch(e){notice(e.message);}
  finally{$('saveExpense').disabled=false;}
 });
 await load();
})();
