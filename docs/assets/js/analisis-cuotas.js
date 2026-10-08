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
  $('financialSummary').innerHTML=[
   ['Casas en padrón',houses],['Pagadas',data.pagadas+' · '+data.porcentaje+'%'],
   ['Pendientes',data.pendientes],['Ingresos validados',fmt(data.ingresosValidados)],
   ['Mantenimiento bancario validado',fmt(data.ingresosReportados.mantenimiento)],
   ['Extraordinarios validados',fmt(data.ingresosReportados.extraordinarios)],
   ['Egresos registrados',fmt(data.totalEgresos)],['Saldo parcial conciliable',fmt(data.balanceReportado)]
  ].map(([n,v])=>financialCard(n,v)).join('');
  $('financeDonut').style.setProperty('--percent',data.porcentaje+'%');
  $('financeDonutText').innerHTML=esc(data.porcentaje)+'%<small>Casas pagadas</small>';
  $('financeLegend').innerHTML='<div>Pagadas <b>'+data.pagadas+'</b></div><div>Pendientes <b>'+data.pendientes+'</b></div><div>Total <b>'+houses+'</b></div>';
  $('financeStreetChart').innerHTML=data.calles.length?data.calles.map(c=>bar(c.calle,c.porcentaje,100,false,c.pagadas+'/'+c.total)).join(''):'Sin datos';
  const cash=[['Mantenimiento',data.ingresosReportados.mantenimiento],['Extraordinarios',data.ingresosReportados.extraordinarios],['Egresos',data.totalEgresos]];
  const max=Math.max(1,...cash.map(x=>x[1]));
  $('financeCashChart').innerHTML=cash.map(([n,v],i)=>'<div class="money-row"><strong>'+esc(n)+'</strong><div class="track"><div class="fill '+(i===2?'cost':'')+'" style="width:'+(v/max*100).toFixed(2)+'%"></div></div><strong>'+esc(fmt(v))+'</strong></div>').join('')+
    '<div class="hint">Abonos anotados en tabla de cuotas (sin duplicar en ingresos): <b>'+fmt(data.cobrosCuotasRegistrados)+'</b></div>';
  $('financeWarning').textContent=data.avisoConciliacion;
  const cat=Object.entries(data.egresosCategorias);
  const maxCategory=Math.max(1,...cat.map(([,v])=>v));
  $('financeExpenseChart').innerHTML=cat.map(([n,v])=>bar(n,v,maxCategory,true,fmt(v))).join('');
  $('financeExpenseRows').innerHTML=data.egresos.length?data.egresos.map(e=>'<tr><td>'+esc(e.fecha)+'</td><td>'+esc(e.categoria)+'</td><td>'+esc(e.concepto)+'</td><td>'+esc(e.referencia||'—')+'</td><td>'+fmt(e.monto)+'</td></tr>').join(''):'<tr><td colspan="5">No hay egresos registrados para este mes.</td></tr>';
  const select=$('financeStreet'),selected=select.value;
  select.innerHTML='<option value="">Todas las calles</option>'+data.calles.map(c=>'<option value="'+esc(c.calle)+'">'+esc(c.calle)+'</option>').join('');
  select.value=data.calles.some(x=>x.calle===selected)?selected:'';
  renderHouses();
 }
 function renderHouses(){
  if(!data)return;
  const query=$('financeSearch').value.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),
    street=$('financeStreet').value,status=$('financeStatus').value;
  const filtered=data.viviendas.filter(h=>{
   const hay=[h.calle,h.numero,h.nombre].join(' ').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
   return (!query||hay.includes(query))&&(!street||h.calle===street)&&(!status||(status==='PAGADO'?h.pagada:!h.pagada));
  });
  $('financeHouseCount').textContent=filtered.length+' de '+data.viviendas.length+' casas';
  $('financeHouseRows').innerHTML=filtered.length?filtered.map(h=>'<tr><td>'+esc(h.calle)+'</td><td>'+esc(h.numero)+'</td><td>'+esc(h.nombre)+'</td><td><span class="'+(h.pagada?'status-paid':'status-pending')+'">'+esc(h.estatus)+'</span></td><td>'+fmt(h.montoPagado)+'</td><td>'+fmt(h.saldoPendiente)+'</td></tr>').join(''):'<tr><td colspan="6">No hay viviendas que coincidan con estos filtros.</td></tr>';
 }
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
 for(const id of ['financeSearch','financeStreet','financeStatus'])$(id).addEventListener(id==='financeSearch'?'input':'change',renderHouses);
 $('financeClear').addEventListener('click',()=>{
  ['financeSearch','financeStreet','financeStatus'].forEach(id=>$(id).value='');renderHouses();
 });
 $('newExpense').addEventListener('submit',async e=>{
  e.preventDefault();
  const body={fecha:$('expenseDate').value,categoria:$('expenseCategory').value,
   monto:Number($('expenseAmount').value),concepto:$('expenseConcept').value.trim(),referencia:$('expenseReference').value.trim()};
  if(!confirm('¿Confirmas este egreso de '+fmt(body.monto)+' por '+body.concepto+'?'))return;
  $('saveExpense').disabled=true;
  try{await request('/egresos',body);$('newExpense').reset();notice('Egreso registrado.');await load();}
  catch(e){notice(e.message);}
  finally{$('saveExpense').disabled=false;}
 });
 await load();
})();
