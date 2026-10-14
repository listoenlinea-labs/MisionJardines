(async()=>{
 if(!await window.MJAccessReady)return;
 const $=id=>document.getElementById(id);
 const API=window.MJ_API_URL||'https://api-misionjardines.listoenlinea.host/api';
 const token=localStorage.getItem('misionJardinesToken')||sessionStorage.getItem('misionJardinesToken');
 const fmt=n=>Number(n||0).toLocaleString('es-MX',{style:'currency',currency:'MXN'});
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
 const moment=new Date();$('financeYear').value=moment.getFullYear();$('financeMonth').value=String(moment.getMonth()+1);
 $('expenseDate').value=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(moment);
 let data=null;
 let housePage=1;
 const HOUSE_PAGE_SIZE=12;
 const notice=(msg)=>{const el=$('financeNotice');el.textContent=msg;el.hidden=false;};
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
  $('financeExpenseRows').innerHTML=result.length?result.map(e=>'<tr><td data-label="Fecha">'+esc(e.fecha)+'</td><td data-label="Categoría">'+esc(e.categoria)+'</td><td data-label="Concepto">'+esc(e.concepto)+'</td><td data-label="Referencia">'+esc(e.referencia||'—')+'</td><td data-label="Monto">'+fmt(e.monto)+'</td></tr>').join(''):
    '<tr><td colspan="5">'+(egresos.length?'No hay egresos que coincidan con los filtros.':'No hay egresos registrados para este mes.')+'</td></tr>';
 }
 function renderHouses(){
  if(!data)return;
  const query=$('financeSearch').value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),
    street=$('financeStreet').value,status=$('financeStatus').value;
  const filtered=data.viviendas.filter(h=>{
   const hay=[h.calle,h.numero,h.nombre].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
   return (!query||hay.includes(query))&&(!street||h.calle===street)&&(!status||(status==='PAGADO'?h.pagada:!h.pagada));
  }).sort((a,b)=>String(a?.calleCorrecta||a?.calle||'').localeCompare(String(b?.calleCorrecta||b?.calle||''),'es-MX',{numeric:true,sensitivity:'base'})||String(a?.numero||'').localeCompare(String(b?.numero||''),'es-MX',{numeric:true}));
  $('financeHouseCount').textContent=filtered.length+' de '+data.viviendas.length+' casas';
  const totalPages=Math.max(1,Math.ceil(filtered.length/HOUSE_PAGE_SIZE));
  housePage=Math.min(Math.max(housePage,1),totalPages);
  const visible=filtered.slice((housePage-1)*HOUSE_PAGE_SIZE,housePage*HOUSE_PAGE_SIZE);
  $('financeHouseRows').innerHTML=visible.length?visible.map(h=>'<tr><td data-label="Calle">'+esc(h.calle)+'</td><td data-label="Casa">'+esc(h.numero)+'</td><td data-label="Residente">'+esc(h.nombre)+'</td><td data-label="Estado"><span class="'+(h.pagada?'status-paid':'status-pending')+'">'+esc(h.estatus)+'</span></td><td data-label="Pagado"><span class="house-amount">'+fmt(h.montoPagado)+'</span></td><td data-label="Saldo pendiente"><span class="house-amount">'+fmt(h.saldoPendiente)+'</span></td><td data-label="Acción"><button type="button" class="soft house-payment-button" data-pay-house="'+Number(h.casaId)+'">Registrar pago</button></td></tr>').join(''):'<tr><td colspan="7">No hay viviendas que coincidan con estos filtros.</td></tr>';
  $('financePageInfo').textContent=filtered.length ? 'Página '+housePage+' de '+totalPages+' · '+filtered.length+' viviendas' : 'Sin resultados';
  $('financePrev').disabled=housePage===1;
  $('financeNext').disabled=housePage>=totalPages;
 }
 let activePaymentHouse=null;
 let currentPaymentQuote=null;
 let quoteSequence=0;
 const paymentModal=$('housePaymentModal');
 const monthsES=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
 function paymentPreview(){
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
   if(!activePaymentHouse)return;
   const seq=++quoteSequence;
   currentPaymentQuote=null;
   $('housePaymentCount').value='0';
   $('houseLastPayment').textContent='Consultando el último mes pagado en MySQL…';
   $('housePaymentStatus').textContent='';
   $('housePaymentReviewWrap').hidden=true;
   $('housePaymentReview').checked=false;
   paymentPreview();
   const year=Number($('housePaymentYear').value),month=Number($('housePaymentMonth').value);
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
     $('houseLastPayment').textContent='No se pudo obtener el historial de esta vivienda.';
     $('housePaymentPreview').textContent=error.message;
     $('housePaymentSubmit').disabled=true;
   }
 }
 function openHousePayment(casaId){
   const house=data?.viviendas?.find(h=>Number(h.casaId)===Number(casaId));
   if(!house)return;
   activePaymentHouse=house;
   $('housePaymentHouse').textContent=house.calle+' '+house.numero+' · '+(house.nombre||'Sin residente registrado');
   $('housePaymentYear').value=$('financeYear').value;
   $('housePaymentMonth').value=$('financeMonth').value;
   $('housePaymentCount').value='0';
   $('housePaymentAmount').value='';
   $('housePaymentMethod').value='EFECTIVO';
   $('housePaymentStatus').textContent='';
   paymentModal.hidden=false;
   quoteHousePayment();
   $('housePaymentMonth').focus();
 }
 function closeHousePayment(){
   ++quoteSequence;
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
     const target=currentPaymentQuote?.fechaFinObjetivo;
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
   if(!activePaymentHouse||!currentPaymentQuote)return;
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
     const message=result.message+' Referencia: '+result.data.referencia+
       '. Revisa después el estado físico del C3.';
     await load();
     // Conservar la información de la operación aunque la nueva cotización
     // indique que el período ya está cubierto.
     $('housePaymentStatus').textContent=message;
     currentPaymentQuote=null;
     $('housePaymentPreview').textContent='Movimiento guardado: '+result.data.periodos.join(', ')+
       ' · '+fmt(result.data.total)+' · Fecha final solicitada: '+result.data.fechaFinObjetivo;
     $('housePaymentSubmit').disabled=true;
   }catch(error){
     $('housePaymentStatus').textContent=error.message;
     await quoteHousePayment({resetAmount:false});
     // Preservar el error después de refrescar la cotización.
     $('housePaymentStatus').textContent=error.message;
   }finally{btn.disabled=true;}
 }
 $('financeHouseRows').addEventListener('click',event=>{
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
 $('housePaymentReview').addEventListener('change',paymentPreview);
 async function load(){
  $('updateFinance').disabled=true;$('financeNotice').hidden=true;
  try{
   const year=Number($('financeYear').value),month=Number($('financeMonth').value);
   const response=await request('/analisis?anio='+year+'&mes='+month);
   data=response.data;render();
  }catch(e){notice(e.message);}
  finally{$('updateFinance').disabled=false;}
 }
 $('updateFinance').addEventListener('click',load);
 $('expenseFilterConcept').addEventListener('input',renderExpenses);
 for(const id of ['expenseFilterCategory','expenseFilterFrom','expenseFilterTo','expenseSort'])
  $(id).addEventListener('change',renderExpenses);
 $('expenseClearFilters').addEventListener('click',()=>{
  for(const id of ['expenseFilterConcept','expenseFilterCategory','expenseFilterFrom','expenseFilterTo'])$(id).value='';
  $('expenseSort').value='fecha_desc';
  renderExpenses();
 });
 for(const id of ['financeSearch','financeStreet','financeStatus'])$(id).addEventListener(id==='financeSearch'?'input':'change',()=>{housePage=1;renderHouses();});
 $('financePrev').addEventListener('click',()=>{housePage=Math.max(1,housePage-1);renderHouses();});
 $('financeNext').addEventListener('click',()=>{housePage++;renderHouses();});
 $('financeClear').addEventListener('click',()=>{
  ['financeSearch','financeStreet','financeStatus'].forEach(id=>$(id).value='');housePage=1;renderHouses();
 });
 $('newExpense').addEventListener('submit',async e=>{
  e.preventDefault();
  const body={fecha:$('expenseDate').value,categoria:$('expenseCategory').value,
   monto:Number($('expenseAmount').value),concepto:$('expenseConcept').value.trim()};
  if(!confirm('¿Confirmas este egreso de '+fmt(body.monto)+' por '+body.concepto+'?'))return;
  $('saveExpense').disabled=true;
  try{
   const saved=await request('/egresos',body);
   $('newExpense').reset();
   $('expenseDate').value=new Intl.DateTimeFormat('sv-SE',{timeZone:'America/Mexico_City',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
   await load();
   notice('Egreso registrado correctamente. Referencia: '+(saved.referencia||'generada'));
  }
  catch(e){notice(e.message);}
  finally{$('saveExpense').disabled=false;}
 });
 await load();
})();
