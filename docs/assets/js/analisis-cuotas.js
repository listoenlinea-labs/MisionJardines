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
 const paymentModal=$('housePaymentModal');
 const monthsES=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
 function paymentPreview(){
  const year=Number($('housePaymentYear').value);
  const month=Number($('housePaymentMonth').value);
  const count=Number($('housePaymentCount').value);
  const amount=Number($('housePaymentAmount').value);
  const output=$('housePaymentPreview');
  if(!Number.isInteger(year)||year<2026||year>2098||!Number.isInteger(month)||month<1||month>12||!Number.isInteger(count)||count<1||count>36){
   output.textContent='Selecciona año, mes y de 1 a 36 mensualidades válidas.';return;
  }
  const first=new Date(Date.UTC(year,month-1,1));
  const last=new Date(Date.UTC(year,month-2+count,1));
  const end=new Date(Date.UTC(year,month-1+count,1));
  const cutoff=end.getUTCFullYear()+'-'+String(end.getUTCMonth()+1).padStart(2,'0')+'-10';
  output.textContent='Período: '+monthsES[first.getUTCMonth()]+' '+first.getUTCFullYear()+' a '+monthsES[last.getUTCMonth()]+' '+last.getUTCFullYear()+
   ' · Total: '+fmt(count*amount)+' · Vigencia solicitada para todos los TAGs: '+cutoff;
 }
 function openHousePayment(casaId){
  const house=data?.viviendas?.find(h=>Number(h.casaId)===Number(casaId));
  if(!house)return;
  activePaymentHouse=house;
  $('housePaymentHouse').textContent=house.calle+' '+house.numero+' · '+(house.nombre||'Sin residente registrado');
  $('housePaymentYear').value=$('financeYear').value;
  $('housePaymentMonth').value=$('financeMonth').value;
  $('housePaymentCount').value='1';
  $('housePaymentAmount').value='300';
  $('housePaymentMethod').value='EFECTIVO';
  $('housePaymentStatus').textContent='';
  paymentPreview();
  paymentModal.hidden=false;
  $('housePaymentMonth').focus();
 }
 function closeHousePayment(){
  paymentModal.hidden=true;
  activePaymentHouse=null;
 }
 async function refreshHousePaymentC3(){
  if(!activePaymentHouse)return;
  const el=$('housePaymentStatus'),btn=$('housePaymentRefreshC3');
  btn.disabled=true;el.textContent='Consultando sincronización del controlador…';
  try{
   const result=await request('/pagos-vivienda/'+Number(activePaymentHouse.casaId)+'/estado-c3');
   const state=result.data;
   const distinct=[...new Set((state.fechasTags||[]).map(t=>t.fechaFinal||'Sin fecha'))];
   el.textContent=state.tags?
    'ZKTeco: '+(state.sincronizacion||'Sin estado')+' · '+state.tags+' TAG(s) · '+(state.fechaFinal?'Fecha común: '+state.fechaFinal:'Fechas diferentes o pendientes: '+distinct.join(', '))+
    (state.errorSincronizacion?' · Problema: '+state.errorSincronizacion:'') :
    'Esta vivienda no tiene TAGs asociados; no puede sincronizarse el C3.';
  }catch(error){el.textContent='No fue posible comprobar el controlador: '+error.message;}
  finally{btn.disabled=false;}
 }
 async function submitHousePayment(event){
  event.preventDefault();
  if(!activePaymentHouse)return;
  const payload={casaId:Number(activePaymentHouse.casaId),anio:Number($('housePaymentYear').value),
   mes:Number($('housePaymentMonth').value),meses:Number($('housePaymentCount').value),
   importeMes:Number($('housePaymentAmount').value),formaPago:$('housePaymentMethod').value};
  const confirmation=$('housePaymentPreview').textContent;
  if(!confirm('¿Confirmas el pago de '+activePaymentHouse.calle+' '+activePaymentHouse.numero+'?\n'+confirmation+
    '\nSe registrarán las cuotas y se solicitará la sincronización física de sus TAGs.'))return;
  const btn=$('housePaymentSubmit');btn.disabled=true;
  $('housePaymentStatus').textContent='Registrando mensualidades…';
  try{
   const result=await request('/pagos-vivienda',payload);
   $('housePaymentStatus').textContent=result.message+' Referencia: '+result.data.referencia;
   // Se actualiza el resumen financiero con los pagos persistidos.
   await load();
   // El estado físico requiere confirmación independiente, nunca se asume éxito.
   await refreshHousePaymentC3();
  }catch(e){$('housePaymentStatus').textContent=e.message;}
  finally{btn.disabled=false;}
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
 for(const id of ['housePaymentMonth','housePaymentYear','housePaymentCount','housePaymentAmount'])
  $(id).addEventListener('change',paymentPreview);
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
